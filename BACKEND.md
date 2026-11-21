# Backend & ML (Person 3)

PocketBase (schema, API rules, server hooks) + Python Random Forest scoring worker.
The app and the worker never call each other: everything goes through the PocketBase collections.

```
pb_migrations/1763700000_asd_collections.js  5 collections + RBAC rules (auto-applied on `serve`)
pb_hooks/main.pb.js                          daily-limit + streak-counter hooks, GET /api/asd/config
pb_hooks/asd_config.js                       STREAK_LENGTH=3, DAILY_LIMIT=2 (env overridable)
ml/contract.py                               feature order, thresholds (locked)
ml/train.py                                  synthetic data -> ml/model.joblib
ml/worker.py                                 polls pending sessions -> results + conclusions
ml/seed.py                                   doctor login + 4 demo children with history
ml/test_worker.py                            offline tests (no PocketBase needed)
src/types/schema.ts                          TypeScript interfaces for Persons 1 & 2
```

## Run it (Windows, PocketBase v0.23 or newer; tested target v0.40.x)

1. Download `pocketbase_<version>_windows_amd64.zip` from
   https://github.com/pocketbase/pocketbase/releases and put `pocketbase.exe` in the repo root (gitignored).
2. Create the superuser the worker uses, then start the server (migrations + hooks load automatically):
   ```powershell
   .\pocketbase.exe superuser upsert admin@tjit.edu <choose-a-password>
   .\pocketbase.exe serve
   ```
3. In a second terminal:
   ```powershell
   pip install -r ml/requirements.txt
   $env:PB_ADMIN_EMAIL="admin@tjit.edu"; $env:PB_ADMIN_PASSWORD="<same-password>"
   python ml/train.py      # only needed if model.joblib is missing/changed
   python ml/seed.py       # doctor + demo data (add --reset to rebuild)
   python ml/worker.py     # keep running
   ```
4. Android over USB: `adb reverse tcp:8090 tcp:8090`, the app uses `http://127.0.0.1:8090`.

Demo logins created by `seed.py` (override with `DEMO_DOCTOR_PASSWORD` / `DEMO_PARENT_PASSWORD`):

| Role   | Email                  | Password      |
|--------|------------------------|---------------|
| doctor | doctor@tjit.edu        | doctor12345   |
| parent | demo.parent@tjit.edu   | parent12345   |

Demo children: Aarav (Low, stable), Diya (Moderate, worsening), Kabir (Elevated, worsening), Meera (Moderate, improving).

## What the other two need to know

**Person 1 (mobile):** POST the Section-3 payload to `/api/collections/sessions/records` as the logged-in parent.
Send `status: "flagged"` when `valid_face_ratio < 0.2`, else `"pending"` (anything else is forced to `pending`).
Feature keys must be exactly the 7 in `FEATURE_ORDER`. Bad or missing features get the session flagged by the worker, not scored.

**Person 2 (UI):**
- Sign-up: create a `users` record. `role` can be omitted (it defaults to `parent`). Doctors cannot self-register.
- Child profile: `consent: true` is required by the schema. `consent_at` is filled in if you omit it.
  `session_count`, `sessions_today`, `last_session_date` are server-owned. Values you send for them are ignored.
- Streak bar: `GET /api/asd/config` returns `{ streak_length, daily_limit }`.
- Daily limit: the session POST fails with **400** and message `Come back tomorrow! Daily session limit reached.`
- Doctor list: `children` + latest `results` (filter `child='<id>'`, sort `-created`). Doctor report: `results`, `sessions`
  (`gaze_points`), `conclusions` for the child.
- `results` and `conclusions` are readable by **doctors only**, so parents never see risk scores.

## Rules implemented

| Rule | Where |
|------|-------|
| Parents only see/write their own children & sessions; doctors read all | API rules in the migration |
| Only the worker (superuser) writes `results`, `conclusions`, or session `status` | create/update rules = superuser only |
| `sessions_today >= DAILY_LIMIT` on the same UTC day → 400 | `main.pb.js` sessions create hook |
| Non-flagged session → `session_count`/`sessions_today` +1, in the same transaction as the insert | `main.pb.js` |
| Flagged sessions don't count toward the streak or the daily limit | `main.pb.js` |
| Risk: Low < 0.33 ≤ Moderate < 0.66 ≤ Elevated | `contract.py` / `schema.ts` |
| Conclusion once `session_count >= STREAK_LENGTH` and that many results exist, one per child | `worker.py` + unique index |
| Trend: mean of first half vs last half of the streak (first vs last for 3), ±0.10 | `worker.py` |

## Deviations from the playbook (on purpose)

- **Hook names.** `onRecordBeforeCreateRequest` / `onRecordAfterCreateRequest` were removed in PocketBase v0.23.
  The same logic runs in a single `onRecordCreateRequest`: code before `e.next()` is "before", code after it is "after".
- **Poll interval is 1 s by default** (playbook says 3 s), so the "< 3 s scoring latency" checkpoint passes.
  Set `POLL_SECONDS=3` to use the original value.
- **Synthetic data caveat:** following the spec, `gaze_var_*` are trained on N(0.5, 0.2²), but real phone gaze variances are
  small (~0.001–0.05). Live sessions will therefore be scored mostly on `avg_expr`. This is fine for the demo, but don't present it as clinical.

## Tests

```powershell
python -m unittest ml/test_worker.py -v
```
