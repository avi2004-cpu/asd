/// <reference path="../pb_data/types.d.ts" />
// Step 3.2 -- server-side usage & streak hooks (PocketBase v0.23+ JSVM API).
//
// The playbook names the pre-v0.23 hooks onRecordBeforeCreateRequest /
// onRecordAfterCreateRequest; in current PocketBase both are a single
// onRecordCreateRequest handler: code before e.next() = "before", after = "after".
//
// Note: every handler runs in its own isolated context, so shared config is
// require()d inside each handler rather than declared at the top of the file.

// Public config so the parent UI can draw the streak bar (session_count / streak_length).
routerAdd("GET", "/api/asd/config", (e) => {
  const cfg = require(`${__hooks}/asd_config.js`);
  return e.json(200, { streak_length: cfg.STREAK_LENGTH, daily_limit: cfg.DAILY_LIMIT });
});

// ---- users: self sign-up is always a parent (doctors are seeded by the backend).
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    if (!e.record.get("role")) e.record.set("role", "parent");
    if (e.record.get("role") !== "parent") {
      throw new BadRequestError("Only parent accounts can self-register.");
    }
  }
  e.next();
}, "users");

// ---- children: clients can never set the server-owned counters.
onRecordCreateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    e.record.set("session_count", 0);
    e.record.set("sessions_today", 0);
    e.record.set("last_session_date", "");
    if (!e.record.get("consent")) {
      throw new BadRequestError("Consent to camera use and data collection is required.");
    }
    if (!e.record.getString("consent_at")) e.record.set("consent_at", new Date().toISOString());
  }
  e.next();
}, "children");

onRecordUpdateRequest((e) => {
  if (!e.hasSuperuserAuth()) {
    const orig = e.record.original();
    for (const f of ["session_count", "sessions_today", "last_session_date"]) {
      e.record.set(f, orig.get(f));
    }
  }
  e.next();
}, "children");

// ---- sessions: daily limit (before insert) + atomic counter increment (after insert).
onRecordCreateRequest((e) => {
  // Superuser inserts (seed / backfill) bypass the limit and do not touch counters.
  if (e.hasSuperuserAuth()) {
    e.next();
    return;
  }

  const cfg = require(`${__hooks}/asd_config.js`);

  // Clients may only submit "pending" or "flagged"; "scored" is set by the worker.
  e.record.set("status", e.record.getString("status") === "flagged" ? "flagged" : "pending");

  const today = new Date().toISOString().slice(0, 10); // UTC YYYY-MM-DD

  e.app.runInTransaction((txApp) => {
    let child;
    try {
      child = txApp.findRecordById("children", e.record.getString("child"));
    } catch (_) {
      throw new BadRequestError("Unknown child profile.");
    }
    if (child.getString("parent") !== e.auth.id) {
      throw new ForbiddenError("You can only start sessions for your own child.");
    }

    const sameDay = child.getString("last_session_date") === today;
    const todayCount = sameDay ? child.getInt("sessions_today") : 0;
    if (todayCount >= cfg.DAILY_LIMIT) {
      throw new BadRequestError(cfg.LIMIT_MESSAGE);
    }

    // Insert the session inside the same transaction as the counter update.
    e.app = txApp;
    e.next();

    // Flagged (no face / camera covered) sessions don't count toward the streak or the daily limit.
    if (e.record.getString("status") !== "flagged") {
      child.set("session_count", child.getInt("session_count") + 1);
      child.set("sessions_today", todayCount + 1);
      child.set("last_session_date", today);
      txApp.save(child);
    }
  });
}, "sessions");
