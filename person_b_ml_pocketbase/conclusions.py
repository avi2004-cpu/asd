"""Explainable, streak-triggered summaries over a child's scored sessions."""

from __future__ import annotations

import datetime
import os
from typing import Sequence

import numpy as np

SESSION_THRESHOLD = int(os.environ.get("SESSION_THRESHOLD", "25"))
MIN_FACE_SAMPLES = 3
MIN_VALID_SESSIONS = 10
ELEVATED_CUTOFF = 0.66
MODERATE_CUTOFF = 0.33
TREND_DELTA = 0.10


def compute_conclusion(
    scores: Sequence[float],
    face_samples: Sequence[int] | None = None,
) -> dict:
    total = len(scores)
    if face_samples is None:
        face_samples = [MIN_FACE_SAMPLES] * total
    valid = [
        float(score)
        for score, count in zip(scores, face_samples)
        if count >= MIN_FACE_SAMPLES
    ]
    analyzed = len(valid)
    base = {
        "sessionsTotal": total,
        "sessionsAnalyzed": analyzed,
        "sessionsExcluded": total - analyzed,
        "rule": "v1: persistence of elevated sessions + first-vs-last-third trend",
    }
    if analyzed < MIN_VALID_SESSIONS:
        return {
            **base,
            "level": "insufficient-data",
            "direction": "unknown",
            "elevatedShare": None,
            "moderateUpShare": None,
            "meanRisk": None,
            "firstThirdMean": None,
            "lastThirdMean": None,
            "delta": None,
            "slopePerSession": None,
        }

    values = np.asarray(valid)
    elevated_share = float(np.mean(values >= ELEVATED_CUTOFF))
    moderate_up_share = float(np.mean(values >= MODERATE_CUTOFF))
    if elevated_share >= 0.5:
        level = "elevated"
    elif elevated_share >= 0.25 or moderate_up_share >= 0.5:
        level = "moderate"
    else:
        level = "low"

    third_size = max(1, analyzed // 3)
    first_mean = float(values[:third_size].mean())
    last_mean = float(values[-third_size:].mean())
    delta = last_mean - first_mean
    direction = (
        "worsening"
        if delta >= TREND_DELTA
        else "improving"
        if delta <= -TREND_DELTA
        else "stable"
    )
    slope = float(np.polyfit(np.arange(analyzed), values, 1)[0])
    return {
        **base,
        "level": level,
        "direction": direction,
        "elevatedShare": round(elevated_share, 3),
        "moderateUpShare": round(moderate_up_share, 3),
        "meanRisk": round(float(values.mean()), 3),
        "firstThirdMean": round(first_mean, 3),
        "lastThirdMean": round(last_mean, 3),
        "delta": round(delta, 3),
        "slopePerSession": round(slope, 4),
    }


def build_summary(conclusion: dict) -> str:
    disclaimer = (
        " This is a prototype screening aid, not a diagnosis; the scoring model "
        "is not yet trained on clinical data."
    )
    if conclusion["level"] == "insufficient-data":
        return (
            f"Only {conclusion['sessionsAnalyzed']} of {conclusion['sessionsTotal']} sessions "
            f"had usable face data (need at least {MIN_VALID_SESSIONS}), so no conclusion "
            "could be drawn. Consider repeating sessions in better lighting with the child "
            "facing the camera."
            + disclaimer
        )
    return (
        f"Across {conclusion['sessionsAnalyzed']} usable sessions "
        f"({conclusion['sessionsExcluded']} excluded for poor face data), "
        f"{conclusion['elevatedShare'] * 100:.0f}% were in the elevated band and the "
        f"average risk was {conclusion['meanRisk'] * 100:.0f}%. Overall level: "
        f"{conclusion['level']}. Trend: {conclusion['direction']} "
        f"(first third {conclusion['firstThirdMean'] * 100:.0f}% to last third "
        f"{conclusion['lastThirdMean'] * 100:.0f}%)."
        + disclaimer
    )


def maybe_conclude(pb, child_id: str) -> bool:
    child = pb.get_child(child_id)
    if child is None or int(child.get("sessionCount", 0)) < SESSION_THRESHOLD:
        return False
    if pb.conclusion_exists(child_id):
        return False

    results = pb.list_child_results(child_id)
    scores = [float(result["riskScore"]) for result in results]
    face_samples = [
        int(
            ((result.get("features") or {}).get("gazeProxyMetrics") or {}).get(
                "sampledPoints", 0
            )
        )
        for result in results
    ]
    conclusion = compute_conclusion(scores, face_samples)
    pb.create_conclusion(
        {
            "child": child_id,
            "session": results[-1].get("session", "") if results else "",
            "summary": build_summary(conclusion),
            "createdAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "trend": conclusion,
            "sessionsAnalyzed": conclusion["sessionsAnalyzed"],
        }
    )
    print(f"Wrote conclusion for child {child_id}: {conclusion['level']} / {conclusion['direction']}")
    return True
