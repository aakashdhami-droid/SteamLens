/**
 * SteamLens deduplication exploration.
 *
 * Standalone Node 18+ script (built-in fetch only). It fetches recent English
 * reviews for the given App IDs and runs them through the project's real
 * filterSpam() and removeDuplicates() implementations.
 *
 * Usage:
 *   node scripts/benchmark/dedup-explore.js 381210 553850 440 4000 730 570
 */

const path = require("path");

const {
  filterSpam,
  removeDuplicates,
} = require(path.join(__dirname, "../../server/services/reviewProcessor.js"));

const REVIEWS_PER_GAME = 300;
const THRESHOLDS = [0.5, 0.6, 0.7, 0.8];
const EXAMPLE_COUNT = 5;
const TRUNCATE_LENGTH = 150;
const APPREVIEWS_URL = "https://store.steampowered.com/appreviews";
const APPDETAILS_URL = "https://store.steampowered.com/api/appdetails";
const OFFICIAL_REVIEWS_URL =
  "https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/";

let reviewSource = "store";
let sourceNoticePrinted = false;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SteamLens-dedup-exploration/1.0",
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    throw new Error(`Steam rate limit (HTTP 429) while fetching ${url}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}: ${body.slice(0, 200)}`);
  }

  return res.json();
}

async function fetchStoreReviewPage(appid, cursor) {
  const params = new URLSearchParams({
    json: "1",
    filter: "recent",
    language: "english",
    purchase_type: "all",
    num_per_page: "100",
    cursor,
  });

  const url = `${APPREVIEWS_URL}/${appid}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SteamLens-dedup-exploration/1.0",
      Accept: "application/json",
    },
    redirect: "manual",
  });

  if (res.status === 429) {
    throw new Error(`Steam rate limit (HTTP 429) while fetching ${url}`);
  }
  if (res.status >= 300 && res.status < 400) {
    const error = new Error(
      `store reviews endpoint redirected to ${res.headers.get("location")}`
    );
    error.code = "STORE_REDIRECT";
    throw error;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}: ${body.slice(0, 200)}`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const error = new Error("store reviews endpoint returned non-JSON content");
    error.code = "STORE_REDIRECT";
    throw error;
  }

  if (!data || (data.success !== 1 && data.success !== true)) {
    throw new Error(
      `Steam reviews API returned success=${data && data.success} for appid ${appid}`
    );
  }

  return {
    reviews: Array.isArray(data.reviews) ? data.reviews : [],
    cursor: data.cursor,
  };
}

async function fetchOfficialReviewPage(appid, cursor) {
  const inputJson = JSON.stringify({
    appid: Number(appid),
    filter: "recent",
    languages: ["english"],
    review_type: 0,
    purchase_type: 1,
    num_per_page: 100,
    cursor,
  });

  const url = `${OFFICIAL_REVIEWS_URL}?input_json=${encodeURIComponent(inputJson)}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "SteamLens-dedup-exploration/1.0",
      Accept: "application/json",
    },
  });

  if (res.status === 429) {
    throw new Error(`Steam rate limit (HTTP 429) while fetching ${url}`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText} from ${url}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const response = data && data.response;
  if (!response || !Array.isArray(response.reviews)) {
    throw new Error(
      `Steam official reviews API returned an unexpected payload for appid ${appid}`
    );
  }

  return {
    reviews: response.reviews,
    cursor: response.cursor,
  };
}

async function fetchReviewPage(appid, cursor) {
  if (reviewSource === "official") {
    return fetchOfficialReviewPage(appid, cursor);
  }

  try {
    return await fetchStoreReviewPage(appid, cursor);
  } catch (err) {
    if (err.code !== "STORE_REDIRECT") throw err;

    reviewSource = "official";
    if (!sourceNoticePrinted) {
      sourceNoticePrinted = true;
      console.log(
        "Note: store.steampowered.com/appreviews redirected to HTML; falling back to " +
          "Steam's official IUserReviewsService/GetAppReviews/v1 endpoint " +
          "(the same service the project's steamService uses)."
      );
    }
    return fetchOfficialReviewPage(appid, cursor);
  }
}

async function getGameName(appid) {
  const url = `${APPDETAILS_URL}?appids=${encodeURIComponent(appid)}&filters=basic&l=english`;
  const data = await fetchJson(url);
  const entry = data[String(appid)];
  if (!entry || entry.success !== true || !entry.data || !entry.data.name) {
    return null;
  }
  return entry.data.name;
}

async function fetchRecentReviews(appid, limit = REVIEWS_PER_GAME) {
  const collected = [];
  const seenIds = new Set();
  const seenCursors = new Set();
  let cursor = "*";
  let pageCount = 0;

  while (collected.length < limit) {
    const data = await fetchReviewPage(appid, cursor);
    pageCount++;

    const page = data.reviews;
    for (const review of page) {
      const id = review.recommendationid;
      if (id === undefined || id === null || !seenIds.has(String(id))) {
        if (id !== undefined && id !== null) seenIds.add(String(id));
        collected.push(review);
      }
    }

    const nextCursor = data.cursor;
    if (
      !nextCursor ||
      nextCursor === cursor ||
      seenCursors.has(nextCursor) ||
      page.length === 0 ||
      collected.length >= limit
    ) {
      break;
    }

    seenCursors.add(cursor);
    cursor = nextCursor;
    await sleep(300);
  }

  return {
    reviews: collected.slice(0, limit),
    pageCount,
  };
}

function truncate(text, maxLength = TRUNCATE_LENGTH) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function computeThresholdStats(filteredReviews) {
  return THRESHOLDS.map((threshold) => {
    const kept = removeDuplicates(filteredReviews, threshold);
    const removed = filteredReviews.length - kept.length;
    const removalPct =
      filteredReviews.length > 0 ? (removed / filteredReviews.length) * 100 : 0;
    return {
      threshold,
      kept,
      removed,
      removalPct,
    };
  });
}

function findExamplePairs(filteredReviews, keptAt07) {
  const keptSet = new Set(keptAt07);
  const removedReviews = filteredReviews.filter((review) => !keptSet.has(review));
  const pairs = [];

  for (const removed of removedReviews) {
    if (pairs.length >= EXAMPLE_COUNT) break;

    // Use the real removeDuplicates() for the pairwise match so this script
    // never re-implements the similarity logic.
    const matched = keptAt07.find(
      (kept) => removeDuplicates([kept, removed], 0.7).length === 1
    );

    if (matched) {
      pairs.push({ removed, matched });
    }
  }

  return { removedReviews, pairs };
}

function formatPct(value) {
  return `${value.toFixed(2)}%`;
}

async function exploreApp(appid) {
  const name = await getGameName(appid);
  if (!name) {
    throw new Error(`Could not resolve a store name for App ID ${appid}`);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`Game: ${name} (App ID ${appid})`);
  console.log(`${"=".repeat(72)}`);

  const { reviews, pageCount } = await fetchRecentReviews(appid, REVIEWS_PER_GAME);
  const filtered = filterSpam(reviews);

  console.log(
    `Fetched ${reviews.length} recent English reviews across ${pageCount} page(s).`
  );
  console.log(`Raw: ${reviews.length} | After spam filter: ${filtered.length}`);
  console.log("");
  console.log("Threshold | Kept | Removed | Removal % (of after-spam)");
  console.log("----------+------+---------+---------------------------");

  const thresholdStats = computeThresholdStats(filtered);
  for (const stat of thresholdStats) {
    console.log(
      `   ${stat.threshold.toFixed(1)}    | ${String(stat.kept.length).padStart(4)} | ${String(
        stat.removed
      ).padStart(7)} | ${formatPct(stat.removalPct)}`
    );
  }

  const stat07 = thresholdStats.find((stat) => stat.threshold === 0.7);
  const { removedReviews, pairs } = findExamplePairs(filtered, stat07.kept);

  console.log("\nExamples at threshold 0.7:");
  if (removedReviews.length === 0) {
    console.log("  (no reviews removed at 0.7)");
  } else if (pairs.length === 0) {
    console.log(
      `  ${removedReviews.length} review(s) removed, but no pair could be matched for display.`
    );
  } else {
    pairs.forEach((pair, index) => {
      console.log(`  ${index + 1}. REMOVED #${pair.removed.recommendationid}: "${truncate(pair.removed.review)}"`);
      console.log(`     KEPT    #${pair.matched.recommendationid}: "${truncate(pair.matched.review)}"`);
    });
  }

  return {
    appid: String(appid),
    name,
    raw: reviews.length,
    afterSpam: filtered.length,
    thresholdStats,
  };
}

async function main() {
  const appids = process.argv.slice(2).filter((arg) => /^\d+$/.test(arg));
  if (appids.length === 0) {
    console.error("Usage: node scripts/benchmark/dedup-explore.js <appid> [appid ...]");
    process.exit(1);
  }

  const results = [];
  for (const appid of appids) {
    try {
      results.push(await exploreApp(appid));
    } catch (err) {
      console.error(`\nERROR for App ID ${appid}: ${err.message}`);
      if (err.message.includes("rate limit")) {
        console.error("Stopping because Steam is rate limiting requests.");
        process.exit(1);
      }
    }
    await sleep(500);
  }

  if (results.length === 0) {
    console.error("\nNo games were processed successfully.");
    process.exit(1);
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log("Summary");
  console.log(`${"=".repeat(72)}`);
  console.log(
    "| Game | App ID | Raw | After spam | Removed @0.5 | Removed @0.6 | Removed @0.7 | Removed @0.8 |"
  );
  console.log("| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const result of results) {
    const byThreshold = Object.fromEntries(
      result.thresholdStats.map((stat) => [stat.threshold, stat.removed])
    );
    console.log(
      `| ${result.name} | ${result.appid} | ${result.raw} | ${result.afterSpam} | ${byThreshold[0.5]} | ${byThreshold[0.6]} | ${byThreshold[0.7]} | ${byThreshold[0.8]} |`
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
