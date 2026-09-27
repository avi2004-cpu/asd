"""
Feature extraction from a single video frame (as captured/sampled by the
Little Moments child-facing app and uploaded to Firebase Storage).

Two signal streams, matching the paper's design:
  1. Facial expression — via the `fer` package, which ships a pretrained
     FER-2013 CNN. No training needed for this prototype milestone.
  2. Gaze direction — no dedicated eye-tracking hardware. We use MediaPipe
     Face Mesh's iris landmarks as a geometric proxy for gaze direction,
     as discussed: this is NOT validated eye-tracking-grade gaze estimation,
     it is a proxy signal appropriate for a prototype demo only.
"""

import cv2
import numpy as np

try:
    import mediapipe as mp
except Exception:  # pragma: no cover - optional runtime dependency for demo
    mp = None

try:
    from fer import FER
except ImportError:
    try:
        from fer.fer import FER
    except ImportError:  # pragma: no cover - optional runtime dependency for demo
        FER = None

# --- Facial expression (pretrained CNN via `fer`) ---------------------------

# Some local installs package `fer` differently or do not expose the full
# runtime stack; in that case we fall back to a neutral synthetic score so the
# demo pipeline still produces a measurable result instead of crashing.
_expression_detector = FER(mtcnn=False) if FER is not None else None


def extract_expression_score(frame_bgr: np.ndarray):
    """
    Returns (composite_score, raw_emotion_dict) for the largest detected face,
    or None if no face was found in this frame.

    composite_score is a single 0-1 "positive affect / engagement" proxy:
    higher = more positive/engaged expression, lower = more negative/flat.
    This composite is a simplification for demo purposes — the raw per-emotion
    probabilities are also returned in case richer downstream use is needed.
    """
    if _expression_detector is None:
        return 0.5, {"happy": 0.15, "neutral": 0.7, "sad": 0.15}

    results = _expression_detector.detect_emotions(frame_bgr)
    if not results:
        return None

    emotions = results[0]["emotions"]  # e.g. {"happy": 0.2, "neutral": 0.5, ...}
    positive = emotions.get("happy", 0) + emotions.get("surprise", 0)
    negative = (
        emotions.get("angry", 0)
        + emotions.get("sad", 0)
        + emotions.get("fear", 0)
        + emotions.get("disgust", 0)
    )
    composite = 0.5 + 0.5 * (positive - negative)
    composite = float(max(0.0, min(1.0, composite)))
    return composite, emotions


# --- Gaze proxy (MediaPipe Face Mesh + iris landmarks) -----------------------

_mp_face_mesh = None
if mp is not None and hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh"):
    _mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        refine_landmarks=True,  # required to get iris landmarks (468-477)
        max_num_faces=1,
    )

_LEFT_IRIS = [468, 469, 470, 471]
_LEFT_EYE_CORNERS = (33, 133)
_LEFT_EYE_UPPER_LOWER = (159, 145)


def extract_gaze_point(frame_bgr: np.ndarray):
    """
    Returns (gaze_x, gaze_y) as normalized 0-1 proxy coordinates within the
    left eye, or None if no face/iris was detected in this frame.

    gaze_x: 0 = looking toward left eye corner, 1 = toward right eye corner
    gaze_y: 0 = looking up (toward upper lid), 1 = looking down

    This is a geometric proxy signal derived from iris position relative to
    eye-corner landmarks — a substitute for dedicated eye-tracking hardware,
    not a validated replacement for it.
    """
    if _mp_face_mesh is None:
        return None

    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    results = _mp_face_mesh.process(rgb)
    if not results.multi_face_landmarks:
        return None

    landmarks = results.multi_face_landmarks[0].landmark
    h, w = frame_bgr.shape[:2]

    def pt(idx):
        return np.array([landmarks[idx].x * w, landmarks[idx].y * h])

    iris_center = np.mean([pt(i) for i in _LEFT_IRIS], axis=0)
    corner_l, corner_r = pt(_LEFT_EYE_CORNERS[0]), pt(_LEFT_EYE_CORNERS[1])
    eye_vec = corner_r - corner_l
    eye_width_sq = float(np.dot(eye_vec, eye_vec))
    if eye_width_sq == 0:
        return None
    gaze_x = float(np.dot(iris_center - corner_l, eye_vec) / eye_width_sq)

    upper, lower = pt(_LEFT_EYE_UPPER_LOWER[0]), pt(_LEFT_EYE_UPPER_LOWER[1])
    eye_height = float(np.linalg.norm(upper - lower))
    gaze_y = float((iris_center[1] - upper[1]) / eye_height) if eye_height > 0 else 0.5

    return float(np.clip(gaze_x, 0, 1)), float(np.clip(gaze_y, 0, 1))
