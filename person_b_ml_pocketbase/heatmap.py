"""
Renders a 2D heatmap image from a session's gaze proxy points, for display
on the clinician dashboard's "Gaze heatmap" panel.
"""

import matplotlib

matplotlib.use("Agg")  # headless rendering, no display needed on a server
import matplotlib.pyplot as plt


def generate_gaze_heatmap(gaze_points, out_path):
    """
    gaze_points: list[(float, float)] of normalized (x, y) gaze proxy points
    out_path: local file path to write the PNG to
    """
    xs = [p[0] for p in gaze_points]
    ys = [p[1] for p in gaze_points]

    fig, ax = plt.subplots(figsize=(4, 4))
    if len(gaze_points) >= 3:
        ax.hexbin(xs, ys, gridsize=15, cmap="inferno", mincnt=1)
    else:
        # Too few points for a meaningful density plot — just show them as dots
        ax.scatter(xs, ys, s=200, c="orange")
    ax.set_xlim(0, 1)
    ax.set_ylim(1, 0)  # invert so "down" in gaze_y reads as down in the image
    ax.axis("off")
    fig.savefig(out_path, bbox_inches="tight", dpi=120, transparent=True)
    plt.close(fig)
