/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const sessions = app.findCollectionByNameOrId("sessions");
  sessions.fields.add(new Field({
    type: "json",
    id: "json100000034",
    name: "features",
    required: false,
    presentable: false,
    system: false,
    maxSize: 200000,
    hidden: false,
    help: "",
  }));
  sessions.fields.add(new Field({
    type: "file",
    id: "file100000035",
    name: "thumbnail",
    required: false,
    presentable: false,
    system: false,
    maxSelect: 1,
    maxSize: 204800,
    mimeTypes: ["image/jpeg"],
    thumbs: [],
    protected: false,
    hidden: false,
    help: "",
  }));
  app.save(sessions);

  const children = app.findCollectionByNameOrId("children");
  children.listRule =
    "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && parent = @request.auth.id)";
  children.viewRule =
    "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && parent = @request.auth.id)";
  app.save(children);

  const conclusions = app.findCollectionByNameOrId("conclusions");
  conclusions.fields.add(new Field({
    type: "json",
    id: "json100000036",
    name: "trend",
    required: false,
    presentable: false,
    system: false,
    maxSize: 50000,
    hidden: false,
    help: "",
  }));
  conclusions.fields.add(new Field({
    type: "number",
    id: "number100000037",
    name: "sessionsAnalyzed",
    required: false,
    presentable: false,
    system: false,
    min: null,
    max: null,
    onlyInt: true,
    hidden: false,
    help: "",
  }));
  conclusions.createRule = "@request.auth.role = 'scoring-worker'";
  app.save(conclusions);
}, (app) => {
  const sessions = app.findCollectionByNameOrId("sessions");
  sessions.fields.removeById("json100000034");
  sessions.fields.removeById("file100000035");
  app.save(sessions);

  const children = app.findCollectionByNameOrId("children");
  children.listRule = "@request.auth.role = 'parent' && parent = @request.auth.id";
  children.viewRule = "@request.auth.role = 'parent' && parent = @request.auth.id";
  app.save(children);

  const conclusions = app.findCollectionByNameOrId("conclusions");
  conclusions.fields.removeById("json100000036");
  conclusions.fields.removeById("number100000037");
  conclusions.createRule = null;
  app.save(conclusions);
});
