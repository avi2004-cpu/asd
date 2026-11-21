/// <reference path="../pb_data/types.d.ts" />
// Step 3.1 -- the 5 locked collections (playbook Section 3) + RBAC API rules.
// Applied automatically by `pocketbase serve` (PocketBase v0.23+ JSVM API).
//
// Rules summary:
//   users        public sign-up as parent only; role can't be changed by the user
//   children     parent reads/writes own; doctors read all
//   sessions     parent creates for own child (limit enforced in pb_hooks); doctors read all;
//                status is only changed by the worker (superuser)
//   results      read by doctors only; written by the Python worker (superuser) only
//   conclusions  read by doctors only; written by the Python worker (superuser) only

const OWN_OR_DOCTOR_CHILD = 'child.parent = @request.auth.id || @request.auth.role = "doctor"';
const DOCTOR_ONLY = '@request.auth.role = "doctor"';

function autodates() {
  return [
    { type: "autodate", name: "created", onCreate: true, onUpdate: false },
    { type: "autodate", name: "updated", onCreate: true, onUpdate: true },
  ];
}

migrate((app) => {
  // ---- users (built-in auth collection): add role
  const users = app.findCollectionByNameOrId("users");
  if (!users.fields.getByName("role")) {
    users.fields.add(new SelectField({ name: "role", values: ["parent", "doctor"], maxSelect: 1 }));
  }
  users.createRule = '@request.body.role:isset = false || @request.body.role = "parent"';
  users.updateRule = "id = @request.auth.id && @request.body.role:isset = false";
  app.save(users);

  // ---- children
  const children = new Collection({
    type: "base",
    name: "children",
    listRule: 'parent = @request.auth.id || @request.auth.role = "doctor"',
    viewRule: 'parent = @request.auth.id || @request.auth.role = "doctor"',
    createRule: '@request.auth.role = "parent" && @request.body.parent = @request.auth.id',
    updateRule: "parent = @request.auth.id && (@request.body.parent:isset = false || @request.body.parent = @request.auth.id)",
    deleteRule: "parent = @request.auth.id",
    fields: [
      { type: "relation", name: "parent", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "name", required: true, max: 100 },
      { type: "date", name: "dob" },
      { type: "text", name: "gender", max: 30 },
      { type: "bool", name: "consent", required: true }, // required bool => must be true
      { type: "date", name: "consent_at" },
      { type: "number", name: "session_count", onlyInt: true, min: 0 },
      { type: "number", name: "sessions_today", onlyInt: true, min: 0 },
      { type: "text", name: "last_session_date", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
      ...autodates(),
    ],
    indexes: ["CREATE INDEX idx_children_parent ON children (parent)"],
  });
  app.save(children);

  // ---- sessions
  const sessions = new Collection({
    type: "base",
    name: "sessions",
    listRule: OWN_OR_DOCTOR_CHILD,
    viewRule: OWN_OR_DOCTOR_CHILD,
    createRule: '@request.auth.role = "parent" && child.parent = @request.auth.id',
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "child", required: true, collectionId: children.id, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "activity_type", required: true, values: ["game", "video"], maxSelect: 1 },
      { type: "json", name: "features", maxSize: 2000 },
      { type: "json", name: "gaze_points", maxSize: 200000 },
      { type: "number", name: "valid_face_ratio", min: 0, max: 1 },
      { type: "select", name: "status", values: ["pending", "scored", "flagged"], maxSelect: 1 },
      ...autodates(),
    ],
    indexes: [
      "CREATE INDEX idx_sessions_status ON sessions (status)",
      "CREATE INDEX idx_sessions_child ON sessions (child)",
    ],
  });
  app.save(sessions);

  // ---- results
  const results = new Collection({
    type: "base",
    name: "results",
    listRule: DOCTOR_ONLY,
    viewRule: DOCTOR_ONLY,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "session", required: true, collectionId: sessions.id, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "child", required: true, collectionId: children.id, maxSelect: 1, cascadeDelete: true },
      { type: "number", name: "risk_score", min: 0, max: 1 },
      { type: "text", name: "risk_level", max: 20 }, // Low | Moderate | Elevated
      { type: "text", name: "model_version", max: 50 },
      ...autodates(),
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_results_session ON results (session)",
      "CREATE INDEX idx_results_child ON results (child)",
    ],
  });
  app.save(results);

  // ---- conclusions
  const conclusions = new Collection({
    type: "base",
    name: "conclusions",
    listRule: DOCTOR_ONLY,
    viewRule: DOCTOR_ONLY,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      { type: "relation", name: "child", required: true, collectionId: children.id, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "risk_category", max: 20 },
      { type: "text", name: "trend_direction", max: 20 }, // improving | stable | worsening
      { type: "text", name: "summary_text", max: 2000 },
      ...autodates(),
    ],
    indexes: ["CREATE UNIQUE INDEX idx_conclusions_child ON conclusions (child)"],
  });
  app.save(conclusions);
}, (app) => {
  for (const name of ["conclusions", "results", "sessions", "children"]) {
    try {
      app.delete(app.findCollectionByNameOrId(name));
    } catch (_) {}
  }
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("role");
  users.createRule = "";
  users.updateRule = "id = @request.auth.id";
  app.save(users);
});
