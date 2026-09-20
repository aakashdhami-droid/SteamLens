const express = require("express");
const router = express.Router();

const { fetchGameDetails, fetchReviews, fetchIndianPrice } = require("../services/steamService");
const { processReviews } = require("../services/reviewProcessor");
const { summarizeReviews } = require("../services/groqService");
const {
  getCached,
  saveSummary,
  getAllCached,
  deleteCached,
  addTrackedGame,
  savePriceSnapshot,
  getLatestPrice,
} = require("../db/database");
const { runCollectorOnce, getCollectorStatus } = require("../services/priceCollector");

router.get("/game/:appid", async (req, res, next) => {
  try {
    const { appid } = req.params;

    if (!/^\d+$/.test(appid)) {
      return res.status(400).json({ error: "App ID must be a number" });
    }

    const cached = await getCached(appid);
    if (cached) {
      let price_info = null;
      try {
        price_info = await getLatestPrice(appid);
      } catch (err) {
        console.warn(`[GameRoute] Failed to get price for cached appid ${appid}:`, err.message);
      }

      return res.json({
        cached: true,
        appid: cached.appid,
        game_name: cached.game_name,
        header_image:
          cached.header_image ||
          `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${cached.appid}/header.jpg`,
        summary: cached.summary,
        pros: cached.pros,
        cons: cached.cons,
        sentiment: cached.sentiment,
        confidence: cached.confidence,
        total_reviews_fetched: cached.total_reviews_fetched,
        reviews_sent_to_ai: cached.reviews_sent_to_ai,
        price_info,
      });
    }

    const [gameDetails, reviewData] = await Promise.all([
      fetchGameDetails(appid),
      fetchReviews(appid),
    ]);

    if (!reviewData.reviews || reviewData.reviews.length === 0) {
      return res.status(404).json({
        error: "No reviews found for this game. It may be too new or unreleased.",
      });
    }

    const { sampled, stats } = processReviews(reviewData.reviews);

    if (sampled.length === 0) {
      return res.status(422).json({
        error: "All reviews were filtered as spam or duplicates. Not enough quality reviews to analyze.",
      });
    }

    const aiResult = await summarizeReviews(sampled, gameDetails.name);

    await saveSummary({
      appid,
      game_name: gameDetails.name,
      summary: aiResult.summary,
      pros: aiResult.pros,
      cons: aiResult.cons,
      sentiment: aiResult.sentiment,
      confidence: aiResult.confidence,
      total_reviews_fetched: stats.raw,
      reviews_sent_to_ai: stats.sampled,
    });

    // ── Price Tracking Integration ──
    let price_info = null;
    try {
      const { isNew } = await addTrackedGame(appid, gameDetails.name);
      if (isNew) {
        const initialPrice = await fetchIndianPrice(appid);
        if (initialPrice) {
          await savePriceSnapshot(initialPrice);
        }
      }
      price_info = await getLatestPrice(appid);
    } catch (err) {
      console.warn(`[GameRoute] Price tracking error for appid ${appid}:`, err.message);
    }

    return res.json({
      cached: false,
      appid,
      game_name: gameDetails.name,
      header_image: gameDetails.header_image,
      summary: aiResult.summary,
      pros: aiResult.pros,
      cons: aiResult.cons,
      sentiment: aiResult.sentiment,
      confidence: aiResult.confidence,
      total_positive: reviewData.total_positive,
      total_negative: reviewData.total_negative,
      total_reviews: reviewData.total_reviews,
      reviews_fetched: stats.raw,
      reviews_sent_to_ai: stats.sampled,
      processing_stats: stats,
      price_info,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/cached", async (req, res, next) => {
  try {
    const all = await getAllCached();
    res.json(all);
  } catch (error) {
    next(error);
  }
});

router.delete("/cache/:appid", async (req, res, next) => {
  try {
    const { appid } = req.params;
    if (!/^\d+$/.test(appid)) {
      return res.status(400).json({ error: "App ID must be a number" });
    }
    await deleteCached(appid);
    res.json({ success: true, message: `Cache cleared for appid ${appid}` });
  } catch (error) {
    next(error);
  }
});

// ── Background Collector Development / Monitoring Routes ──

router.get("/collector/run", async (req, res, next) => {
  try {
    const result = await runCollectorOnce();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/collector/status", (req, res) => {
  res.json(getCollectorStatus());
});

module.exports = router;


