const { fetchCatalogueChanges, fetchIndianPrice } = require("./steamService");
const {
  getActiveTrackedGames,
  updateTrackedGameAfterCheck,
  savePriceSnapshot,
  isPostgresConnected,
} = require("../db/database");

let collectorIntervalId = null;
let startupTimeoutId = null;
let isCollecting = false;

// Unix timestamp (in seconds) of the last catalogue check.
// Defaults to 24 hours ago on startup so the first check catches recent changes.
let lastCatalogueCheckTime = Math.floor(Date.now() / 1000) - 24 * 3600;
let lastRunTimestamp = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute one cycle of catalogue change detection & price history verification
 */
async function collectPriceChanges() {
  if (isCollecting) {
    console.log("⏳ [PriceCollector] Collection already in progress, skipping duplicate run.");
    return {
      success: false,
      message: "Collection already in progress",
    };
  }

  const apiKey = process.env.STEAM_API_KEY;
  if (!apiKey) {
    const msg = "STEAM_API_KEY is not configured. Catalogue price collector skipped.";
    console.warn(`⚠️  [PriceCollector] ${msg}`);
    return {
      success: false,
      message: msg,
    };
  }

  if (!isPostgresConnected()) {
    const msg = "PostgreSQL is not connected. Catalogue price collector skipped.";
    console.warn(`⚠️  [PriceCollector] ${msg}`);
    return {
      success: false,
      message: msg,
    };
  }

  isCollecting = true;
  const cycleStartTime = Math.floor(Date.now() / 1000);
  console.log(
    `🔄 [PriceCollector] Checking Steam catalogue changes since ${new Date(
      lastCatalogueCheckTime * 1000
    ).toISOString()}...`
  );

  try {
    const [catalogueMap, trackedGames] = await Promise.all([
      fetchCatalogueChanges(lastCatalogueCheckTime, apiKey),
      getActiveTrackedGames(),
    ]);

    console.log(
      `📊 [PriceCollector] Catalogue returned ${catalogueMap.size} modified apps. Currently tracking ${trackedGames.length} games.`
    );

    if (trackedGames.length === 0) {
      lastCatalogueCheckTime = cycleStartTime;
      lastRunTimestamp = new Date().toISOString();
      return {
        success: true,
        message: "No active tracked games",
        trackedCount: 0,
        catalogueModifiedCount: catalogueMap.size,
        priceCheckedCount: 0,
        snapshotsSavedCount: 0,
      };
    }

    // Determine which tracked games have changed in the catalogue or lack a price_change_number
    const gamesToCheck = [];

    for (const game of trackedGames) {
      const appidStr = String(game.appid);
      const catalogueEntry = catalogueMap.get(appidStr);

      if (catalogueEntry) {
        // Catalogue has modified record for this app
        const storedPCN = game.price_change_number ? String(game.price_change_number) : null;
        const newPCN = String(catalogueEntry.price_change_number);

        if (!storedPCN || storedPCN !== newPCN) {
          gamesToCheck.push({
            game,
            newPCN: catalogueEntry.price_change_number,
            reason: storedPCN ? `PCN changed (${storedPCN} -> ${newPCN})` : "Initial PCN sync",
          });
        }
      } else if (game.price_change_number == null) {
        // App never had its catalogue PCN synced
        gamesToCheck.push({
          game,
          newPCN: null,
          reason: "Uninitialized price_change_number",
        });
      }
    }

    console.log(
      `🎯 [PriceCollector] Identified ${gamesToCheck.length} tracked game(s) needing Indian price check.`
    );

    let priceCheckedCount = 0;
    let snapshotsSavedCount = 0;

    for (const item of gamesToCheck) {
      const { game, newPCN, reason } = item;
      console.log(
        `🔍 [PriceCollector] Checking appid ${game.appid} (${game.game_name}) — Reason: ${reason}`
      );

      // 1-second delay between Steam Store calls to respect rate limits
      if (priceCheckedCount > 0) {
        await sleep(1000);
      }

      const priceData = await fetchIndianPrice(game.appid);
      priceCheckedCount++;

      if (priceData) {
        const { inserted } = await savePriceSnapshot(priceData);
        if (inserted) {
          snapshotsSavedCount++;
          console.log(
            `💾 [PriceCollector] Recorded new price snapshot for ${game.game_name} (${game.appid}): ${
              priceData.is_free ? "Free" : `₹${priceData.price_paise / 100}`
            }`
          );
        } else {
          console.log(
            `ℹ️  [PriceCollector] Price unchanged for ${game.game_name} (${game.appid}), skipped duplicate snapshot.`
          );
        }
      }

      // Update tracked_games last_checked_at and price_change_number
      await updateTrackedGameAfterCheck(game.appid, newPCN);
    }

    lastCatalogueCheckTime = cycleStartTime;
    lastRunTimestamp = new Date().toISOString();

    const summary = {
      success: true,
      message: `Completed catalogue check. Evaluated ${trackedGames.length} tracked games, checked ${priceCheckedCount} prices, recorded ${snapshotsSavedCount} new price snapshots.`,
      trackedCount: trackedGames.length,
      catalogueModifiedCount: catalogueMap.size,
      priceCheckedCount,
      snapshotsSavedCount,
      lastCatalogueCheckTime,
      lastRunTimestamp,
    };

    console.log(`✅ [PriceCollector] ${summary.message}`);
    return summary;
  } catch (err) {
    console.error("❌ [PriceCollector] Error during collection cycle:", err.message);
    return {
      success: false,
      error: err.message,
    };
  } finally {
    isCollecting = false;
  }
}

/**
 * Start periodic price collection
 */
function startPriceCollector() {
  const intervalHours = parseFloat(process.env.PRICE_CHECK_INTERVAL_HOURS) || 24;
  const intervalMs = intervalHours * 3600 * 1000;

  console.log(
    `⏰ [PriceCollector] Initializing background collector (Interval: ${intervalHours}h)...`
  );

  // Initial run after a 10-second server warmup delay
  startupTimeoutId = setTimeout(async () => {
    try {
      await collectPriceChanges();
    } catch (err) {
      console.error("❌ [PriceCollector] Initial warmup check error:", err.message);
    }
  }, 10000);

  collectorIntervalId = setInterval(async () => {
    try {
      await collectPriceChanges();
    } catch (err) {
      console.error("❌ [PriceCollector] Interval cycle error:", err.message);
    }
  }, intervalMs);
}

/**
 * Stop background price collection timer
 */
function stopPriceCollector() {
  if (startupTimeoutId) {
    clearTimeout(startupTimeoutId);
    startupTimeoutId = null;
  }
  if (collectorIntervalId) {
    clearInterval(collectorIntervalId);
    collectorIntervalId = null;
  }
  console.log("🛑 [PriceCollector] Background collector stopped.");
}

/**
 * Trigger an immediate single run (for manual testing/dev endpoints)
 */
async function runCollectorOnce() {
  return await collectPriceChanges();
}

/**
 * Get current status of the collector
 */
function getCollectorStatus() {
  const intervalHours = parseFloat(process.env.PRICE_CHECK_INTERVAL_HOURS) || 24;
  return {
    running: Boolean(collectorIntervalId || startupTimeoutId),
    isCollecting,
    intervalHours,
    lastCatalogueCheckTime: lastCatalogueCheckTime
      ? new Date(lastCatalogueCheckTime * 1000).toISOString()
      : null,
    lastRunTimestamp,
    steamApiKeyConfigured: Boolean(process.env.STEAM_API_KEY),
    postgresConnected: isPostgresConnected(),
  };
}

module.exports = {
  startPriceCollector,
  stopPriceCollector,
  runCollectorOnce,
  getCollectorStatus,
};
