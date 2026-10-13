# Person B — on-device features and PocketBase scoring

The mobile app computes compact gaze-proxy and expression features locally
using MediaPipe Face Landmarker. Raw camera frames are not uploaded. With
optional camera consent, the app uploads the derived session feature vector
and at most one small grayscale JPEG thumbnail. The Python worker validates
that vector, scores it, uploads a gaze heatmap, and writes a longitudinal
conclusion after the configured session threshold.

These are prototype screening outputs, not a diagnosis or clinical measure.
The bundled Random Forest was trained on synthetic placeholder data; its
scores and conclusions have no clinical validity.

## 1. Prepare PocketBase

Follow [`little-moments-src/PB_SETUP.md`](../little-moments-src/PB_SETUP.md)
to apply the backend and Person B migrations and install the server hooks.
Provision a dedicated `users` auth record with the `scoring-worker` role.
Never use a parent, doctor, or superuser credential for the worker.

## 2. Install the client ML assets

From `little-moments-src`:

```sh
npm install
npm run ml:assets
```

This copies the installed MediaPipe WASM runtime into `public/mediapipe/wasm`
and downloads the official Face Landmarker task file to `public/models/`.
The TensorFlow.js emotion model is optional. If one is installed, it must
match the seven-label FER ordering and the configured input shape in
`src/lib/ml/extractor.ts`; otherwise the app uses MediaPipe blendshapes.

## 3. Configure and run the worker

Set these environment variables in the worker's runtime environment (do not
commit credentials):

```text
POCKETBASE_URL=https://your-shared-host.example
POCKETBASE_WORKER_EMAIL=worker@example.invalid
POCKETBASE_WORKER_PASSWORD=<deployment secret>
SESSION_THRESHOLD=25
```

Install the Python dependencies and start the worker:

```sh
pip install -r requirements.txt
python listener.py
```

The worker polls every three seconds for `uploaded` sessions. It creates one
result per session, and, when the child's count reaches `SESSION_THRESHOLD`,
creates a conclusion from the scored session history. Run the focused tests
with:

```sh
python -m pytest
```

Both the app and worker must point at the same PocketBase origin. The worker
requires network access to that server; no separate feature extraction
listener or port is needed.

## Feature and conclusion rules

- Feature schema version is `1`; expression scores and gaze coordinates are
  normalized to `[0, 1]`.
- A session contributes to the longitudinal conclusion only when at least
  three gaze samples were captured. Fewer than ten usable sessions yields
  `insufficient-data`.
- `elevated` requires at least half of valid scores at or above `0.66`;
  `moderate` requires at least a quarter elevated or half at/above `0.33`.
- Direction compares mean risk in the first and last thirds; a difference of
  at least `0.10` is labeled worsening or improving.
- The session risk classifier is still trained on synthetic data. Gaze is a
  camera-based proxy, not validated eye tracking, and client-supplied feature
  values can be tampered with.
