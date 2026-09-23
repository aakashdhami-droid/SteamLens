const axios = require("axios");

const STORE_SEARCH_API = "https://store.steampowered.com/api/storesearch/";

// ── Bigram Similarity (Dice's Coefficient) ──────────────────
// Splits strings into consecutive 2-char pairs and measures overlap.
// Returns 0–1 where 1 = identical bigram sets.

function getBigrams(str) {
  const bigrams = new Set();
  const s = str.toLowerCase();
  for (let i = 0; i < s.length - 1; i++) {
    bigrams.add(s.substring(i, i + 2));
  }
  return bigrams;
}

function bigramSimilarity(a, b) {
  if (!a || !b) return 0;
  const bigramsA = getBigrams(a);
  const bigramsB = getBigrams(b);
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let shared = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) shared++;
  }
  return (2 * shared) / (bigramsA.size + bigramsB.size);
}

// ── Fuzzy Score ─────────────────────────────────────────────
// Returns 0–100 score indicating how well `query` matches `name`.
// Tiers:
//   100  exact match (case-insensitive)
//    80  name starts with query
//    60  query is a substring of name
//  0–50  bigram similarity (scaled)

function fuzzyScore(query, name) {
  if (!query || !name) return 0;

  const q = query.toLowerCase().trim();
  const n = name.toLowerCase().trim();

  // Exact match
  if (q === n) return 100;

  // Name starts with query
  if (n.startsWith(q)) return 80;

  // Query is a substring of name
  if (n.includes(q)) return 60;

  // Bigram similarity scaled to 0–50
  const sim = bigramSimilarity(q, n);
  return Math.round(sim * 50);
}

// ── Search Steam Store ──────────────────────────────────────
// Calls the public Steam Store Search API (no API key needed).
// Uses cc=IN for Indian regional pricing consistency.

async function searchSteam(query) {
  const url = `${STORE_SEARCH_API}?term=${encodeURIComponent(query)}&l=english&cc=IN`;
  const { data } = await axios.get(url, { timeout: 8000 });

  if (!data || !Array.isArray(data.items)) {
    return [];
  }

  return data.items;
}

// ── Rank & Filter ───────────────────────────────────────────
// Filters to type=app (actual games), scores with fuzzyScore,
// sorts descending, and returns top `limit` clean results.
// Price is intentionally omitted — the Steam search API does
// not reliably return regional (INR) prices for all items.

function rankAndFilter(items, query, limit = 6) {
  const games = items
    .filter((item) => item.type === "app")
    .map((item, steamIndex) => ({
      appid: String(item.id),
      name: item.name,
      type: item.type,
      image: item.tiny_image || null,
      score: fuzzyScore(query, item.name),
      steamIndex, // preserve Steam's own relevance ordering for tiebreaks
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.steamIndex - b.steamIndex; // Steam's order as tiebreaker
    })
    .slice(0, limit);

  // Strip internal scoring fields before returning
  return games.map(({ appid, name, type, image }) => ({
    appid,
    name,
    type,
    image,
  }));
}

module.exports = {
  searchSteam,
  rankAndFilter,
  fuzzyScore, // exported for transparency / testing
};
