# PocketBase setup

## Run PocketBase locally

Download the archive for your operating system from [pocketbase.io/docs](https://pocketbase.io/docs/), extract it, and run the executable from a terminal:

```sh
./pocketbase serve
```

On Windows, run `pocketbase.exe serve`. Open `http://127.0.0.1:8090/_/` to create the first admin account and use the admin UI.

## Create collections

Create two **Base** collections named `sessions` and `results`. The app reads session and result lists publicly and writes session records, so configure the API rules to allow the intended access for your local testing setup.

For `sessions`, add these fields:

- `sessionId` (text), `childId` (text), `timestamp` (text), `gameModule` (text)
- `framesUploaded` (file, multiple files allowed)
- `interactionEvents` (JSON)
- `status` (text)

The app writes the session data as `{ sessionId, childId, timestamp, gameModule, framesUploaded, interactionEvents, status: "uploaded" }`. `framesUploaded` is the PocketBase array of uploaded file names/paths.

For `results`, add the fields consumed by the Python scoring pipeline:

- `sessionId` (text), `riskScore` (number)
- `features` (JSON object containing `expressionScores`, `gazeProxyMetrics`, and `interactionMetrics`)
- `gazeHeatmapUrl` (text), `modelVersion` (text), `scoredAt` (text), `aiInsight` (text)

The app only reads this collection. Make sure your pipeline writes the same result shape.

## Connect the app

Set `VITE_POCKETBASE_URL` in `.env.local` to the PocketBase origin, then restart the dev server. The default is `http://127.0.0.1:8090`.

For phone testing, expose the PocketBase port with ngrok, for example `ngrok http 8090`, then set `VITE_POCKETBASE_URL` to the HTTPS forwarding URL ngrok provides (for example `https://example.ngrok-free.app`). The phone must be able to reach that URL; if app and PocketBase are on the same Wi-Fi, you can instead use the computer's LAN IP and port 8090. Restart the app after changing the URL.
