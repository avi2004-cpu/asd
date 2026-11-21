"""Step 3.1 / Day-2 seeding: doctor login + demo parent + 4 demo children with history.

Creates (idempotently):
  * doctor  doctor@tjit.edu       (password: DEMO_DOCTOR_PASSWORD, default doctor12345)
  * parent  demo.parent@tjit.edu  (password: DEMO_PARENT_PASSWORD, default parent12345)
  * 4 children owned by the demo parent, each with STREAK_LENGTH+1 historical
    sessions (status "pending") -- start worker.py and it scores them and writes
    the conclusions, so the doctor dashboard is immediately testable.

    python ml/seed.py           # create if missing
    python ml/seed.py --reset   # delete the demo children (cascades) and re-create
"""

import argparse
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contract import FEATURE_ORDER, STREAK_LENGTH  # noqa: E402
from worker import PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD, PB_URL, PBError, PocketBase  # noqa: E402

DOCTOR = {"email": "doctor@tjit.edu", "name": "Dr. Demo",
          "password": os.getenv("DEMO_DOCTOR_PASSWORD", "doctor12345"), "role": "doctor"}
PARENT = {"email": "demo.parent@tjit.edu", "name": "Demo Parent",
          "password": os.getenv("DEMO_PARENT_PASSWORD", "parent12345"), "role": "parent"}

# risk: 0 = typical .. 1 = strongly atypical, per session (oldest -> newest).
CHILDREN = [
    {"name": "Aarav", "dob": "2023-03-14", "gender": "male",   "risk": [0.15, 0.10, 0.12, 0.10]},
    {"name": "Diya",  "dob": "2022-11-02", "gender": "female", "risk": [0.45, 0.50, 0.55, 0.50]},
    {"name": "Kabir", "dob": "2023-06-21", "gender": "male",   "risk": [0.55, 0.70, 0.85, 0.90]},
    {"name": "Meera", "dob": "2022-08-30", "gender": "female", "risk": [0.85, 0.70, 0.45, 0.30]},
]
PAST_DATE = "2026-01-01"


def clamp(v, lo=0.0, hi=1.0):
    return max(lo, min(hi, v))


def fake_session(rng, risk, activity):
    """Feature vector in the same scale train.py uses (gaze/expr in [0, 1])."""
    var_x = clamp(rng.gauss(0.25 + 0.5 * risk, 0.05))
    var_y = clamp(rng.gauss(0.25 + 0.5 * risk, 0.05))
    mean_x = clamp(rng.gauss(0.5, 0.05))
    mean_y = clamp(rng.gauss(0.5, 0.05))
    feats = {
        "avg_expr": round(clamp(rng.gauss(0.8 - 0.6 * risk, 0.05)), 3),
        "gaze_mean_x": round(mean_x, 3),
        "gaze_mean_y": round(mean_y, 3),
        "gaze_var_x": round(var_x, 4),
        "gaze_var_y": round(var_y, 4),
        "tap_count": 0 if activity == "video" else int(clamp(rng.gauss(12 - 6 * risk, 2), 0, 29)),
        "avg_response_ms": 0.0 if activity == "video" else round(max(150.0, rng.gauss(450 + 400 * risk, 60)), 1),
    }
    assert list(feats) == FEATURE_ORDER
    spread = 0.05 + 0.25 * risk
    points = [[round(clamp(rng.gauss(mean_x, spread)), 3), round(clamp(rng.gauss(mean_y, spread)), 3)]
              for _ in range(15)]
    return {"activity_type": activity, "features": feats, "gaze_points": points,
            "valid_face_ratio": round(clamp(rng.gauss(0.85, 0.05)), 2), "status": "pending"}


def upsert_user(pb, user):
    found = pb.list("users", filter=f"email='{user['email']}'", per_page=1)
    if found:
        print(f"  user exists: {user['email']}")
        return found[0]
    rec = pb.create("users", {**user, "passwordConfirm": user["password"], "verified": True, "emailVisibility": True})
    print(f"  created {user['role']}: {user['email']}")
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true")
    args = ap.parse_args()
    if not PB_ADMIN_EMAIL or not PB_ADMIN_PASSWORD:
        sys.exit("Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD (a PocketBase superuser).")

    pb = PocketBase(PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD)
    rng = random.Random(7)
    print("users:")
    upsert_user(pb, DOCTOR)
    parent = upsert_user(pb, PARENT)

    print("children:")
    for spec in CHILDREN:
        existing = pb.list("children", filter=f"parent='{parent['id']}' && name='{spec['name']}'", per_page=1)
        if existing and args.reset:
            pb._req("DELETE", f"/api/collections/children/records/{existing[0]['id']}")
            existing = []
        if existing:
            print(f"  exists: {spec['name']}")
            continue
        sessions = spec["risk"]
        child = pb.create("children", {
            "parent": parent["id"], "name": spec["name"], "dob": spec["dob"] + " 00:00:00.000Z",
            "gender": spec["gender"], "consent": True, "consent_at": PAST_DATE + " 09:00:00.000Z",
            # superuser-created sessions bypass the hook counters, so set them here
            "session_count": len(sessions), "sessions_today": 0, "last_session_date": PAST_DATE,
        })
        for i, risk in enumerate(sessions):
            pb.create("sessions", {"child": child["id"], **fake_session(rng, risk, "game" if i % 2 == 0 else "video")})
        print(f"  created {spec['name']} with {len(sessions)} pending sessions")

    print(f"done. Start `python ml/worker.py` to score them (streak length {STREAK_LENGTH}).")


if __name__ == "__main__":
    try:
        main()
    except PBError as exc:
        sys.exit(f"seed failed: {exc}")
