"""Steps 3.4 + 3.5 -- polling scoring worker and longitudinal conclusion generator.

Polls PocketBase for sessions with status="pending", scores them with the
Random Forest from train.py, writes a `results` record, marks the session
"scored", and writes a `conclusions` record once a child has completed
STREAK_LENGTH sessions.

The worker talks ONLY to PocketBase (never to the app) and authenticates as a
PocketBase superuser, because results/conclusions are not writable by clients.

    set PB_ADMIN_EMAIL=admin@tjit.edu
    set PB_ADMIN_PASSWORD=...
    python ml/worker.py            # run forever
    python ml/worker.py --once     # process one batch and exit
"""

import argparse
import json
import logging
import math
import os
import re
import sys
import time

import joblib
import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contract import (  # noqa: E402
    ELEVATED_MIN,
    FEATURE_ORDER,
    MODEL_VERSION,
    STREAK_LENGTH,
    TREND_DELTA,
    risk_level,
)

PB_URL = os.getenv("PB_URL", "http://127.0.0.1:8090").rstrip("/")
PB_ADMIN_EMAIL = os.getenv("PB_ADMIN_EMAIL", "")
PB_ADMIN_PASSWORD = os.getenv("PB_ADMIN_PASSWORD", "")
# The playbook says poll every 3 s, but the demo checklist needs a result in < 3 s,
# so the default is 1 s. Override with POLL_SECONDS=3 if you want the original value.
POLL_SECONDS = float(os.getenv("POLL_SECONDS", "1"))
MODEL_PATH = os.getenv("MODEL_PATH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.joblib"))

ID_RE = re.compile(r"^[A-Za-z0-9_]{1,64}$")
log = logging.getLogger("asd-worker")


# --------------------------------------------------------------------------- PocketBase client

class PBError(Exception):
    def __init__(self, status, body):
        super().__init__(f"PocketBase {status}: {body}")
        self.status = status
        self.body = body


class PocketBase:
    def __init__(self, url, email, password, timeout=10):
        self.url = url
        self.email = email
        self.password = password
        self.timeout = timeout
        self.session = requests.Session()
        self.token = None

    def auth(self):
        r = self.session.post(
            f"{self.url}/api/collections/_superusers/auth-with-password",
            json={"identity": self.email, "password": self.password},
            timeout=self.timeout,
        )
        if r.status_code != 200:
            raise PBError(r.status_code, r.text)
        self.token = r.json()["token"]

    def _req(self, method, path, retry=True, **kw):
        if self.token is None:
            self.auth()
        r = self.session.request(
            method, f"{self.url}{path}", headers={"Authorization": self.token}, timeout=self.timeout, **kw
        )
        if r.status_code == 401 and retry:  # token expired -> re-auth once
            self.token = None
            return self._req(method, path, retry=False, **kw)
        if r.status_code >= 400:
            raise PBError(r.status_code, r.text)
        return r.json() if r.content else {}

    def list(self, collection, filter=None, sort=None, per_page=200):
        params = {"perPage": per_page, "skipTotal": 1}
        if filter:
            params["filter"] = filter
        if sort:
            params["sort"] = sort
        return self._req("GET", f"/api/collections/{collection}/records", params=params)["items"]

    def get(self, collection, rid):
        return self._req("GET", f"/api/collections/{collection}/records/{rid}")

    def create(self, collection, data):
        return self._req("POST", f"/api/collections/{collection}/records", json=data)

    def update(self, collection, rid, data):
        return self._req("PATCH", f"/api/collections/{collection}/records/{rid}", json=data)


def safe_id(value):
    """Record ids are interpolated into filter strings -- only allow plain ids."""
    if not isinstance(value, str) or not ID_RE.match(value):
        raise ValueError(f"invalid record id: {value!r}")
    return value


# --------------------------------------------------------------------------- pure logic

def extract_vector(features):
    """Return the 7 features in contract order, or raise ValueError if unusable."""
    if isinstance(features, str):
        features = json.loads(features) if features.strip() else None
    if not isinstance(features, dict) or not features:
        raise ValueError("features missing or empty")
    vec = []
    for key in FEATURE_ORDER:
        val = features.get(key)
        if isinstance(val, bool) or val is None:
            raise ValueError(f"feature {key!r} missing")
        try:
            val = float(val)
        except (TypeError, ValueError):
            raise ValueError(f"feature {key!r} is not numeric: {val!r}")
        if math.isnan(val) or math.isinf(val):
            raise ValueError(f"feature {key!r} is not finite")
        vec.append(val)
    return vec


def build_conclusion(scores):
    """scores: risk scores ordered oldest -> newest. Returns the conclusions fields."""
    n = len(scores)
    mean = sum(scores) / n
    pct_elevated = 100.0 * sum(1 for s in scores if s >= ELEVATED_MIN) / n
    # Compare the mean of the first vs. last part of the streak (first vs last session when n = 3).
    k = max(1, n // 2)
    first = sum(scores[:k]) / k
    last = sum(scores[-k:]) / k
    diff = last - first
    if diff >= TREND_DELTA:
        trend = "worsening"
    elif diff <= -TREND_DELTA:
        trend = "improving"
    else:
        trend = "stable"
    category = risk_level(mean)
    summary = (
        f"Across {n} scored sessions the mean risk score was {mean:.2f} ({category}); "
        f"{pct_elevated:.0f}% of sessions were in the Elevated band (>= {ELEVATED_MIN}). "
        f"Trend is {trend} (early {first:.2f} -> recent {last:.2f}). "
        "This is a screening indicator only, not a diagnosis"
        + ("; a clinical developmental evaluation is recommended." if category == "Elevated" else ".")
    )
    return {"risk_category": category, "trend_direction": trend, "summary_text": summary}


# --------------------------------------------------------------------------- worker

class Worker:
    def __init__(self, pb, model_bundle, streak_length=STREAK_LENGTH):
        self.pb = pb
        self.clf = model_bundle["model"]
        self.version = model_bundle.get("version", MODEL_VERSION)
        if list(model_bundle.get("feature_order", FEATURE_ORDER)) != FEATURE_ORDER:
            raise RuntimeError("model.joblib was trained with a different feature order -- retrain it")
        self.streak_length = streak_length

    def score(self, vec):
        return float(self.clf.predict_proba([vec])[0][1])

    def process_session(self, session):
        sid = safe_id(session["id"])
        child_id = safe_id(session["child"])
        try:
            vec = extract_vector(session.get("features"))
        except (ValueError, json.JSONDecodeError) as exc:
            log.warning("session %s has unusable features (%s) -> flagged", sid, exc)
            self.pb.update("sessions", sid, {"status": "flagged"})
            return None

        # Idempotent: if a result already exists (e.g. crash after create), reuse it.
        existing = self.pb.list("results", filter=f"session='{sid}'", per_page=1)
        if existing:
            result = existing[0]
        else:
            score = self.score(vec)
            result = self.pb.create("results", {
                "session": sid,
                "child": child_id,
                "risk_score": round(score, 4),
                "risk_level": risk_level(score),
                "model_version": self.version,
            })
        self.pb.update("sessions", sid, {"status": "scored"})
        log.info("scored session %s child %s -> %.3f %s", sid, child_id, result["risk_score"], result["risk_level"])
        self.maybe_conclude(child_id)
        return result

    def maybe_conclude(self, child_id):
        child_id = safe_id(child_id)
        if self.pb.list("conclusions", filter=f"child='{child_id}'", per_page=1):
            return None
        child = self.pb.get("children", child_id)
        if int(child.get("session_count") or 0) < self.streak_length:
            return None
        results = self.pb.list("results", filter=f"child='{child_id}'", sort="created")
        if len(results) < self.streak_length:
            return None  # some sessions are still pending/flagged
        data = build_conclusion([float(r["risk_score"]) for r in results])
        data["child"] = child_id
        conclusion = self.pb.create("conclusions", data)
        log.info("conclusion for child %s: %s / %s", child_id, data["risk_category"], data["trend_direction"])
        return conclusion

    def run_once(self):
        pending = self.pb.list("sessions", filter="status='pending'", sort="created", per_page=50)
        done = 0
        for session in pending:
            try:
                self.process_session(session)
                done += 1
            except (PBError, ValueError, requests.RequestException) as exc:
                # One bad record must never stop the loop.
                log.error("failed to process session %s: %s", session.get("id"), exc)
        return done

    def run_forever(self, poll_seconds=POLL_SECONDS):
        log.info("worker started: %s, poll every %ss, streak %d, model %s",
                 self.pb.url, poll_seconds, self.streak_length, self.version)
        while True:
            try:
                self.run_once()
            except (PBError, requests.RequestException) as exc:
                log.error("poll failed: %s (retrying)", exc)
            time.sleep(poll_seconds)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="process one batch and exit")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    if not PB_ADMIN_EMAIL or not PB_ADMIN_PASSWORD:
        sys.exit("Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD (a PocketBase superuser).")
    if not os.path.exists(MODEL_PATH):
        sys.exit(f"{MODEL_PATH} not found -- run `python ml/train.py` first.")

    worker = Worker(PocketBase(PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD), joblib.load(MODEL_PATH))
    if args.once:
        print(f"processed {worker.run_once()} session(s)")
    else:
        worker.run_forever()


if __name__ == "__main__":
    main()
