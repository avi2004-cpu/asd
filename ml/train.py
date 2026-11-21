"""Step 3.3 -- synthetic training script.

Generates 300 synthetic 7-feature vectors, labels them with the
`gaze_var_x + gaze_var_y - avg_expr > median` rule (balanced classes),
fits a RandomForest and exports ml/model.joblib.

    python ml/train.py
"""

import os
import sys

import joblib
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from contract import FEATURE_ORDER, MODEL_VERSION  # noqa: E402

N_SAMPLES = 300
SEED = 42
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.joblib")


def make_dataset(n=N_SAMPLES, seed=SEED):
    rng = np.random.default_rng(seed)
    # Gaze / expression features ~ N(0.5, 0.2^2), clipped to the contract bounds [0, 1].
    gaze_expr = np.clip(rng.normal(0.5, 0.2, size=(n, 5)), 0.0, 1.0)
    tap_count = rng.integers(0, 30, size=n).astype(float)            # uniform 0..29
    latency = np.clip(rng.normal(500.0, 200.0, size=n), 0.0, None)   # N(500, 200^2) ms

    # Column order MUST equal FEATURE_ORDER.
    X = np.column_stack([gaze_expr, tap_count, latency])
    idx = {k: i for i, k in enumerate(FEATURE_ORDER)}
    signal = X[:, idx["gaze_var_x"]] + X[:, idx["gaze_var_y"]] - X[:, idx["avg_expr"]]
    y = (signal > np.median(signal)).astype(int)
    return X, y


def main():
    X, y = make_dataset()
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, random_state=SEED, stratify=y)

    clf = RandomForestClassifier(n_estimators=150, max_depth=6, random_state=42)
    clf.fit(X_tr, y_tr)
    holdout = clf.score(X_te, y_te)

    # Refit on all data for the exported model.
    clf.fit(X, y)
    joblib.dump(
        {"model": clf, "feature_order": FEATURE_ORDER, "version": MODEL_VERSION},
        OUT_PATH,
    )
    print(f"class balance: {int(y.sum())} positive / {int(len(y) - y.sum())} negative")
    print(f"holdout accuracy: {holdout:.3f}")
    print(f"saved {OUT_PATH} ({MODEL_VERSION})")


if __name__ == "__main__":
    main()
