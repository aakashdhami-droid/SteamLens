const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getJwtSecret } = require("../middleware/auth");

const SALT_ROUNDS = 12;
const TOKEN_EXPIRY = "7d";

/**
 * Validate email format (basic but sufficient for this project).
 */
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

/**
 * Validate password strength.
 * Requires at least 6 characters.
 */
function isValidPassword(password) {
  return typeof password === "string" && password.length >= 6;
}

/**
 * Hash a plaintext password using bcrypt.
 */
async function hashPassword(password) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a signed JWT containing user id and email.
 */
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

module.exports = {
  isValidEmail,
  isValidPassword,
  hashPassword,
  comparePassword,
  generateToken,
};
