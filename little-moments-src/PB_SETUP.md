# PocketBase setup

## Run PocketBase locally

Download the archive for your operating system from [pocketbase.io/docs](https://pocketbase.io/docs/), extract it, and run the executable from a terminal:

```sh
./pocketbase serve
```

On Windows, run `pocketbase.exe serve`. Open `http://127.0.0.1:8090/_/` to create the first admin account and use the admin UI.

## Apply the backend schema

The repository contains PocketBase migrations and server hooks in `../pb_migrations` and `../pb_hooks`. Start PocketBase with the repository root as its working directory so it discovers these directories, and apply the migrations on first startup. The backend migration extends PocketBase's built-in `users` auth collection and creates `children`, `conclusions`, `doctor_directory`, and `videos`. The Person B migration adds on-device feature JSON and one optional grayscale thumbnail to sessions, plus structured trend fields to conclusions. Do not make session or result rules public.

The app expects these existing pipeline fields:

- `sessions`: `sessionId`, `childId`, `timestamp`, `gameModule`, `interactionEvents`, `status`, `features`, and optional `thumbnail`
- `results`: `sessionId`, `riskScore`, `features`, `gazeHeatmapUrl`, `modelVersion`, `scoredAt`, `aiInsight`, and optional `heatmapImage`

The migration adds the relations and ownership rules. Parent API access is limited to children assigned to their account. Doctors can list only `doctor_directory` fields (`displayName`, `riskFlag`); the custom authenticated details endpoint returns session history only after a child is opened. Server hooks enforce two new sessions per child per UTC day, maintain the completion count/streak only after a result is created, and synchronize the doctor's directory.

Parents can register through `/parent/signup`; doctor and `scoring-worker` records must be provisioned by an administrator. Create/link child records using the parent's record ID. The profile form records name, date of birth, gender, guardian consent, and a server-generated consent timestamp. The parent dashboard supports multiple children and switches between profiles. Create doctor accounts only for authorized clinicians, and create one restricted `scoring-worker` account for the Person B pipeline.

The video collection is seeded with a short sample clip (`title`, `url`, `durationSeconds`, and `learningObjective`). Replace the sample URL with approved hosted content before production use.

## On-device feature extraction

From `little-moments-src`, install the Face Landmarker runtime assets once:

```sh
npm install
npm run ml:assets
```

The app computes gaze-proxy and expression features on the device. It does not upload raw camera frames; with optional camera consent, it sends the compact feature vector and at most one small grayscale thumbnail for the session. The expression classifier model is optional; without it, MediaPipe blendshapes provide the documented prototype fallback. The thumbnail is stored with the session for the clinician detail view.

## Connect the app

Set `VITE_POCKETBASE_URL` in `.env.local` to the PocketBase origin, then restart the dev server. The default is `http://127.0.0.1:8090`.

The Person B scoring worker authenticates using its restricted `scoring-worker` account; never use an empty/public session or results API rule:

```sh
POCKETBASE_URL=https://your-shared-host.example \
POCKETBASE_WORKER_EMAIL=worker@example.invalid \
POCKETBASE_WORKER_PASSWORD=replace-with-a-secret \
python listener.py
```

The worker no longer exposes a feature-extraction HTTP endpoint or downloads camera frames. It validates the `sessions.features` vector sent by the app, scores it, uploads a gaze heatmap, and creates an explainable trend conclusion once the session threshold is reached. If camera consent is declined or on-device extraction is unavailable, activities remain playable and sessions are still saved with an empty feature vector; the resulting model output is synthetic-demo data, not a clinical measure.

For local LAN integration, run PocketBase bound to `0.0.0.0:8090` and configure `VITE_POCKETBASE_URL` and `POCKETBASE_URL` to the host's LAN address. For shared remote testing, deploy PocketBase on a server with HTTPS and persistent storage, then point both applications and the worker at that same origin. A deployment target and credentials were not provided, so this repository does not provision a public host. Do not expose the admin UI or use a public tunnel for production data.
