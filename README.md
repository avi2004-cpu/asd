# Little Moments — early autism screening prototype

A parent-facing app where a child plays short games and watches a daily video
while the device computes gaze-proxy and facial-expression features locally.
A scoring worker turns each session into a risk score, and after 25 scored
sessions writes a longitudinal conclusion that a clinician can review.

> **Prototype only.** The classifier is trained on synthetic placeholder data.
> Scores and conclusions have no clinical validity and are not a diagnosis.

## Repository layout

| Path | What it is |
|---|---|
| `little-moments-src/` | Frontend (React, TanStack Start, Vite, Capacitor): parent app, parent dashboard, doctor dashboard, on-device ML |
| `pb_migrations/` | PocketBase schema and API rules |
| `pb_hooks/` | PocketBase server hooks: daily limit, streak counter, doctor directory, doctor detail endpoint |
| `person_b_ml_pocketbase/` | Python scoring worker: feature validation, Random Forest scoring, gaze heatmap, conclusions |

## How a session flows

1. A parent signs up, creates a child profile (guardian consent required) and starts a session.
2. The app reserves the session in PocketBase, runs the games and video, and extracts features on the device. Raw camera frames are never uploaded.
3. The app uploads the feature vector (and at most one small grayscale thumbnail).
4. The worker scores the session and writes a result with a gaze heatmap.
5. The server increments the child's session count and streak, and updates the risk flag shown to doctors.
6. At 25 scored sessions the worker writes one conclusion with a level and a trend direction.

## Running it locally

You need Node.js, Python 3.11+, and the PocketBase executable from
[pocketbase.io](https://pocketbase.io/docs/).

### 1. PocketBase

From the repository root:

```sh
pocketbase serve --dir pb_data --hooksDir pb_hooks --migrationsDir pb_migrations
```

Migrations are applied on startup. Open `http://127.0.0.1:8090/_/` to create
the admin account, then create one `users` record with role `doctor` and one
with role `scoring-worker`. Parents register themselves in the app.

### 2. Frontend

```sh
cd little-moments-src
npm install
npm run ml:assets
npm run dev
```

Set `VITE_POCKETBASE_URL` in `.env.local` if PocketBase is not on
`http://127.0.0.1:8090`. See [`little-moments-src/PB_SETUP.md`](little-moments-src/PB_SETUP.md).

### 3. Scoring worker

```sh
cd person_b_ml_pocketbase
pip install -r requirements.txt
python listener.py
```

The worker reads `POCKETBASE_URL`, `POCKETBASE_WORKER_EMAIL`,
`POCKETBASE_WORKER_PASSWORD` and optionally `SESSION_THRESHOLD` (default 25)
from the environment. Do not commit credentials. See
[`person_b_ml_pocketbase/README.md`](person_b_ml_pocketbase/README.md).

## Checks

```sh
cd person_b_ml_pocketbase
python -m pytest
```

```sh
cd little-moments-src
npx tsc --noEmit
npm run lint
npm run build
```

## Server-enforced rules

- **Roles:** public signup always creates a `parent`; a user cannot change their own role.
- **Ownership:** parents can only read and write their own children, sessions, results and conclusions.
- **Doctors:** can list child names and risk flags only; full history is returned by `GET /api/doctor/children/{childId}/details` once a child is opened.
- **Daily limit:** 2 uploaded sessions per child per UTC day. A session that was started but never uploaded is marked `abandoned` by the next start and does not use a slot; starts are capped at 6 per day.
- **Streak:** the session count and streak only change when the worker writes a result, never from the client.
- **Conclusion:** written once, when the session count reaches the threshold. Sessions with fewer than 3 gaze samples are excluded, and fewer than 10 usable sessions gives `insufficient-data`.

## License

See [LICENSE.md](LICENSE.md).
