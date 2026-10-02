const express = require("express");
const router = express.Router();

const {
  isValidEmail,
  isValidPassword,
  hashPassword,
  comparePassword,
  generateToken,
} = require("../services/authService");
const { createUser, findUserByEmail, findUserById } = require("../db/database");
const { requireAuth } = require("../middleware/auth");

// ── POST /api/auth/register ────────────────────────────────
router.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }
    if (!isValidPassword(password)) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    // Check for existing user
    const existing = await findUserByEmail(email);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser(email, passwordHash);

    const token = generateToken(user);

    return res.status(201).json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
      token,
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/login ───────────────────────────────────
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user);

    return res.json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
      token,
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/logout ──────────────────────────────────
// JWT-based auth is stateless; logout is handled client-side by removing the token.
// This endpoint exists for API consistency.
router.post("/logout", (req, res) => {
  return res.json({ message: "Logged out successfully" });
});

// ── GET /api/auth/me ───────────────────────────────────────
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    return res.json({
      user: { id: user.id, email: user.email, created_at: user.created_at },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
