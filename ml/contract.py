"""Locked contract values owned by Person 3 (Backend & ML).

Do NOT change these without group approval -- the mobile app (Person 1),
the dashboard (Person 2), the PocketBase hooks and the trained model all
depend on them. Mirrors src/types/schema.ts and pb_hooks/asd_config.js.
"""

import os

# Constraint 1: exact feature keys, in the column order used by train.py.
FEATURE_ORDER = [
    "avg_expr",
    "gaze_mean_x",
    "gaze_mean_y",
    "gaze_var_x",
    "gaze_var_y",
    "tap_count",
    "avg_response_ms",
]

# Constraint 5: risk thresholds and streak config.
LOW_MAX = 0.33        # score <  0.33          -> Low
ELEVATED_MIN = 0.66   # 0.33 <= score < 0.66   -> Moderate ; score >= 0.66 -> Elevated
STREAK_LENGTH = int(os.getenv("STREAK_LENGTH", "3"))
DAILY_LIMIT = int(os.getenv("DAILY_LIMIT", "2"))

# Trend rule for conclusions: |last - first| >= TREND_DELTA => worsening / improving.
TREND_DELTA = 0.10

MODEL_VERSION = "rf-synth-v1"


def risk_level(score: float) -> str:
    if score < LOW_MAX:
        return "Low"
    if score < ELEVATED_MIN:
        return "Moderate"
    return "Elevated"
