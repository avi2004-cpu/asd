/// <reference path="../pb_data/types.d.ts" />

const textField = (name, id, required = false) => ({
  type: "text",
  id,
  name,
  required,
  presentable: false,
  system: false,
  min: 0,
  max: 0,
  pattern: "",
  autogeneratePattern: "",
  hidden: false,
  help: "",
});

const numberField = (name, id, required = false) => ({
  type: "number",
  id,
  name,
  required,
  presentable: false,
  system: false,
  min: null,
  max: null,
  onlyInt: true,
  hidden: false,
  help: "",
});

const boolField = (name, id) => ({
  type: "bool",
  id,
  name,
  required: false,
  presentable: false,
  system: false,
  hidden: false,
  help: "",
});

const relationField = (name, id, collectionId, required = false, cascadeDelete = false) => ({
  type: "relation",
  id,
  name,
  required,
  presentable: false,
  system: false,
  collectionId,
  cascadeDelete,
  minSelect: required ? 1 : 0,
  maxSelect: 1,
  displayFields: [],
  hidden: false,
  help: "",
});

const baseCollection = (name, id, fields, rules = {}) => new Collection({
  type: "base",
  id,
  name,
  fields,
  indexes: [],
  system: false,
  listRule: rules.listRule ?? null,
  viewRule: rules.viewRule ?? null,
  createRule: rules.createRule ?? null,
  updateRule: rules.updateRule ?? null,
  deleteRule: rules.deleteRule ?? null,
});

const addField = (collection, field) => collection.fields.add(new Field(field));

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new Field({
    type: "select",
    id: "select100000001",
    name: "role",
    required: false,
    presentable: false,
    system: false,
    maxSelect: 1,
    values: ["parent", "doctor", "scoring-worker"],
    hidden: false,
    help: "",
  }));
  users.fields.add(new Field({
    ...textField("parentName", "text100000026"),
    required: false,
  }));
  users.listRule = "id = @request.auth.id";
  users.viewRule = "id = @request.auth.id";
  users.createRule = "@request.body.role = 'parent'";
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = null;
  app.save(users);

  const children = baseCollection("children", "pbc_1000000002", [
    textField("displayName", "text100000002", true),
    {
      type: "date",
      id: "date100000027",
      name: "dateOfBirth",
      required: true,
      presentable: false,
      system: false,
      min: "",
      max: "",
      hidden: false,
      help: "",
    },
    {
      type: "select",
      id: "select100000028",
      name: "gender",
      required: true,
      presentable: false,
      system: false,
      maxSelect: 1,
      values: ["female", "male", "non-binary", "prefer-not-to-say"],
      hidden: false,
      help: "",
    },
    boolField("consent", "bool100000029"),
    textField("consentAt", "text100000030"),
    relationField("parent", "relation100000003", users.id, true),
    {
      type: "select",
      id: "select100000004",
      name: "riskFlag",
      required: true,
      presentable: false,
      system: false,
      maxSelect: 1,
      values: ["pending", "low", "moderate", "elevated"],
      hidden: false,
      help: "",
    },
    numberField("sessionCount", "number100000005"),
    boolField("streakComplete", "bool100000006"),
    numberField("sessionsToday", "number100000007"),
    textField("lastSessionDate", "text100000008"),
    textField("lastCompletedDate", "text100000009"),
    numberField("streakDays", "number100000010"),
  ], {
    listRule: "@request.auth.role = 'parent' && parent = @request.auth.id",
    viewRule: "@request.auth.role = 'parent' && parent = @request.auth.id",
    createRule: "@request.auth.role = 'parent' && @request.body.parent = @request.auth.id && @request.body.consent = true",
    updateRule: "@request.auth.role = 'parent' && parent = @request.auth.id",
  });
  app.save(children);

  const sessions = app.findCollectionByNameOrId("sessions");
  addField(sessions, relationField("child", "relation100000011", children.id));
  addField(sessions, boolField("streakCounted", "bool100000012"));
  addField(sessions, {
    type: "json",
    id: "json100000031",
    name: "featureSamples",
    required: false,
    presentable: false,
    system: false,
    maxSize: 0,
    hidden: false,
    help: "",
  });
  sessions.listRule = "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && child.parent = @request.auth.id)";
  sessions.viewRule = "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && child.parent = @request.auth.id)";
  sessions.createRule = "@request.auth.role = 'parent' && child.parent = @request.auth.id";
  sessions.updateRule = "@request.auth.role = 'parent' && child.parent = @request.auth.id";
  sessions.deleteRule = null;
  app.save(sessions);

  const results = app.findCollectionByNameOrId("results");
  addField(results, relationField("session", "relation100000013", sessions.id));
  results.listRule = "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && session.child.parent = @request.auth.id)";
  results.viewRule = "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && session.child.parent = @request.auth.id)";
  results.createRule = "@request.auth.role = 'scoring-worker'";
  results.updateRule = "@request.auth.role = 'scoring-worker'";
  results.deleteRule = null;
  app.save(results);

  const conclusions = baseCollection("conclusions", "pbc_1000000003", [
    relationField("child", "relation100000014", children.id, true),
    relationField("session", "relation100000015", sessions.id),
    textField("summary", "text100000016", true),
    textField("createdAt", "text100000017", true),
  ], {
    listRule: "@request.auth.role = 'parent' && child.parent = @request.auth.id",
    viewRule: "@request.auth.role = 'parent' && child.parent = @request.auth.id",
  });
  app.save(conclusions);

  const directory = baseCollection("doctor_directory", "pbc_1000000004", [
    relationField("child", "relation100000018", children.id, true),
    textField("displayName", "text100000019", true),
    {
      type: "select",
      id: "select100000020",
      name: "riskFlag",
      required: true,
      presentable: false,
      system: false,
      maxSelect: 1,
      values: ["pending", "low", "moderate", "elevated"],
      hidden: false,
      help: "",
    },
  ], {
    listRule: "@request.auth.role = 'doctor'",
    viewRule: "@request.auth.role = 'doctor'",
  });
  app.save(directory);

  const videos = baseCollection("videos", "pbc_1000000005", [
    textField("title", "text100000021", true),
    textField("url", "text100000022"),
    {
      type: "file",
      id: "file100000023",
      name: "file",
      required: false,
      presentable: false,
      system: false,
      maxSelect: 1,
      maxSize: 0,
      mimeTypes: ["video/mp4", "video/webm"],
      thumbs: [],
      protected: false,
      hidden: false,
      help: "",
    },
    numberField("durationSeconds", "number100000024", true),
    textField("learningObjective", "text100000025", true),
  ], {
    listRule: "",
    viewRule: "",
  });
  app.save(videos);

  const seedVideos = [
    {
      title: "Watching a flower bloom",
      url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
      durationSeconds: 5,
      learningObjective: "visual-attention",
    },
  ];
  for (const seed of seedVideos) {
    const record = new Record(videos);
    record.set("title", seed.title);
    record.set("url", seed.url);
    record.set("durationSeconds", seed.durationSeconds);
    record.set("learningObjective", seed.learningObjective);
    app.save(record);
  }
}, (app) => {
  const sessions = app.findCollectionByNameOrId("sessions");
  sessions.fields.removeById("relation100000011");
  sessions.fields.removeById("bool100000012");
  sessions.fields.removeById("json100000031");
  sessions.listRule = "";
  sessions.viewRule = "";
  sessions.createRule = "";
  sessions.updateRule = "";
  sessions.deleteRule = "";
  app.save(sessions);

  const results = app.findCollectionByNameOrId("results");
  results.fields.removeById("relation100000013");
  results.listRule = "";
  results.viewRule = "";
  results.createRule = "";
  results.updateRule = "";
  results.deleteRule = "";
  app.save(results);

  for (const name of ["videos", "doctor_directory", "conclusions", "children", "users"]) {
    if (name === "users") {
      const users = app.findCollectionByNameOrId("users");
      users.fields.removeById("select100000001");
      users.fields.removeById("text100000026");
      users.listRule = null;
      users.viewRule = null;
      users.createRule = null;
      users.updateRule = null;
      app.save(users);
      continue;
    }
    const collection = app.findCollectionByNameOrId(name);
    app.delete(collection);
  }
});
