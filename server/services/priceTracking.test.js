/**
 * Unit tests for game tracking + initial price snapshot logic.
 *
 * Tests the fix for the bug where a tracked game could end up
 * with no price_history record if the initial fetchIndianPrice
 * call failed or returned null.
 *
 * Run with: node --test services/priceTracking.test.js
 */

const { describe, it, beforeEach, mock } = require("node:test");
const assert = require("node:assert/strict");

// ─── In-memory stores to simulate database ─────────────────
let trackedGames;    // Map<appid, { game_name, ... }>
let priceSnapshots;  // Array<{ appid, price_paise, ... }>

function resetStores() {
  trackedGames = new Map();
  priceSnapshots = [];
}

// ─── Mock database module ───────────────────────────────────
const mockDB = {
  addTrackedGame: async (appid, gameName) => {
    const key = String(appid);
    if (trackedGames.has(key)) {
      return { isNew: false };
    }
    trackedGames.set(key, {
      appid: key,
      game_name: gameName,
      tracking_started_at: new Date().toISOString(),
    });
    return { isNew: true };
  },

  getLatestPrice: async (appid) => {
    const key = String(appid);
    const matching = priceSnapshots.filter((s) => s.appid === key);
    return matching.length > 0 ? matching[matching.length - 1] : null;
  },

  savePriceSnapshot: async (data) => {
    const key = String(data.appid);
    // Dedup check: skip if identical to last snapshot
    const matching = priceSnapshots.filter((s) => s.appid === key);
    if (matching.length > 0) {
      const last = matching[matching.length - 1];
      if (
        last.price_paise === data.price_paise &&
        last.original_price_paise === data.original_price_paise &&
        last.discount_percent === data.discount_percent &&
        last.is_free === data.is_free
      ) {
        return { inserted: false };
      }
    }
    priceSnapshots.push({
      id: priceSnapshots.length + 1,
      appid: key,
      price_paise: data.price_paise ?? null,
      currency: data.currency || "INR",
      original_price_paise: data.original_price_paise ?? null,
      discount_percent: data.discount_percent ?? 0,
      is_free: data.is_free ?? false,
      recorded_at: new Date().toISOString(),
    });
    return { inserted: true };
  },

  getPriceHistory: async (appid) => {
    const key = String(appid);
    return priceSnapshots
      .filter((s) => s.appid === key)
      .map((s) => ({
        price_paise: s.price_paise,
        currency: s.currency,
        original_price_paise: s.original_price_paise,
        discount_percent: s.discount_percent,
        is_free: s.is_free,
        recorded_at: s.recorded_at,
      }));
  },
};

// ─── Simulate the FIXED game route logic ────────────────────
// This extracts the exact logic from the patched game.js routes
// to test in isolation, without needing Express or real HTTP.

/**
 * Simulates the "fresh analysis" price tracking path
 * (the code that runs after saveSummary when a game is analysed for the first time)
 */
async function freshAnalysisPriceTracking(appid, gameName, fetchIndianPriceFn) {
  let price_info = null;
  await mockDB.addTrackedGame(appid, gameName);

  // Fetch initial price snapshot if none exists yet.
  const existingPrice = await mockDB.getLatestPrice(appid);
  if (!existingPrice) {
    const initialPrice = await fetchIndianPriceFn(appid);
    if (initialPrice) {
      await mockDB.savePriceSnapshot(initialPrice);
    }
  }
  price_info = await mockDB.getLatestPrice(appid);
  return price_info;
}

/**
 * Simulates the "cached" price tracking path
 * (the code that runs when a cached summary is found)
 */
async function cachedPathPriceTracking(appid, fetchIndianPriceFn) {
  let price_info = await mockDB.getLatestPrice(appid);

  // If the game is tracked but has no price history (missed initial snapshot),
  // attempt to fetch and save one now.
  if (!price_info) {
    const initialPrice = await fetchIndianPriceFn(appid);
    if (initialPrice) {
      await mockDB.savePriceSnapshot(initialPrice);
      price_info = await mockDB.getLatestPrice(appid);
    }
  }
  return price_info;
}

// ─── Test suite ─────────────────────────────────────────────

describe("Price Tracking: Initial Snapshot Logic", () => {
  beforeEach(() => {
    resetStores();
  });

  // ── Test 1: New game gets tracked + snapshot ──
  it("newly analysed game gets added to tracked_games and receives its first price snapshot", async () => {
    const mockFetchPrice = async (appid) => ({
      appid: String(appid),
      price_paise: 52900,
      original_price_paise: 52900,
      discount_percent: 0,
      currency: "INR",
      is_free: false,
    });

    const priceInfo = await freshAnalysisPriceTracking("620", "Portal 2", mockFetchPrice);

    // Game must be tracked
    assert.ok(trackedGames.has("620"), "Game must be in tracked_games");
    assert.strictEqual(trackedGames.get("620").game_name, "Portal 2");

    // Price snapshot must exist
    assert.ok(priceInfo, "Price info must be returned");
    assert.strictEqual(priceInfo.price_paise, 52900);
    assert.strictEqual(priceInfo.currency, "INR");
    assert.strictEqual(priceInfo.is_free, false);

    // Verify in the store
    const history = await mockDB.getPriceHistory("620");
    assert.strictEqual(history.length, 1, "Exactly one snapshot should exist");
  });

  // ── Test 2: Re-analysis does NOT create duplicate snapshot ──
  it("analysing the same game again does not create a duplicate initial snapshot", async () => {
    const mockFetchPrice = async (appid) => ({
      appid: String(appid),
      price_paise: 52900,
      original_price_paise: 52900,
      discount_percent: 0,
      currency: "INR",
      is_free: false,
    });

    // First analysis
    await freshAnalysisPriceTracking("620", "Portal 2", mockFetchPrice);

    // Second analysis (same game)
    await freshAnalysisPriceTracking("620", "Portal 2", mockFetchPrice);

    const history = await mockDB.getPriceHistory("620");
    assert.strictEqual(history.length, 1, "Must NOT create duplicate snapshot");
  });

  // ── Test 3: Unavailable price → no fake snapshot ──
  it("game with unavailable price information does not get a fake snapshot", async () => {
    const mockFetchPriceNull = async () => null;

    const priceInfo = await freshAnalysisPriceTracking("99999", "Unknown Game", mockFetchPriceNull);

    // Game must still be tracked
    assert.ok(trackedGames.has("99999"), "Game must be in tracked_games");

    // But no snapshot
    assert.strictEqual(priceInfo, null, "Price info must be null");
    const history = await mockDB.getPriceHistory("99999");
    assert.strictEqual(history.length, 0, "No snapshot should exist");
  });

  // ── Test 4: Existing tracked games continue to work ──
  it("existing tracked games with price history are not affected", async () => {
    // Pre-populate an existing tracked game with a snapshot
    await mockDB.addTrackedGame("730", "Counter-Strike 2");
    await mockDB.savePriceSnapshot({
      appid: "730",
      price_paise: 0,
      original_price_paise: 0,
      discount_percent: 0,
      currency: "INR",
      is_free: true,
    });

    let fetchCallCount = 0;
    const mockFetchPrice = async (appid) => {
      fetchCallCount++;
      return {
        appid: String(appid),
        price_paise: 0,
        original_price_paise: 0,
        discount_percent: 0,
        currency: "INR",
        is_free: true,
      };
    };

    // Re-analysis should find existing snapshot and skip fetching
    const priceInfo = await freshAnalysisPriceTracking("730", "Counter-Strike 2", mockFetchPrice);

    assert.ok(priceInfo, "Must return existing price info");
    assert.strictEqual(priceInfo.is_free, true);
    assert.strictEqual(fetchCallCount, 0, "Should NOT call fetchIndianPrice since snapshot already exists");

    const history = await mockDB.getPriceHistory("730");
    assert.strictEqual(history.length, 1, "Should still have exactly one snapshot");
  });

  // ── Test 5: Price history API returns correct records ──
  it("price history returns all snapshots in order", async () => {
    // Simulate two different price snapshots over time
    await mockDB.savePriceSnapshot({
      appid: "1091500",
      price_paise: 299900,
      original_price_paise: 299900,
      discount_percent: 0,
      currency: "INR",
      is_free: false,
    });
    await mockDB.savePriceSnapshot({
      appid: "1091500",
      price_paise: 149900,
      original_price_paise: 299900,
      discount_percent: 50,
      currency: "INR",
      is_free: false,
    });

    const history = await mockDB.getPriceHistory("1091500");
    assert.strictEqual(history.length, 2);
    assert.strictEqual(history[0].price_paise, 299900, "First snapshot should be original price");
    assert.strictEqual(history[1].price_paise, 149900, "Second snapshot should be discounted");
    assert.strictEqual(history[1].discount_percent, 50);
  });

  // ── Test 6: Free game gets proper snapshot ──
  it("free game gets a correct snapshot with is_free=true", async () => {
    const mockFetchPrice = async (appid) => ({
      appid: String(appid),
      price_paise: null,
      original_price_paise: null,
      discount_percent: 0,
      currency: "INR",
      is_free: true,
    });

    const priceInfo = await freshAnalysisPriceTracking("440", "Team Fortress 2", mockFetchPrice);

    assert.ok(priceInfo, "Price info must be returned for free game");
    assert.strictEqual(priceInfo.is_free, true);
    assert.strictEqual(priceInfo.price_paise, null, "Free game should have null price");
    assert.strictEqual(priceInfo.currency, "INR");
  });

  // ── Test 7: Cached path retries missing snapshot ──
  it("cached path retries and saves snapshot for a tracked game that missed its initial snapshot", async () => {
    // Simulate Portal 2's bug state: tracked but no price history
    await mockDB.addTrackedGame("620", "Portal 2");
    // No snapshot saved (simulating the original bug)

    const mockFetchPrice = async (appid) => ({
      appid: String(appid),
      price_paise: 52900,
      original_price_paise: 52900,
      discount_percent: 0,
      currency: "INR",
      is_free: false,
    });

    // This simulates the cached path hitting the retry logic
    const priceInfo = await cachedPathPriceTracking("620", mockFetchPrice);

    assert.ok(priceInfo, "Price info must be returned after retry");
    assert.strictEqual(priceInfo.price_paise, 52900);

    const history = await mockDB.getPriceHistory("620");
    assert.strictEqual(history.length, 1, "Exactly one snapshot after retry");
  });

  // ── Test 8: Cached path does NOT re-fetch if snapshot already exists ──
  it("cached path does not re-fetch price when snapshot already exists", async () => {
    // Pre-populate
    await mockDB.addTrackedGame("620", "Portal 2");
    await mockDB.savePriceSnapshot({
      appid: "620",
      price_paise: 52900,
      original_price_paise: 52900,
      discount_percent: 0,
      currency: "INR",
      is_free: false,
    });

    let fetchCallCount = 0;
    const mockFetchPrice = async () => {
      fetchCallCount++;
      return null;
    };

    const priceInfo = await cachedPathPriceTracking("620", mockFetchPrice);

    assert.ok(priceInfo, "Price info must be returned");
    assert.strictEqual(fetchCallCount, 0, "Should NOT call fetchIndianPrice");
  });

  // ── Test 9: Cached path handles null from fetchIndianPrice gracefully ──
  it("cached path does not save anything when fetchIndianPrice returns null", async () => {
    await mockDB.addTrackedGame("620", "Portal 2");
    // No existing snapshot

    const mockFetchPriceNull = async () => null;

    const priceInfo = await cachedPathPriceTracking("620", mockFetchPriceNull);

    assert.strictEqual(priceInfo, null, "Price info should remain null");
    const history = await mockDB.getPriceHistory("620");
    assert.strictEqual(history.length, 0, "No snapshot should be saved");
  });

  // ── Test 10: Deduplication works with savePriceSnapshot ──
  it("savePriceSnapshot deduplicates identical consecutive snapshots", async () => {
    const snapshot = {
      appid: "620",
      price_paise: 52900,
      original_price_paise: 52900,
      discount_percent: 0,
      currency: "INR",
      is_free: false,
    };

    const result1 = await mockDB.savePriceSnapshot(snapshot);
    const result2 = await mockDB.savePriceSnapshot(snapshot);

    assert.strictEqual(result1.inserted, true, "First should insert");
    assert.strictEqual(result2.inserted, false, "Second should be skipped (duplicate)");

    const history = await mockDB.getPriceHistory("620");
    assert.strictEqual(history.length, 1);
  });
});
