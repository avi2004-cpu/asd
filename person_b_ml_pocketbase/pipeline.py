"""
Core scoring pipeline (PocketBase version). Given a PocketBase "sessions"
record, this downloads frames, extracts features, scores, and writes a
"results" record — same logic as the Firebase version, different backend.
"""

import datetime

import cv2
import joblib
import numpy as np

import pb_client
from feature_extraction import extract_expression_score, extract_gaze_point
from fusion import build_feature_vector
from heatmap import generate_gaze_heatmap

clf = joblib.load("model.joblib")  # run train_classifier.py first to create this


def _decode_frame(raw_bytes: bytes):
    arr = np.frombuffer(raw_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def _build_insight(risk_score, gaze_metrics, interaction_metrics):
    level = "low" if risk_score < 0.33 else "moderate" if risk_score < 0.66 else "elevated"
    return (
        f"This session shows a {level} composite risk signal "
        f"({risk_score * 100:.0f}%). Average tap response time was "
        f"{interaction_metrics['avgResponseTimeMs']:.0f}ms across "
        f"{interaction_metrics['tapCount']} interactions, with "
        f"{gaze_metrics['sampledPoints']} gaze samples captured. "
        f"This is a prototype output only and is not a clinical assessment."
    )


def process_session(session_record: dict):
    session_id = session_record["sessionId"]

    if pb_client.result_exists(session_id):
        print(f"Session {session_id} already scored, skipping.")
        return

    frame_urls = session_record.get("framesUploaded", [])
    expression_scores = {}
    expression_values = []
    gaze_points = []

    for i, url in enumerate(frame_urls):
        try:
            raw = pb_client.download_frame(url)
        except Exception as exc:
            print(f"Could not download frame {url}: {exc}")
            continue

        frame = _decode_frame(raw)
        if frame is None:
            continue

        expr = extract_expression_score(frame)
        if expr is not None:
            score, _raw_emotions = expr
            expression_values.append(score)
            expression_scores[f"frame_{i + 1}"] = round(score, 3)

        gaze = extract_gaze_point(frame)
        if gaze is not None:
            gaze_points.append(gaze)

    interaction_events = session_record.get("interactionEvents", [])
    vector = build_feature_vector(expression_values, gaze_points, interaction_events)
    risk_score = float(clf.predict_proba(vector.reshape(1, -1))[0][1])

    response_times = [e.get("responseTimeMs", 0) for e in interaction_events]
    interaction_metrics = {
        "tapCount": len(interaction_events),
        "avgResponseTimeMs": round(float(np.mean(response_times)) if response_times else 0.0, 1),
    }
    gaze_proxy_metrics = {
        "sampledPoints": len(gaze_points),
        "avgGazeX": round(float(np.mean([p[0] for p in gaze_points])), 3) if gaze_points else None,
        "avgGazeY": round(float(np.mean([p[1] for p in gaze_points])), 3) if gaze_points else None,
    }

    heatmap_path = None
    if gaze_points:
        heatmap_path = f"/tmp/{session_id}_heatmap.png"
        generate_gaze_heatmap(gaze_points, heatmap_path)

    insight = _build_insight(risk_score, gaze_proxy_metrics, interaction_metrics)

    pb_client.create_result_record(
        {
            "sessionId": session_id,
            "riskScore": round(risk_score, 3),
            "features": {
                "expressionScores": expression_scores,
                "gazeProxyMetrics": gaze_proxy_metrics,
                "interactionMetrics": interaction_metrics,
            },
            "modelVersion": "v0.1-prototype-unvalidated",
            "scoredAt": datetime.datetime.utcnow().isoformat() + "Z",
            "aiInsight": insight,
        },
        heatmap_path=heatmap_path,
    )
    print(f"Scored session {session_id}: risk={risk_score:.2f}")
