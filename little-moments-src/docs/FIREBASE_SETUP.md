# Firebase setup

The app uses the Firebase web SDK directly. No Firebase project is connected to this codebase yet; populate the six `VITE_FIREBASE_*` values in `.env.local` from the Firebase project settings before testing live reads and writes.

## Enable services

1. Create a Firebase project and register a web app.
2. Enable Cloud Firestore and Firebase Storage in the same project.
3. Copy the web app configuration values into `.env.local` using `.env.example` as the key list. These are client configuration values, not private server credentials.
4. Configure Firestore and Storage Security Rules for the intended parent and clinician access before handling any child data. The app does not include account sign-in, so do not use open test-mode rules or real identifying child data until access control is added.

## Data written by the child activity

On successful upload, the app writes a `sessions/{sessionId}` document with exactly this shape:

```json
{
  "sessionId": "UUID",
  "childId": "parent-entered ID",
  "timestamp": "ISO8601",
  "gameModule": "social-attention + tap-response",
  "framesUploaded": ["sessions/{sessionId}/frame_1.jpg"],
  "interactionEvents": [{ "type": "tap", "timestamp": "ISO8601", "responseTimeMs": 250 }],
  "status": "uploaded"
}
```

JPEG samples are uploaded to `sessions/{sessionId}/frame_N.jpg` in Firebase Storage. Camera use is optional and begins only after parent/guardian consent; when access is denied, the games continue without capturing frames.

## Data read by the clinician views

The dashboard listens to the `sessions` and `results` collections in real time. Result documents must include `sessionId`, numeric `riskScore` from 0 to 1, `features.expressionScores`, `features.gazeProxyMetrics`, `features.interactionMetrics`, `gazeHeatmapUrl`, `modelVersion`, and `scoredAt`. The insight panel reads an optional `aiInsight`, `insight`, or `summary` string when the scoring pipeline supplies one.

This prototype intentionally does not create Firestore documents, Storage buckets, or permissive access rules automatically. The caregiver-provided child ID is an identifier, not an authentication mechanism.