onRecordCreateRequest((event) => {
  if (!event.hasSuperuserAuth()) event.record.set("role", "parent");
  event.next();
}, "users");

onRecordCreateRequest((event) => {
  if (!event.record.getBool("consent")) {
    throw new BadRequestError("Guardian consent is required to create a child profile.");
  }
  event.record.set("consentAt", new Date().toISOString());
  event.record.set("riskFlag", "pending");
  event.record.set("sessionCount", 0);
  event.record.set("streakComplete", false);
  event.record.set("sessionsToday", 0);
  event.record.set("lastSessionDate", "");
  event.record.set("lastCompletedDate", "");
  event.record.set("streakDays", 0);
  event.next();
}, "children");

onRecordCreateRequest((event) => {
  const dailySessionLimit = 2;
  const childId = event.record.getString("child");
  if (!childId) throw new BadRequestError("A child record is required.");

  const child = event.app.findRecordById("children", childId);
  event.record.set("childId", child.id);
  const today = new Date().toISOString().slice(0, 10);
  const lastSessionDate = child.getString("lastSessionDate");
  // A reservation that never reached upload is superseded by the next one, so
  // an abandoned session does not hold a daily slot.
  const abandoned = event.app.findRecordsByFilter(
    "sessions",
    "child = {:childId} && status = 'in_progress'",
    "",
    50,
    0,
    { childId },
  );
  const sessionsToday = lastSessionDate === today
    ? Math.max(0, child.getInt("sessionsToday") - abandoned.length)
    : 0;

  if (sessionsToday >= dailySessionLimit) {
    throw new BadRequestError("This child has reached the daily session limit of 2.");
  }
  for (const stale of abandoned) {
    stale.set("status", "abandoned");
    event.app.save(stale);
  }

  const originalSessionsToday = child.getInt("sessionsToday");
  const originalStreakComplete = child.getBool("streakComplete");
  const originalLastSessionDate = lastSessionDate;
  if (lastSessionDate !== today) {
    child.set("sessionsToday", 0);
    child.set("streakComplete", false);
  }
  child.set("lastSessionDate", today);
  child.set("sessionsToday", sessionsToday + 1);
  event.app.save(child);

  event.record.set("status", "in_progress");
  event.record.set("streakCounted", false);
  try {
    event.next();
  } catch (error) {
    child.set("sessionsToday", originalSessionsToday);
    child.set("streakComplete", originalStreakComplete);
    child.set("lastSessionDate", originalLastSessionDate);
    event.app.save(child);
    for (const stale of abandoned) {
      stale.set("status", "in_progress");
      event.app.save(stale);
    }
    throw error;
  }
}, "sessions");

onRecordUpdateRequest((event) => {
  const original = event.record.original();
  if (!["in_progress", "uploaded"].includes(original.getString("status"))) {
    throw new BadRequestError("Only a reserved session can be completed.");
  }
  event.record.set("child", original.getString("child"));
  event.record.set("childId", original.getString("childId"));
  event.record.set("sessionId", original.getString("sessionId"));
  if (event.record.getString("status") !== "uploaded") {
    throw new BadRequestError("Session uploads must move to uploaded status.");
  }
  event.record.set("status", "uploaded");
  event.record.set("streakCounted", original.getBool("streakCounted"));
  event.next();
}, "sessions");

onRecordUpdateRequest((event) => {
  if (!event.hasSuperuserAuth() && event.auth && event.auth.getString("role") === "parent") {
    const original = event.record.original();
    event.record.set("parent", original.getString("parent"));
    for (const field of [
      "riskFlag",
      "sessionCount",
      "streakComplete",
      "sessionsToday",
      "lastSessionDate",
      "lastCompletedDate",
      "streakDays",
    ]) {
      event.record.set(field, original.get(field));
    }
  }
  event.next();
}, "children");

onRecordUpdateRequest((event) => {
  if (!event.hasSuperuserAuth() && event.auth) {
    event.record.set("role", event.record.original().getString("role"));
  }
  event.next();
}, "users");

onRecordCreateRequest((event) => {
  const sessionId = event.record.getString("sessionId");
  if (!sessionId) throw new BadRequestError("A scored result must reference a session.");

  const session = event.app.findFirstRecordByFilter(
    "sessions",
    "sessionId = {:sessionId}",
    { sessionId },
  );
  event.record.set("session", session.id);
  event.next();
}, "results");

onRecordAfterCreateSuccess((event) => {
  const session = event.app.findFirstRecordByFilter(
    "sessions",
    "sessionId = {:sessionId}",
    { sessionId: event.record.getString("sessionId") },
  );
  if (session.getBool("streakCounted")) {
    event.next();
    return;
  }

  const child = event.app.findRecordById("children", session.getString("child"));
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const lastCompletedDate = child.getString("lastCompletedDate");

  child.set("sessionCount", child.getInt("sessionCount") + 1);
  child.set("streakComplete", true);
  child.set("streakDays", lastCompletedDate === today
    ? child.getInt("streakDays")
    : lastCompletedDate === yesterday
      ? child.getInt("streakDays") + 1
      : 1);
  child.set("lastCompletedDate", today);
  const score = event.record.getFloat("riskScore");
  child.set("riskFlag", score < 0.33 ? "low" : score < 0.66 ? "moderate" : "elevated");
  session.set("status", "completed");
  session.set("streakCounted", true);

  event.app.save(child);
  event.app.save(session);
  event.next();
}, "results");

onRecordAfterCreateSuccess((event) => {
  const helpers = require(`${__hooks}/helpers.js`);
  helpers.upsertDoctorDirectory(event.app, event.record);
  event.next();
}, "children");

onRecordAfterUpdateSuccess((event) => {
  const helpers = require(`${__hooks}/helpers.js`);
  helpers.upsertDoctorDirectory(event.app, event.record);
  event.next();
}, "children");

routerAdd("GET", "/api/doctor/children/{childId}/details", (event) => {
  const user = event.auth;
  if (!user || user.getString("role") !== "doctor") {
    throw new ForbiddenError("Doctor access is required.");
  }

  const childId = event.request.pathValue("childId");
  const child = event.app.findRecordById("children", childId);
  const sessions = event.app.findRecordsByFilter(
    "sessions",
    "child = {:childId}",
    "-timestamp",
    500,
    0,
    { childId },
  );
  const results = event.app.findRecordsByFilter(
    "results",
    "session.child = {:childId}",
    "-scoredAt",
    500,
    0,
    { childId },
  );
  const conclusions = event.app.findRecordsByFilter(
    "conclusions",
    "child = {:childId}",
    "-createdAt",
    100,
    0,
    { childId },
  );

  event.json(200, {
    child: {
      id: child.id,
      displayName: child.getString("displayName"),
      riskFlag: child.getString("riskFlag"),
    },
    sessions: sessions.map((record) => record.publicExport()),
    results: results.map((record) => record.publicExport()),
    conclusions: conclusions.map((record) => record.publicExport()),
  });
}, $apis.requireAuth("users"));
