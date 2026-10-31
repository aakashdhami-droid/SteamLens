/**
 * CORS origin configuration and validation helpers.
 */

function getClientOrigins(clientUrlEnv = process.env.CLIENT_URL) {
  return (clientUrlEnv || "")
    .split(",")
    .map((url) => url.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

function isOriginAllowed(
  origin,
  isProduction = process.env.NODE_ENV === "production",
  clientUrlEnv = process.env.CLIENT_URL
) {
  // Allow requests with no origin (e.g. server-to-server, curl, health checks)
  if (!origin) return true;

  const normalized = origin.trim().replace(/\/+$/, "");
  const allowedOrigins = getClientOrigins(clientUrlEnv);

  // Explicitly configured origins from CLIENT_URL are always allowed
  if (allowedOrigins.includes(normalized)) return true;

  // In production, allow ONLY explicitly configured CLIENT_URL origins
  if (isProduction) {
    return false;
  }

  // In development, preserve localhost and 127.0.0.1 on any port
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  return false;
}

module.exports = {
  getClientOrigins,
  isOriginAllowed,
};
