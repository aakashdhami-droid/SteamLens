/**
 * ═══════════════════════════════════════════════════════════════
 * SteamLens Compatibility Service
 * ═══════════════════════════════════════════════════════════════
 *
 * COMPATIBILITY FORMULA
 * ─────────────────────
 * For each of the game's attributes (genres + tags), we compute:
 *
 *   weighted_score = preference_score × confidence
 *
 * This gives a value in [-1, +1] representing the user's confident
 * opinion toward that attribute.
 *
 * The overall compatibility is computed as:
 *
 *   raw_average = sum(weighted_scores) / game_attribute_count
 *
 * This yields a value in [-1, +1]. We then normalize to 0–100%:
 *
 *   compatibility_percentage = round((raw_average + 1) / 2 × 100)
 *
 * Clamped to [0, 100].
 *
 * IMPORTANT DESIGN DECISIONS:
 * - Attributes NOT in the user's preference profile contribute 0
 *   (neutral), NOT a negative score. Unknown ≠ disliked.
 * - All game attributes are weighted equally in the average, so one
 *   unusual tag cannot dominate the result.
 * - Confidence controls how strongly a preference is trusted:
 *   a high-confidence negative preference pulls the score down more
 *   than a low-confidence one.
 *
 *
 * EXPLANATION GENERATION
 * ──────────────────────
 * For each game attribute that exists in the user's preferences:
 *
 *   effective = preference_score × confidence
 *
 * We classify each matched attribute into:
 *   ✓ Strong match:      effective >= 0.4
 *   ✓ Match:             effective >= 0.15
 *   ≈ Neutral:           |effective| < 0.15  (omitted from explanation)
 *   ⚠ Possible mismatch: effective <= -0.15
 *   ✗ Mismatch:          effective <= -0.4
 *
 * These thresholds map to user-facing labels without exposing raw numbers.
 */

const { MINIMUM_VOTES_FOR_COMPATIBILITY } = require("./preferenceService");

/**
 * Calculate game compatibility with a user's preference profile.
 *
 * @param {Array} userPreferences  - Array of { attribute, preference_score, confidence, interaction_count }
 * @param {string[]} gameAttributes - genres + tags for the game
 * @param {number} totalVotedGames - how many games the user has voted on
 * @returns {Object} { hasEnoughData, percentage, explanation[] }
 */
function calculateCompatibility(userPreferences, gameAttributes, totalVotedGames) {
  // Check minimum evidence threshold
  if (totalVotedGames < MINIMUM_VOTES_FOR_COMPATIBILITY) {
    return {
      hasEnoughData: false,
      percentage: null,
      explanation: [],
      totalVotedGames,
      minimumRequired: MINIMUM_VOTES_FOR_COMPATIBILITY,
    };
  }

  if (!gameAttributes || gameAttributes.length === 0) {
    return {
      hasEnoughData: true,
      percentage: 50, // Neutral if no attributes available
      explanation: [],
      totalVotedGames,
      minimumRequired: MINIMUM_VOTES_FOR_COMPATIBILITY,
    };
  }

  // Deduplicate game attributes case-insensitively while preserving display casing
  const uniqueMap = new Map();
  for (const attr of gameAttributes) {
    const trimmed = String(attr || "").trim();
    if (trimmed && !uniqueMap.has(trimmed.toLowerCase())) {
      uniqueMap.set(trimmed.toLowerCase(), trimmed);
    }
  }
  const uniqueAttributes = Array.from(uniqueMap.values());

  if (uniqueAttributes.length === 0) {
    return {
      hasEnoughData: true,
      percentage: 50,
      explanation: [],
      totalVotedGames,
      minimumRequired: MINIMUM_VOTES_FOR_COMPATIBILITY,
    };
  }

  // Build a lookup map from user preferences
  const prefMap = new Map();
  for (const pref of userPreferences) {
    prefMap.set(pref.attribute.toLowerCase(), pref);
  }

  let weightedSum = 0;
  const explanation = [];

  for (const attr of uniqueAttributes) {
    const pref = prefMap.get(attr.toLowerCase());


    if (pref) {
      const effective = pref.preference_score * pref.confidence;
      weightedSum += effective;

      // Classify for explanation
      const label = classifyAttribute(effective);
      if (label) {
        explanation.push({
          attribute: attr,
          label, // "strong_match" | "match" | "possible_mismatch" | "mismatch"
          effective, // internal use for sorting
        });
      }
    }
    // Attributes with no preference data contribute 0 (neutral)
  }

  // Normalize: raw_average in [-1, +1] → percentage [0, 100]
  const rawAverage = weightedSum / uniqueAttributes.length;
  const percentage = Math.round(Math.max(0, Math.min(100, ((rawAverage + 1) / 2) * 100)));

  // Sort explanation: strongest matches first, then mismatches
  explanation.sort((a, b) => {
    // Positive (matches) first, sorted by descending effective
    // Then negative (mismatches), sorted by ascending effective
    if (a.effective >= 0 && b.effective >= 0) return b.effective - a.effective;
    if (a.effective < 0 && b.effective < 0) return a.effective - b.effective;
    return b.effective - a.effective;
  });

  // Strip internal effective value from explanation before returning
  const cleanExplanation = explanation.map(({ attribute, label }) => ({ attribute, label }));

  return {
    hasEnoughData: true,
    percentage,
    explanation: cleanExplanation,
    totalVotedGames,
    minimumRequired: MINIMUM_VOTES_FOR_COMPATIBILITY,
  };
}

/**
 * Classify an attribute's effective score into a user-facing label.
 * Returns null for neutral attributes (omitted from explanation).
 */
function classifyAttribute(effective) {
  if (effective >= 0.4) return "strong_match";
  if (effective >= 0.15) return "match";
  if (effective <= -0.4) return "mismatch";
  if (effective <= -0.15) return "possible_mismatch";
  return null; // Neutral — omit from explanation
}

module.exports = { calculateCompatibility };
