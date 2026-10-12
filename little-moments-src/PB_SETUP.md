# PocketBase setup

## Run PocketBase locally

Download the archive for your operating system from [pocketbase.io/docs](https://pocketbase.io/docs/), extract it, and run the executable from a terminal:

```sh
./pocketbase serve
```

On Windows, run `pocketbase.exe serve`. Open `http://127.0.0.1:8090/_/` to create the first admin account and use the admin UI.

## Apply the backend schema

The repository contains PocketBase migrations and server hooks in `../pb_migrations` and `../pb_hooks`. Start PocketBase with the repository root as its working directory so it discovers these directories, and apply the migrations on first startup. The migration extends the existing `sessions` and `results` collections and creates `users`, `children`, `conclusions`, `doctor_directory`, and `videos`. Do not make session or result rules public.

The app expects these existing pipeline fields:

- `sessions`: `sessionId`, `childId`, `timestamp`, `gameModule`, `framesUploaded`, `interactionEvents`, `status`
- `results`: `sessionId`, `riskScore`, `features`, `gazeHeatmapUrl`, `modelVersion`, `scoredAt`, `aiInsight`, and optional `heatmapImage`

The migration adds the relations and ownership rules. Parent API access is limited to children assigned to their account. Doctors can list only `doctor_directory` fields (`displayName`, `riskFlag`); the custom authenticated details endpoint returns session history only after a child is opened. Server hooks enforce two new sessions per child per UTC day, maintain the completion count/streak only after a result is created, and synchronize the doctor's directory.

Accounts are intentionally not self-registering. Create `users` auth records in the PocketBase admin UI, set `role` to `parent`, `doctor`, or `scoring-worker`, and create/link child records using the parent's record ID. Use the PocketBase child record ID as the child ID in the activity form. Create doctor accounts only for authorized clinicians, and create one restricted `scoring-worker` account for the Person B pipeline.

The video collection is seeded with a short sample clip (`title`, `url`, `durationSeconds`, and `learningObjective`). Replace the sample URL with approved hosted content before production use.

## Connect the app

Set `VITE_POCKETBASE_URL` in `.env.local` to the PocketBase origin, then restart the dev server. The default is `http://127.0.0.1:8090`.

The Person B scoring worker authenticates using its restricted `scoring-worker` account; never use an empty/public session or results API rule:

```sh
POCKETBASE_URL=https://your-shared-host.example \
POCKETBASE_WORKER_EMAIL=worker@example.invalid \
POCKETBASE_WORKER_PASSWORD=replace-with-a-secret \
python listener.py
```

For local LAN integration, run PocketBase bound to `0.0.0.0:8090` and configure `VITE_POCKETBASE_URL` and `POCKETBASE_URL` to the host's LAN address. For shared remote testing, deploy PocketBase on a server with HTTPS and persistent storage, then point both applications and the worker at that same origin. A deployment target and credentials were not provided, so this repository does not provision a public host. Do not expose the admin UI or use a public tunnel for production data.
