"""
Combine expression, gaze, and interaction signals into a single flat feature
vector for the classifier, following the paper's fusion formulation:

    y_hat = f_ens(x_gaze, x_expr, x_int)
"""

import numpy as np


def build_feature_vector(expression_values, gaze_points, interaction_events):
    """
    expression_values: list[float] — per-frame composite expression scores
    gaze_points: list[(float, float)] — per-frame (gaze_x, gaze_y) proxy points
    interaction_events: list[dict] — session's interactionEvents, each with
                         at least "responseTimeMs"

    Returns a fixed-length numpy feature vector, in a stable feature order so
    the same vector shape is always fed to the classifier.
    """
    avg_expr = float(np.mean(expression_values)) if expression_values else 0.5

    if gaze_points:
        xs = np.array([p[0] for p in gaze_points])
        ys = np.array([p[1] for p in gaze_points])
        gaze_mean_x, gaze_mean_y = float(xs.mean()), float(ys.mean())
        gaze_var_x, gaze_var_y = float(xs.var()), float(ys.var())
    else:
        gaze_mean_x = gaze_mean_y = gaze_var_x = gaze_var_y = 0.5

    tap_count = len(interaction_events)
    response_times = [e.get("responseTimeMs", 0) for e in interaction_events]
    avg_response = float(np.mean(response_times)) if response_times else 0.0

    # Feature order — must match the order used in train_classifier.py
    return np.array(
        [
            avg_expr,
            gaze_mean_x,
            gaze_mean_y,
            gaze_var_x,
            gaze_var_y,
            tap_count,
            avg_response,
        ]
    )


FEATURE_NAMES = [
    "avg_expression",
    "gaze_mean_x",
    "gaze_mean_y",
    "gaze_var_x",
    "gaze_var_y",
    "tap_count",
    "avg_response_ms",
]
