# Frontend: Auth, Parent Flow & Doctor Dashboard (Person 2)

React + Vite + TypeScript + Tailwind + PocketBase JS SDK + Recharts.
Everything is coded against the locked contract in [`src/types/schema.ts`](src/types/schema.ts).

```
src/main.tsx                    pb.authStore.clear() on launch (TC05), HashRouter
src/App.tsx                     the 6 locked routes + role guards
src/lib/pb.ts                   PocketBase singleton (VITE_PB_URL, default http://127.0.0.1:8090)
src/lib/auth.tsx                useAuth() hook, RequireAuth route guard, logout()
src/lib/asd.ts                  GET /api/asd/config, daily-limit helpers, isDailyLimitError()
src/pages/Login.tsx             /login: routes parent -> /parent, doctor -> /doctor
src/pages/Signup.tsx            /signup: parent account + child profile + mandatory consent (TC02)
src/pages/ParentHome.tsx        /parent: child card, streak bar, Play / Video buttons, "Come back tomorrow" (TC10)
src/pages/DoctorList.tsx        /doctor: names + colour-coded risk badge only (TC13)
src/pages/DoctorReport.tsx      /doctor/report/:childId: score card, trend line, gaze scatter, conclusion (TC14)
src/pages/PlaySessionStub.tsx   TEMPORARY /play/:childId stand-in until Person 1's game is merged
src/components/                 shared UI (buttons, cards, RiskBadge, DailyLimitScreen, ChildFields)
```

## Run it

```powershell
npm install
copy .env.example .env.local   # optional, the default URL is already http://127.0.0.1:8090
npm run dev                    # http://localhost:5173
npm run build                  # typecheck + production build into dist/ (used by Capacitor)
```

PocketBase and `ml/worker.py` must be running (see [`BACKEND.md`](BACKEND.md)).
Demo logins come from `ml/seed.py`: `doctor@tjit.edu` and `demo.parent@tjit.edu`.

## Routes (constraint 6, locked)

| Route | Who | Screen |
|-------|-----|--------|
| `/login` | anyone | Login |
| `/signup` | anyone | Parent sign-up + child profile + consent |
| `/parent` | parent | Parent home |
| `/play/:childId?mode=game\|video` | parent | Person 1's activity screen |
| `/doctor` | doctor | Patient list |
| `/doctor/report/:childId` | doctor | Detailed report |

Unknown routes go to `/login`. A parent who opens a doctor route (or the reverse) is sent to their own home.
Routing uses `HashRouter` (`/#/parent`), so deep links work inside the Capacitor WebView without server rewrites.

## Hand-off notes for Person 1 (play screen)

1. Build `src/pages/PlaySession.tsx`. In `src/App.tsx`, change the stub import to
   `import PlaySession from "./pages/PlaySession";` and delete `PlaySessionStub.tsx`.
2. Read the child id with `useParams()` (`childId`). Read the mode with `useSearchParams().get("mode")`: `"game"` or `"video"`.
3. After the POST to `sessions`:
   - success: `navigate("/parent", { replace: true, state: { sessionSaved: true } })`
   - daily limit (400): `if (isDailyLimitError(err)) navigate("/parent", { replace: true, state: { dailyLimit: true, childId } })`
     (`isDailyLimitError` is in `src/lib/asd.ts`). Parent home then shows the full-screen "Come back tomorrow!" message.
4. `PlaySessionStub.tsx` shows the exact payload shape. It is also handy for testing the flow without a camera.

## Behaviour that maps to the checklist

- **TC02, consent:** "Save Profile" stays disabled, with a visible message, until the consent box is ticked.
  The app saves `consent: true` and `consent_at: new Date().toISOString()`, and the server hook rejects a missing consent too.
- **TC05, forced login:** `clearAuthOnLaunch()` runs before the first render, so every launch or reload starts at `/login`.
- **TC10, daily limit:** Parent home reads the server-owned counters (`sessions_today`, `last_session_date`, UTC day) and replaces
  the play buttons with "Come back tomorrow!" once `daily_limit` is reached. A 400 from the server hook
  (e.g. a second device) shows the same screen in full.
- **Streak bar:** `session_count / streak_length`, read live from `GET /api/asd/config`.
- **TC13, need-to-know:** the doctor list requests only `id,name` from `children` and `child,risk_level,risk_score` from
  `results`. Nothing else is fetched until a child is opened.
- **TC14, report:** latest score card on a 0 / 0.33 / 0.66 / 1 scale, a session-by-session trend line over the coloured risk bands,
  a gaze scatter of `gaze_points` (all sessions or one; flagged sessions excluded), the conclusion banner (or "pending, n of 3"),
  and a sessions table.
- **Mobile (Day 2):** touch targets are at least 48 px. There is no horizontal page scroll at 360 px; only the sessions table scrolls,
  inside its card.
