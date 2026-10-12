# Person B — ML Scoring Pipeline (PocketBase version)

No more `firebase-admin` — this talks to PocketBase over plain HTTP via
`requests`. Writes the same `results` schema as before, so the dashboard
doesn't need any further changes on top of its own PocketBase migration.

## 1. Run PocketBase itself

If not already running from the frontend setup:
```
./pocketbase serve
```
Admin UI: http://127.0.0.1:8090/_/

## 2. Create/check the collections in the PocketBase admin UI

**`sessions`** (should already exist from the frontend migration) — confirm it has:
- `sessionId` (text)
- `childId` (text)
- `timestamp` (text or date)
- `gameModule` (text)
- `framesUploaded` (json, or text — a list of frame URLs)
- `interactionEvents` (json)
- `status` (text)

**`results`** (create if it doesn't exist yet):
- `sessionId` (text)
- `riskScore` (number)
- `features` (json)
- `gazeHeatmapUrl` (text)
- `heatmapImage` (file) — the pipeline uploads the heatmap PNG here, then
  computes `gazeHeatmapUrl` from it automatically
- `modelVersion` (text)
- `scoredAt` (text)
- `aiInsight` (text)

The repository migrations allow only the restricted `scoring-worker` role to
read sessions and create/update results. Do not open either collection to the
public. Configure these environment variables before running `listener.py`:

```
POCKETBASE_URL=https://your-shared-host.example
POCKETBASE_WORKER_EMAIL=worker@example.invalid
POCKETBASE_WORKER_PASSWORD=<secret from the deployment environment>
```

Create a dedicated `users` auth record with the `scoring-worker` role and keep its credentials outside
the source tree. Both the frontend and this worker must point at the same
PocketBase origin.

## 3. Install and run

```
pip install -r requirements.txt
python train_classifier.py      # creates model.joblib, one-time
python listener.py
```

Leave `listener.py` running. It polls every 3 seconds and scores any new
`uploaded` session automatically.

## 4. Pointing at a phone instead of localhost

If your app is running as an installed APK (not just a browser on the same
laptop as PocketBase), `localhost` won't reach it. Use the same approach as
the frontend:

```
ngrok http 8090
```

Then run the pipeline against that tunnel instead of localhost:
```
POCKETBASE_URL=https://your-tunnel.ngrok-free.app python listener.py
```
Make sure the **app** is also pointed at the same ngrok URL (see the
frontend's `PB_SETUP.md` / `.env.local`), so both sides are talking to the
same PocketBase instance.

## What changed from the Firebase version

| File | Change |
|---|---|
| `pb_client.py` | **New** — replaces all `firebase-admin` calls with plain REST requests |
| `pipeline.py` | Downloads frames via `pb_client.download_frame`, writes results via `pb_client.create_result_record` |
| `listener.py` | Polls every 3s instead of using Firestore's `on_snapshot` |
| `feature_extraction.py`, `fusion.py`, `train_classifier.py`, `heatmap.py` | **Unchanged** — no Firebase dependency in these to begin with |

## Known gaps, still worth flagging in your demo
- Same as before: synthetic-trained classifier, gaze is a phone-camera proxy signal, no real ASD-labeled dataset yet.
- Polling has a ~3 second max delay before a session gets scored — imperceptible for a demo, but worth knowing it's not instant like the old Firestore listener.
- API rules are wide open for demo speed — don't ship this configuration anywhere beyond your own hackathon demo.
