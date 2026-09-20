const axios = require("axios");

const STORE_API = "https://store.steampowered.com/api/appdetails";
const REVIEWS_API = "https://store.steampowered.com/appreviews";
const STORE_SERVICE_API = "https://api.steampowered.com/IStoreService/GetAppList/v1/";

async function fetchGameDetails(appid) {
  const url = `${STORE_API}?appids=${appid}`;
  const { data } = await axios.get(url);

  const entry = data[String(appid)];
  if (!entry || !entry.success) {
    throw new Error(`Steam returned no data for appid ${appid}. Is it a valid game?`);
  }

  const info = entry.data;

  return {
    name: info.name,
    header_image: info.header_image,
    short_description: info.short_description || "",
    type: info.type,
  };
}

async function fetchReviews(appid) {
  const allReviews = [];
  let cursor = "*";
  let totalPositive = 0;
  let totalNegative = 0;
  let totalReviews = 0;

  for (let page = 0; page < 3; page++) {
    const url =
      `${REVIEWS_API}/${appid}?json=1` +
      `&num_per_page=100` +
      `&language=english` +
      `&filter=all` +
      `&cursor=${encodeURIComponent(cursor)}`;

    const { data } = await axios.get(url);

    if (!data || data.success !== 1) {
      if (page === 0) {
        throw new Error(`Failed to fetch reviews for appid ${appid}`);
      }
      break;
    }

    if (page === 0 && data.query_summary) {
      totalPositive = data.query_summary.total_positive || 0;
      totalNegative = data.query_summary.total_negative || 0;
      totalReviews = data.query_summary.total_reviews || 0;
    }

    const pageReviews = data.reviews || [];
    if (pageReviews.length === 0) break;

    allReviews.push(...pageReviews);

    cursor = data.cursor;
    if (!cursor) break;
  }

  return {
    reviews: allReviews,
    total_positive: totalPositive,
    total_negative: totalNegative,
    total_reviews: totalReviews,
  };
}

/**
 * Fetch current Indian price (INR) via Steam appdetails API
 * Never throws — returns null on failure
 */
async function fetchIndianPrice(appid) {
  try {
    const url = `${STORE_API}?appids=${appid}&cc=IN&filters=basic,price_overview`;
    const { data } = await axios.get(url, { timeout: 10000 });

    const entry = data[String(appid)];
    if (!entry || !entry.success || !entry.data) {
      return null;
    }

    const info = entry.data;

    if (info.is_free) {
      return {
        appid: String(appid),
        price_paise: null,
        original_price_paise: null,
        discount_percent: 0,
        currency: "INR",
        is_free: true,
      };
    }

    if (info.price_overview) {
      const po = info.price_overview;
      if (po.currency !== "INR") {
        console.warn(
          `[SteamService] Warning: Expected currency INR for appid ${appid}, got ${po.currency}`
        );
      }
      return {
        appid: String(appid),
        price_paise: po.final,
        original_price_paise: po.initial,
        discount_percent: po.discount_percent || 0,
        currency: po.currency || "INR",
        is_free: false,
      };
    }

    return null;
  } catch (err) {
    console.warn(
      `[SteamService] Failed to fetch Indian price for appid ${appid}:`,
      err.message
    );
    return null;
  }
}

/**
 * Query Steam catalogue for changed apps since a timestamp (if_modified_since)
 * Paginates through GetAppList and returns a Map of appid -> { last_modified, price_change_number }
 * Never throws — returns empty Map on failure
 */
async function fetchCatalogueChanges(sinceUnixSeconds, steamApiKey) {
  const deltaMap = new Map();

  if (!steamApiKey) {
    console.warn("[SteamService] fetchCatalogueChanges skipped: STEAM_API_KEY is not configured.");
    return deltaMap;
  }

  try {
    let haveMoreResults = true;
    let lastAppid = null;
    let pageCount = 0;
    const maxPages = 20; // safety ceiling

    while (haveMoreResults && pageCount < maxPages) {
      pageCount++;
      let url = `${STORE_SERVICE_API}?key=${steamApiKey}&if_modified_since=${sinceUnixSeconds}&include_games=true&include_dlc=false&include_software=false&include_videos=false&include_hardware=false&max_results=50000`;
      if (lastAppid) {
        url += `&last_appid=${lastAppid}`;
      }

      const { data } = await axios.get(url, { timeout: 15000 });

      if (!data || !data.response || !Array.isArray(data.response.apps)) {
        break;
      }

      for (const app of data.response.apps) {
        deltaMap.set(String(app.appid), {
          last_modified: app.last_modified,
          price_change_number: app.price_change_number,
        });
      }

      haveMoreResults = Boolean(data.response.have_more_results);
      lastAppid = data.response.last_appid;

      if (!haveMoreResults || !lastAppid) {
        break;
      }
    }

    return deltaMap;
  } catch (err) {
    console.error(
      "[SteamService] Failed to fetch catalogue changes from Steam:",
      err.message
    );
    return deltaMap;
  }
}

module.exports = {
  fetchGameDetails,
  fetchReviews,
  fetchIndianPrice,
  fetchCatalogueChanges,
};

