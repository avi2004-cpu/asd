/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const children = app.findCollectionByNameOrId("children");
  children.fields.add(new Field({
    type: "number",
    id: "number100000038",
    name: "reservationsToday",
    required: false,
    presentable: false,
    system: false,
    min: null,
    max: null,
    onlyInt: true,
    hidden: false,
    help: "",
  }));
  app.save(children);
}, (app) => {
  const children = app.findCollectionByNameOrId("children");
  children.fields.removeById("number100000038");
  app.save(children);
});
