const express = require("express");
const router = express.Router();

const { requireAuth, optionalAuth } = require("../middleware/auth");
const { fetchGameDetails } = require("../services/steamService");
const { processVoteOnAttributes } = require("../services/preferenceService");
const { calculateCompatibility } = require("../services/compatibilityService");
const db = require("../db/database");

// ── POST /api/games/:appid/vote ────────────────────────────
// Submit or change a vote for a game. Authenticated users only.
router.post("/:appid/vote", requireAuth, async (req, res, next) => {
  try {
    const { appid } = req.params;
    const { vote } = req.body;

    // Validate appid
    if (!/^\d+$/.test(appid)) {
      return res.status(400).json({ error: "App ID must be a number" });
    }

    // Validate vote value: 1 (upvote) or -1 (downvote)
    if (vote !== 1 && vote !== -1) {
      return res.status(400).json({ error: "Vote must be 1 (upvote) or -1 (downvote)" });
    }

    const userId = req.user.id;

    // Check existing vote to detect same-vote (idempotent) or vote change
    const existingVote = await db.getUserVote(userId, appid);

    if (existingVote && existingVote.vote === vote) {
      // Same vote submitted again — idempotent, do not re-process
      return res.json({
        vote: existingVote.vote,
        appid: existingVote.appid,
        message: "Vote unchanged",
      });
    }

    const oldVoteValue = existingVote ? existingVote.vote : null;

    // Fetch game's genres + tags for preference updates
    let gameAttributes = [];
    try {
      const gameDetails = await fetchGameDetails(appid);
      const rawAttributes = [...(gameDetails.genres || []), ...(gameDetails.tags || [])];
      // Deduplicate case-insensitively
      const seen = new Set();
      gameAttributes = rawAttributes.filter((attr) => {
        const lower = String(attr || "").trim().toLowerCase();
        if (!lower || seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
    } catch (err) {
      console.warn(`[VoteRoute] Could not fetch game details for appid ${appid}:`, err.message);
      // Proceed with vote even if attributes can't be fetched — preferences won't update
    }

    // Save the vote
    const savedVote = await db.upsertUserVote(userId, appid, vote);

    // Update user preference profile based on game attributes
    if (gameAttributes.length > 0) {
      await processVoteOnAttributes(db, userId, gameAttributes, vote, oldVoteValue);
    }


    return res.json({
      vote: savedVote.vote,
      appid: savedVote.appid,
      message: oldVoteValue !== null ? "Vote updated" : "Vote recorded",
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/games/:appid/vote ─────────────────────────────
// Get the current user's vote for a specific game.
router.get("/:appid/vote", requireAuth, async (req, res, next) => {
  try {
    const { appid } = req.params;

    if (!/^\d+$/.test(appid)) {
      return res.status(400).json({ error: "App ID must be a number" });
    }

    const existingVote = await db.getUserVote(req.user.id, appid);

    return res.json({
      appid,
      vote: existingVote ? existingVote.vote : null,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/games/:appid/compatibility ────────────────────
// Calculate compatibility for the authenticated user with a game.
router.get("/:appid/compatibility", optionalAuth, async (req, res, next) => {
  try {
    const { appid } = req.params;

    if (!/^\d+$/.test(appid)) {
      return res.status(400).json({ error: "App ID must be a number" });
    }

    // If not authenticated, return a prompt
    if (!req.user) {
      return res.json({
        authenticated: false,
        message: "Log in and rate games to see your personal match.",
      });
    }

    const userId = req.user.id;

    // Get user's vote count and preferences
    const [totalVotedGames, userPreferences] = await Promise.all([
      db.getUserVoteCount(userId),
      db.getAllUserPreferences(userId),
    ]);

    // Fetch game attributes
    let gameAttributes = [];
    try {
      const gameDetails = await fetchGameDetails(appid);
      gameAttributes = [...(gameDetails.genres || []), ...(gameDetails.tags || [])];
    } catch (err) {
      console.warn(`[CompatibilityRoute] Could not fetch game details for appid ${appid}:`, err.message);
    }

    const result = calculateCompatibility(userPreferences, gameAttributes, totalVotedGames);

    return res.json({
      authenticated: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/preferences ───────────────────────────────────
// Get the current user's learned preference profile.
router.get("/", requireAuth, async (req, res, next) => {
  try {
    const preferences = await db.getAllUserPreferences(req.user.id);
    const totalVotedGames = await db.getUserVoteCount(req.user.id);

    return res.json({
      totalVotedGames,
      preferences: preferences.map((p) => ({
        attribute: p.attribute,
        preference_score: p.preference_score,
        interaction_count: p.interaction_count,
        // Note: confidence is NOT exposed to the frontend
      })),
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
