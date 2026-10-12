function upsertDoctorDirectory(app, child) {
  const matches = app.findRecordsByFilter(
    "doctor_directory",
    "child = {:childId}",
    "",
    1,
    0,
    { childId: child.id },
  );
  let directoryRecord = matches[0];
  if (!directoryRecord) {
    directoryRecord = new Record(app.findCollectionByNameOrId("doctor_directory"));
    directoryRecord.set("child", child.id);
  }

  directoryRecord.set("displayName", child.getString("displayName"));
  directoryRecord.set("riskFlag", child.getString("riskFlag") || "pending");
  app.save(directoryRecord);
}

module.exports = { upsertDoctorDirectory };
