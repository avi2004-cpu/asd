// Constraint 5 -- server-side config. Override with env vars before `pocketbase serve`.
// (Not a *.pb.js file, so PocketBase does not load it as a hook; it is require()d.)
module.exports = {
  STREAK_LENGTH: parseInt($os.getenv("STREAK_LENGTH") || "3", 10),
  DAILY_LIMIT: parseInt($os.getenv("DAILY_LIMIT") || "2", 10),
  LIMIT_MESSAGE: "Come back tomorrow! Daily session limit reached.",
};
