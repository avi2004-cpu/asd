"""Offline tests for the scoring worker (no PocketBase needed).

    python -m unittest ml/test_worker.py -v
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contract import FEATURE_ORDER, risk_level  # noqa: E402
from train import make_dataset  # noqa: E402
from worker import Worker, build_conclusion, extract_vector  # noqa: E402
from sklearn.ensemble import RandomForestClassifier  # noqa: E402

PAYLOAD_FEATURES = {  # the exact example from playbook Section 3
    "avg_expr": 0.64, "gaze_mean_x": 0.483, "gaze_mean_y": 0.510, "gaze_var_x": 0.0012,
    "gaze_var_y": 0.0004, "tap_count": 14, "avg_response_ms": 620.5,
}


class FakePB:
    """In-memory stand-in for the PocketBase REST client."""

    url = "fake://"

    def __init__(self):
        self.db = {"sessions": {}, "children": {}, "results": {}, "conclusions": {}}
        self.n = 0

    def _id(self):
        self.n += 1
        return f"rec{self.n:012d}"

    def list(self, collection, filter=None, sort=None, per_page=200):
        rows = list(self.db[collection].values())
        if filter:
            field, value = filter.split("=", 1)
            rows = [r for r in rows if str(r.get(field)) == value.strip("'")]
        if sort == "created":
            rows.sort(key=lambda r: r["created"])
        return rows[:per_page]

    def get(self, collection, rid):
        return self.db[collection][rid]

    def create(self, collection, data):
        rid = self._id()
        rec = {**data, "id": rid, "created": self.n}
        self.db[collection][rid] = rec
        return rec

    def update(self, collection, rid, data):
        self.db[collection][rid].update(data)
        return self.db[collection][rid]

    def add_session(self, child_id, features, status="pending"):
        self.db["children"][child_id]["session_count"] += 1
        return self.create("sessions", {"child": child_id, "features": features, "status": status})


def model_bundle():
    X, y = make_dataset()
    clf = RandomForestClassifier(n_estimators=150, max_depth=6, random_state=42).fit(X, y)
    return {"model": clf, "feature_order": FEATURE_ORDER, "version": "test"}


class ContractTests(unittest.TestCase):
    def test_risk_levels(self):
        self.assertEqual(risk_level(0.0), "Low")
        self.assertEqual(risk_level(0.329), "Low")
        self.assertEqual(risk_level(0.33), "Moderate")
        self.assertEqual(risk_level(0.655), "Moderate")
        self.assertEqual(risk_level(0.66), "Elevated")
        self.assertEqual(risk_level(1.0), "Elevated")

    def test_extract_vector_order(self):
        shuffled = dict(reversed(list(PAYLOAD_FEATURES.items())))
        self.assertEqual(extract_vector(shuffled), [PAYLOAD_FEATURES[k] for k in FEATURE_ORDER])

    def test_extract_vector_rejects_bad_input(self):
        for bad in [None, {}, "", {**PAYLOAD_FEATURES, "tap_count": None},
                    {k: v for k, v in PAYLOAD_FEATURES.items() if k != "avg_expr"},
                    {**PAYLOAD_FEATURES, "gaze_var_x": "abc"},
                    {**PAYLOAD_FEATURES, "gaze_var_x": float("nan")}]:
            with self.assertRaises(ValueError):
                extract_vector(bad)

    def test_conclusion_trends(self):
        self.assertEqual(build_conclusion([0.2, 0.5, 0.8])["trend_direction"], "worsening")
        self.assertEqual(build_conclusion([0.8, 0.5, 0.2])["trend_direction"], "improving")
        self.assertEqual(build_conclusion([0.5, 0.55, 0.52])["trend_direction"], "stable")
        c = build_conclusion([0.7, 0.8, 0.9])
        self.assertEqual(c["risk_category"], "Elevated")
        self.assertIn("100%", c["summary_text"])


class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.pb = FakePB()
        self.worker = Worker(self.pb, model_bundle(), streak_length=3)
        self.pb.db["children"]["child1"] = {"id": "child1", "session_count": 0}

    def test_scores_pending_session(self):
        s = self.pb.add_session("child1", PAYLOAD_FEATURES)
        self.assertEqual(self.worker.run_once(), 1)
        self.assertEqual(self.pb.db["sessions"][s["id"]]["status"], "scored")
        (res,) = self.pb.db["results"].values()
        self.assertEqual(res["session"], s["id"])
        self.assertTrue(0.0 <= res["risk_score"] <= 1.0)
        self.assertEqual(res["risk_level"], risk_level(res["risk_score"]))
        self.assertEqual(self.worker.run_once(), 0)  # nothing left

    def test_bad_features_get_flagged_not_crash(self):
        bad = self.pb.add_session("child1", {"avg_expr": 0.5})
        good = self.pb.add_session("child1", PAYLOAD_FEATURES)
        self.worker.run_once()
        self.assertEqual(self.pb.db["sessions"][bad["id"]]["status"], "flagged")
        self.assertEqual(self.pb.db["sessions"][good["id"]]["status"], "scored")
        self.assertEqual(len(self.pb.db["results"]), 1)

    def test_flagged_sessions_are_ignored(self):
        self.pb.create("sessions", {"child": "child1", "features": PAYLOAD_FEATURES, "status": "flagged"})
        self.assertEqual(self.worker.run_once(), 0)
        self.assertEqual(self.pb.db["results"], {})

    def test_conclusion_after_streak_once(self):
        for i in range(2):
            self.pb.add_session("child1", PAYLOAD_FEATURES)
            self.worker.run_once()
        self.assertEqual(self.pb.db["conclusions"], {})  # 2 < streak
        self.pb.add_session("child1", PAYLOAD_FEATURES)
        self.worker.run_once()
        self.assertEqual(len(self.pb.db["conclusions"]), 1)
        (c,) = self.pb.db["conclusions"].values()
        self.assertEqual(c["child"], "child1")
        self.assertIn(c["trend_direction"], {"improving", "stable", "worsening"})
        self.pb.add_session("child1", PAYLOAD_FEATURES)  # 4th session: no duplicate conclusion
        self.worker.run_once()
        self.assertEqual(len(self.pb.db["conclusions"]), 1)

    def test_existing_result_is_reused(self):
        s = self.pb.add_session("child1", PAYLOAD_FEATURES)
        self.pb.create("results", {"session": s["id"], "child": "child1", "risk_score": 0.5, "risk_level": "Moderate"})
        self.worker.run_once()
        self.assertEqual(len(self.pb.db["results"]), 1)
        self.assertEqual(self.pb.db["sessions"][s["id"]]["status"], "scored")


if __name__ == "__main__":
    unittest.main()
