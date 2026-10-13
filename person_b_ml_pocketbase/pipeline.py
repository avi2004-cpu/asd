"""Validate on-device session features, score them, and save results."""

import datetime
import math
import os
import tempfile

import joblib
import numpy as np

import pb_client
from fusion import FEATURE_NAMES, build_feature_vector
from heatmap import generate_gaze_heatmap

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.joblib")
clf = joblib.load(MODEL_PATH)
if clf.n_features_in_ != len(FEATURE_NAMES):
    raise RuntimeError(
        f"model.joblib expects {clf.n_features_in_} features but fusion.py builds "
        f"{len(FEATURE_NAMES)}; rerun train_classifier.py"
    )

MODEL_VERSION = "v0.2-prototype-unvalidated-ondevice"
MAX_FEATURE_SAMPLES = 1000


class InvalidFeatures(ValueError):
    """Raised when a session has no supported, well-formed feature payload."""


def _is_unit_value(value) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
        and 0.0 <= float(value) <= 1.0
    )


def parse_features(raw) -> tuple[list[float], list[tuple[float, float]]]:
    """Validate schema v1 and return expression values and gaze points."""
    if (
        not isinstance(raw, dict)
        or type(raw.get("schemaVersion")) is not int
        or raw.get("schemaVersion") != 1
    ):
        raise InvalidFeatures("features missing or unsupported schemaVersion")

    raw_expression = raw.get("expressionValues", [])
    raw_gaze = raw.get("gazePoints", [])
    if not isinstance(raw_expression, list) or not isinstance(raw_gaze, list):
        raise InvalidFeatures("expressionValues and gazePoints must be arrays")
    if len(raw_expression) > MAX_FEATURE_SAMPLES or len(raw_gaze) > MAX_FEATURE_SAMPLES:
        raise InvalidFeatures("feature sample count exceeds the supported limit")

    expression = [float(value) for value in raw_expression if _is_unit_value(value)]
    gaze = [
        (float(point[0]), float(point[1]))
        for point in raw_gaze
        if isinstance(point, (list, tuple))
        and len(point) == 2
        and _is_unit_value(point[0])
        and _is_unit_value(point[1])
    ]
    return expression, gaze


def _legacy_feature_payload(session_record: dict):
    """Adapt already-uploaded feature samples from the preceding app build."""
    samples = session_record.get("featureSamples")
    if not isinstance(samples, list):
        if session_record.get("framesUploaded"):
            raise InvalidFeatures(
                "session has raw frames but no client feature vector; re-upload from the updated app"
            )
        return {
            "schemaVersion": 1,
            "expressionValues": [],
            "gazePoints": [],
            "framesSeen": 0,
            "framesWithFace": 0,
            "expressionSource": "none",
            "extractorVersion": "legacy-no-camera",
        }

    expressions = []
    gaze_points = []
    for sample in samples:
        if not isinstance(sample, dict):
            continue
        score = sample.get("expressionScore")
        gaze = sample.get("gazePoint")
        if _is_unit_value(score):
            expressions.append(float(score))
        if (
            isinstance(gaze, (list, tuple))
            and len(gaze) == 2
            and _is_unit_value(gaze[0])
            and _is_unit_value(gaze[1])
        ):
            gaze_points.append([float(gaze[0]), float(gaze[1])])
    return {
        "schemaVersion": 1,
        "expressionValues": expressions,
        "gazePoints": gaze_points,
        "framesSeen": len(samples),
        "framesWithFace": len(gaze_points),
        "expressionSource": "legacy-server-extraction",
        "extractorVersion": "legacy-feature-samples",
    }


def _normalize_interactions(raw_events) -> list[dict]:
    if raw_events is None:
        return []
    if not isinstance(raw_events, list):
        raise InvalidFeatures("interactionEvents must be an array")
    events = []
    for event in raw_events:
        if not isinstance(event, dict):
            continue
        response_time = event.get("responseTimeMs", 0)
        if not (
            isinstance(response_time, (int, float))
            and not isinstance(response_time, bool)
            and math.isfinite(float(response_time))
            and response_time >= 0
        ):
            response_time = 0
        events.append({"responseTimeMs": float(response_time)})
    return events


def _build_insight(risk_score, gaze_metrics, interaction_metrics):
    level = "low" if risk_score < 0.33 else "moderate" if risk_score < 0.66 else "elevated"
    return (
        f"This session shows a {level} composite risk signal "
        f"({risk_score * 100:.0f}%). Average tap response time was "
        f"{interaction_metrics['avgResponseTimeMs']:.0f}ms across "
        f"{interaction_metrics['tapCount']} interactions, with "
        f"{gaze_metrics['sampledPoints']} gaze samples captured. "
        "This is a prototype output only and is not a clinical assessment."
    )


def score_vector(expression_values, gaze_points, interaction_events) -> float:
    vector = build_feature_vector(expression_values, gaze_points, interaction_events)
    if vector.shape != (len(FEATURE_NAMES),):
        raise RuntimeError("Feature fusion returned an incompatible model input shape.")
    return float(clf.predict_proba(vector.reshape(1, -1))[0][1])


def process_session(session_record: dict):
    session_id = session_record["sessionId"]
    if pb_client.result_exists(session_id):
        print(f"Session {session_id} already scored, skipping.")
        return

    raw_features = session_record.get("features")
    if raw_features is None:
        raw_features = _legacy_feature_payload(session_record)
    expression_values, gaze_points = parse_features(raw_features)
    interaction_events = _normalize_interactions(session_record.get("interactionEvents"))
    risk_score = score_vector(expression_values, gaze_points, interaction_events)

    response_times = [event["responseTimeMs"] for event in interaction_events]
    interaction_metrics = {
        "tapCount": len(interaction_events),
        "avgResponseTimeMs": round(float(np.mean(response_times)) if response_times else 0.0, 1),
    }
    gaze_metrics = {
        "sampledPoints": len(gaze_points),
        "avgGazeX": round(float(np.mean([point[0] for point in gaze_points])), 3)
        if gaze_points
        else None,
        "avgGazeY": round(float(np.mean([point[1] for point in gaze_points])), 3)
        if gaze_points
        else None,
    }
    expression_scores = {
        f"frame_{index + 1}": round(value, 3)
        for index, value in enumerate(expression_values)
    }

    heatmap_path = None
    try:
        if gaze_points:
            with tempfile.NamedTemporaryFile(suffix="_heatmap.png", delete=False) as handle:
                heatmap_path = handle.name
            generate_gaze_heatmap(gaze_points, heatmap_path)

        metadata = raw_features if isinstance(raw_features, dict) else {}
        pb_client.create_result_record(
            {
                "sessionId": session_id,
                "riskScore": round(risk_score, 3),
                "features": {
                    "expressionScores": expression_scores,
                    "gazeProxyMetrics": gaze_metrics,
                    "interactionMetrics": interaction_metrics,
                    "extractor": {
                        "version": metadata.get("extractorVersion"),
                        "expressionSource": metadata.get("expressionSource"),
                        "framesSeen": metadata.get("framesSeen"),
                        "framesWithFace": metadata.get("framesWithFace"),
                    },
                },
                "modelVersion": MODEL_VERSION,
                "scoredAt": datetime.datetime.now(datetime.timezone.utc)
                .isoformat()
                .replace("+00:00", "Z"),
                "aiInsight": _build_insight(risk_score, gaze_metrics, interaction_metrics),
            },
            heatmap_path=heatmap_path,
        )
    finally:
        if heatmap_path and os.path.exists(heatmap_path):
            os.remove(heatmap_path)
    print(f"Scored session {session_id}: risk={risk_score:.2f}")
