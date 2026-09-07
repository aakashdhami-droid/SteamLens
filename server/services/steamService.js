const axios = require("axios");

const STORE_API = "https://store.steampowered.com/api/appdetails";
const REVIEWS_API = "https://store.steampowered.com/appreviews";

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

module.exports = { fetchGameDetails, fetchReviews };

