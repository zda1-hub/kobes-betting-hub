function enabled(env, now = new Date()) {
  if (env.ROAD_TO_TRUCK_ENABLED !== 'true') return false;
  const startAt = env.ROAD_TO_TRUCK_START_AT;
  if (!startAt) return true;
  const start = Date.parse(startAt);
  return Number.isFinite(start) && +new Date(now) >= start;
}

module.exports = { enabled };
