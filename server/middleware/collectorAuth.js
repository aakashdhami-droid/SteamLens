/**
 * Collector admin authentication middleware.
 * Protects manual trigger endpoints (e.g. /api/collector/run) with COLLECTOR_ADMIN_KEY.
 * Requires the key in request headers:
 * - x-collector-admin-key, or
 * - x-collector-key, or
 * - x-admin-key
 */
function requireCollectorKey(req, res, next) {
  const expectedKey = process.env.COLLECTOR_ADMIN_KEY;
  const providedKey =
    req.headers["x-collector-admin-key"] ||
    req.headers["x-collector-key"] ||
    req.headers["x-admin-key"];

  if (!expectedKey || !providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      error: "Unauthorized: Invalid or missing collector admin key",
    });
  }

  next();
}

module.exports = { requireCollectorKey };
