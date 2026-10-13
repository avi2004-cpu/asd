import os

import numpy as np
import pytest

import conclusions as conclusion_module
import pipeline
from fusion import FEATURE_NAMES, build_feature_vector


def good_features(count=6):
    return {
        "schemaVersion": 1,
        "expressionValues": [0.5] * count,
        "gazePoints": [[0.4, 0.5]] * count,
        "framesSeen": count + 1,
        "framesWithFace": count,
        "expressionSource": "blendshapes",
        "extractorVersion": "test",
    }


def test_vector_shape_matches_model():
    vector = build_feature_vector([0.5], [(0.4, 0.5)], [{"responseTimeMs": 400}])
    assert vector.shape == (len(FEATURE_NAMES),) == (pipeline.clf.n_features_in_,)


def test_parse_features_filters_bad_values_and_rejects_missing():
    features = good_features()
    features["expressionValues"] += [7, "invalid", True, None]
    features["gazePoints"] += [[2, 0.1], [0.1], "invalid"]
    expression, gaze = pipeline.parse_features(features)
    assert len(expression) == len(gaze) == 6
    with pytest.raises(pipeline.InvalidFeatures):
        pipeline.parse_features(None)
    with pytest.raises(pipeline.InvalidFeatures):
        pipeline.parse_features({"schemaVersion": 2})


def test_empty_features_score_without_crashing():
    assert 0.0 <= pipeline.score_vector([], [], []) <= 1.0


class FakePocketBase:
    def __init__(self, scores, count, face_samples=5, has_conclusion=False):
        self.results = [
            {
                "riskScore": score,
                "session": f"session-{index}",
                "features": {"gazeProxyMetrics": {"sampledPoints": face_samples}},
            }
            for index, score in enumerate(scores)
        ]
        self.count = count
        self.has_conclusion = has_conclusion
        self.created = []

    def get_child(self, _child_id):
        return {"sessionCount": self.count}

    def conclusion_exists(self, _child_id):
        return self.has_conclusion

    def list_child_results(self, _child_id):
        return self.results

    def create_conclusion(self, fields):
        self.created.append(fields)


def test_conclusion_threshold_and_idempotence():
    scores = [0.2] * 25
    below = FakePocketBase(scores[:24], 24)
    assert not conclusion_module.maybe_conclude(below, "child")
    assert not below.created

    at = FakePocketBase(scores, 25)
    assert conclusion_module.maybe_conclude(at, "child")
    assert len(at.created) == 1

    existing = FakePocketBase(scores, 25, has_conclusion=True)
    assert not conclusion_module.maybe_conclude(existing, "child")

    above = FakePocketBase(scores + [0.2] * 5, 30)
    assert conclusion_module.maybe_conclude(above, "child")


def test_conclusion_levels():
    assert conclusion_module.compute_conclusion([0.1] * 20)["level"] == "low"
    assert conclusion_module.compute_conclusion([0.8] * 12 + [0.1] * 8)["level"] == "elevated"
    assert conclusion_module.compute_conclusion([0.8] * 5 + [0.1] * 15)["level"] == "moderate"
    assert conclusion_module.compute_conclusion([0.4] * 20)["level"] == "moderate"
    assert conclusion_module.compute_conclusion([0.9] * 3)["level"] == "insufficient-data"


def test_conclusion_trend_directions():
    assert conclusion_module.compute_conclusion([0.2] * 10 + [0.5] * 10)["direction"] == "worsening"
    assert conclusion_module.compute_conclusion([0.6] * 10 + [0.2] * 10)["direction"] == "improving"
    assert conclusion_module.compute_conclusion([0.3, 0.32] * 10)["direction"] == "stable"


def test_low_quality_sessions_are_excluded():
    result = conclusion_module.compute_conclusion(
        [0.9] * 15 + [0.1] * 10,
        [0] * 15 + [5] * 10,
    )
    assert result["sessionsExcluded"] == 15
    assert result["sessionsAnalyzed"] == 10
    assert result["level"] == "low"


def test_process_session_saves_heatmap_and_result(monkeypatch):
    written = {}
    monkeypatch.setattr(pipeline.pb_client, "result_exists", lambda _sid: False)
    monkeypatch.setattr(
        pipeline.pb_client,
        "create_result_record",
        lambda fields, heatmap_path=None: written.update(
            fields=fields,
            heatmap_exists=heatmap_path is not None and os.path.exists(heatmap_path),
        ),
    )

    pipeline.process_session(
        {
            "sessionId": "test-session",
            "features": good_features(),
            "interactionEvents": [{"responseTimeMs": 300}],
        }
    )
    assert 0 <= written["fields"]["riskScore"] <= 1
    assert written["heatmap_exists"]
    assert written["fields"]["features"]["gazeProxyMetrics"]["sampledPoints"] == 6
    assert written["fields"]["features"]["extractor"]["expressionSource"] == "blendshapes"
