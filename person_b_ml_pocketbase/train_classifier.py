"""
Trains the ensemble (Random Forest) classifier that turns a fused feature
vector into a risk score.

IMPORTANT / BE HONEST ABOUT THIS IN YOUR DEMO:
No real labeled ASD-vs-neurotypical toddler dataset is wired in here. This
script trains on SYNTHETIC placeholder data purely so the pipeline has a
working, non-degenerate classifier to demo end-to-end. The synthetic labeling
rule below has no clinical basis whatsoever — it exists only so predict_proba
returns varied, non-constant scores instead of crashing or always returning
0.5. Replace this with real training on a real labeled dataset (e.g. public
ASD gaze/facial datasets mentioned in your literature review) before this
number means anything.
"""

import numpy as np
from sklearn.ensemble import RandomForestClassifier
import joblib

from fusion import FEATURE_NAMES

rng = np.random.default_rng(42)
n_samples = 300
n_features = len(FEATURE_NAMES)

X = rng.normal(loc=0.5, scale=0.2, size=(n_samples, n_features))
X[:, 5] = rng.integers(0, 30, size=n_samples)       # tap_count
X[:, 6] = rng.normal(500, 200, size=n_samples)      # avg_response_ms

# Arbitrary synthetic rule: higher gaze variance + lower expression score
# pushes toward the "elevated risk" synthetic class. NOT clinically derived.
raw = X[:, 3] + X[:, 4] - X[:, 0]
y = (raw > np.median(raw)).astype(int)

clf = RandomForestClassifier(n_estimators=150, max_depth=6, random_state=42)
clf.fit(X, y)

joblib.dump(clf, "model.joblib")
print("Saved model.joblib (SYNTHETIC placeholder training data).")
print("Feature order:", FEATURE_NAMES)
