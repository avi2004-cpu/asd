# Early ASD Screening Prototype

**Early Detection of Autism in Toddlers Using Computer Vision.** This is a 2-day MVP built by a 3-person team.

It is an Android app (React + Vite + Capacitor) where a parent runs short play sessions with their toddler.
On-device MediaPipe face tracking turns each session into 7 numbers (gaze and expression features).
**No video ever leaves the phone.**
A Python Random Forest scores each session, and a doctor dashboard shows risk levels, trends and gaze plots.

> ⚠️ Research prototype. Risk scores come from a model trained on **synthetic data** and are a screening
> indicator only, **not a diagnosis**.

## Architecture

```
 Android app (Capacitor WebView)                PocketBase :8090               Python worker
 ┌──────────────────────────────┐   REST    ┌──────────────────────┐  REST  ┌────────────────────┐
 │ MediaPipe FaceLandmarker     │ ────────▶ │ users     children   │ ◀───── │ polls pending      │
 │ Look & Tap game / video      │           │ sessions  results    │ ─────▶ │ sessions, writes   │
 │ Parent + Doctor UI           │ ◀──────── │ conclusions  + hooks │        │ results/conclusions│
 └──────────────────────────────┘           └──────────────────────┘        └────────────────────┘
```

**Core rule:** the app, the vision code and the Python worker never call each other directly.
All communication goes through the PocketBase collections defined in [`src/types/schema.ts`](src/types/schema.ts).

## Team & branches

| Member | Area | Branch |
|--------|------|--------|
| Person 1 | Mobile app, MediaPipe vision, Look & Tap game, Android APK | `feat/vision-mobile` |
| Person 2 | Login/Signup + consent, Parent home, Doctor list & report | `feat/ui-dashboard` |
| Person 3 | PocketBase schema/rules/hooks, ML training, scoring worker | `feat/backend-ml` |

Each person works on their own branch and opens a PR into `main`.
Day 1 branches merge into `dev` for the end-to-end dry run.

## Locked contract (do not change without group approval)

- **Collections:** `users` (role: parent | doctor), `children`, `sessions`, `results`, `conclusions`
- **Feature keys:** `avg_expr, gaze_mean_x, gaze_mean_y, gaze_var_x, gaze_var_y, tap_count, avg_response_ms`
- **Bounds:** gaze/expression values are clamped to `[0, 1]`. Frames with no face are `null` and excluded from the mean.
- **Session status:** `flagged` if `valid_face_ratio < 0.2`, otherwise `pending`. The worker sets `scored`.
- **Risk:** Low `< 0.33` ≤ Moderate `< 0.66` ≤ Elevated
- **Limits:** `STREAK_LENGTH = 3`, `DAILY_LIMIT = 2` sessions per day
- **Routes:** `/login`, `/signup`, `/parent`, `/play/:childId`, `/doctor`, `/doctor/report/:childId`
- **Sampling:** 1 frame every 2000 ms at 320×240. Skip a frame if the previous inference is still running.
- **Auth:** `pb.authStore.clear()` on app launch, so every launch starts at the login screen.
- **Networking:** the app uses `http://127.0.0.1:8090`. A USB phone reaches the laptop via `adb reverse tcp:8090 tcp:8090`.

## Quick start

| Part | How |
|------|-----|
| Backend + ML | See [`BACKEND.md`](BACKEND.md) on `feat/backend-ml` (PocketBase + `ml/worker.py`) |
| Frontend | `npm install`, then `npm run dev` (once the Vite app is added) |
| Android | `npm run build`, then `npx cap sync android`, then build the debug APK in Android Studio |

## Pre-demo checklist

1. Consent is required to save a child profile (TC02)
2. Reopening the app always shows Login first (TC05)
3. Only the feature JSON (< 500 bytes) is uploaded. No video frames.
4. Covering the camera flags the session (TC08)
5. A result appears within 3 seconds of finishing a session
6. A 3rd session on the same day shows "Come back tomorrow" (TC10)
7. The 3rd session of the streak creates a conclusion (TC12)
8. The doctor sees only names + risk badges until they click a child (TC13–TC14)
