/**
 * ═══════════════════════════════════════════════════════════════
 * SteamLens Preference Service
 * ═══════════════════════════════════════════════════════════════
 *
 * PREFERENCE SCORE FORMULA
 * ────────────────────────
 * For each attribute (Steam genre or tag), we maintain:
 *   P = positive evidence count (from upvoted games containing this attribute)
 *   M = negative evidence count (from downvoted games containing this attribute)
 *   N = total interaction count = P + M
 *
 * The preference score is the normalized net evidence:
 *
 *   preference_score = (P - M) / N
 *
 * Properties:
 * - Range: [-1.0, +1.0]
 * - Positive (+1.0 max): user consistently upvotes games with this attribute
 * - Negative (-1.0 min): user consistently downvotes games with this attribute
 * - Zero (0.0): perfectly balanced or neutral
 *
 *
 * CONFIDENCE FORMULA (INTERNAL ONLY - NEVER SHOWN TO USER)
 * ────────────────────────────────────────────────────────
 * Confidence represents how much evidence exists for this preference,
 * weighted by the consistency of the evidence:
 *
 *   confidence = 1 - 1 / (1 + N * |preference_score|)
 *              = 1 - 1 / (1 + |P - M|)
 *
 * Properties:
 * - Range: [0.0, 1.0)
 * - Starts at 0.0 with 0 interactions
 * - 1 consistent interaction (|P - M| = 1) → confidence = 1 - 1/2 = 0.50
 * - 2 consistent interactions (|P - M| = 2) → confidence = 1 - 1/3 = 0.67
 * - 5 consistent interactions (|P - M| = 5) → confidence = 1 - 1/6 = 0.83
 * - 10 consistent interactions (|P - M| = 10) → confidence = 1 - 1/11 = 0.91
 * - Inconsistent interactions (e.g. P=3, M=2 → |P - M| = 1) keep confidence at 0.50
 * - Perfectly conflicting interactions (P=2, M=2 → |P - M| = 0) yield confidence = 0.0
 *
 *
 * VOTE CHANGE BEHAVIOR
 * ────────────────────
 * When a user changes their vote on a game (e.g. 👍 → 👎):
 * - For each attribute in that game:
 *     Previous positive contribution is decremented: P ← P - 1
 *     New negative contribution is incremented:      M ← M + 1
 *     Total interaction count N = P + M remains unchanged
 * - If user changes 👎 → 👍:
 *     M ← M - 1, P ← P + 1
 * - If user submits the exact same vote again:
 *     Handled idempotently without any modification
 *
 * This completely avoids double-counting and ensures the user's current
 * state is always an exact mathematical reflection of their active votes.
 *
 *
 * MINIMUM EVIDENCE THRESHOLD
 * ──────────────────────────
 * The compatibility score requires:
 *   total_voted_games >= 3
 *
 * Users with fewer than 3 votes are prompted to rate more games first.
 */

const MINIMUM_VOTES_FOR_COMPATIBILITY = 3;

/**
 * Reconstruct positive (P) and negative (M) counts from stored score and count.
 *   score = (P - M) / N
 *   count = P + M
 *   => P = count * (1 + score) / 2
 *   => M = count * (1 - score) / 2
 */
function countsFromScore(score, count) {
  if (!count || count <= 0) return { p: 0, m: 0 };
  const p = Math.round((count * (1 + score)) / 2);
  const m = count - p;
  return { p: Math.max(0, p), m: Math.max(0, m) };
}

/**
 * Calculate preference score from positive and negative counts.
 * Returns 0 if count is 0. Bounded to [-1.0, +1.0].
 */
function calculateScore(p, m) {
  const count = p + m;
  if (count <= 0) return 0;
  const score = (p - m) / count;
  return Math.max(-1, Math.min(1, Math.round(score * 1000) / 1000));
}

/**
 * Calculate confidence from positive and negative counts.
 * confidence = 1 - 1 / (1 + |P - M|)
 * Returns value in [0, 1). Bounded and deterministic.
 */
function calculateConfidence(p, m) {
  const net = Math.abs(p - m);
  const conf = 1 - 1 / (1 + net);
  return Math.max(0, Math.min(1, Math.round(conf * 1000) / 1000));
}

/**
 * Process a vote on a game's attributes, updating the user's preference profile.
 *
 * @param {Object} db                - database module
 * @param {number} userId            - authenticated user id
 * @param {string[]} attributes      - game genres + tags
 * @param {number} voteValue         - +1 (upvote) or -1 (downvote)
 * @param {number|null} oldVoteValue - previous vote (+1, -1) or null if new vote
 */
async function processVoteOnAttributes(db, userId, attributes, voteValue, oldVoteValue) {
  for (const rawAttr of attributes) {
    const attribute = String(rawAttr).trim();
    if (!attribute) continue;

    const existing = await db.getUserPreference(userId, attribute);

    let { p, m } = existing
      ? countsFromScore(existing.preference_score, existing.interaction_count)
      : { p: 0, m: 0 };

    if (oldVoteValue === 1 && voteValue === -1) {
      // Changed from UP to DOWN: remove 1 positive, add 1 negative
      p = Math.max(0, p - 1);
      m = m + 1;
    } else if (oldVoteValue === -1 && voteValue === 1) {
      // Changed from DOWN to UP: remove 1 negative, add 1 positive
      m = Math.max(0, m - 1);
      p = p + 1;
    } else if (oldVoteValue === null || oldVoteValue === undefined) {
      // New vote
      if (voteValue === 1) {
        p = p + 1;
      } else if (voteValue === -1) {
        m = m + 1;
      }
    }

    const newCount = p + m;
    const newScore = calculateScore(p, m);
    const newConfidence = calculateConfidence(p, m);

    await db.upsertUserPreference(userId, attribute, newScore, newConfidence, newCount);
  }
}

module.exports = {
  MINIMUM_VOTES_FOR_COMPATIBILITY,
  countsFromScore,
  calculateScore,
  calculateConfidence,
  processVoteOnAttributes,
};

