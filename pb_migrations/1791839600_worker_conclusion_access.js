/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const conclusions = app.findCollectionByNameOrId("conclusions");
  conclusions.listRule =
    "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && child.parent = @request.auth.id)";
  conclusions.viewRule =
    "@request.auth.role = 'scoring-worker' || (@request.auth.role = 'parent' && child.parent = @request.auth.id)";
  app.save(conclusions);
}, (app) => {
  const conclusions = app.findCollectionByNameOrId("conclusions");
  conclusions.listRule = "@request.auth.role = 'parent' && child.parent = @request.auth.id";
  conclusions.viewRule = "@request.auth.role = 'parent' && child.parent = @request.auth.id";
  app.save(conclusions);
});
