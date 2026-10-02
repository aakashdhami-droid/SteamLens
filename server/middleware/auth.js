const jwt = require("jsonwebtoken");

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not configured");
  }
  return secret;
}

/**
 * Authentication middleware.
 * Verifies the JWT from the Authorization header and attaches req.user = { id, email }.
 * Returns 401 if token is missing/invalid/expired.
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = { id: payload.id, email: payload.email };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please log in again." });
    }
    return res.status(401).json({ error: "Invalid authentication token" });
  }
}

/**
 * Optional auth middleware.
 * If a valid token is present, attaches req.user. Otherwise proceeds without it.
 * Never returns 401.
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, getJwtSecret());
    req.user = { id: payload.id, email: payload.email };
  } catch {
    req.user = null;
  }
  next();
}

module.exports = { requireAuth, optionalAuth, getJwtSecret };
