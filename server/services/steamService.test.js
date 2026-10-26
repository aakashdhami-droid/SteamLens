/**
 * Unit tests for steamService.fetchReviews after migration to
 * IUserReviewsService/GetAppReviews/v1.
 *
 * Run with: node --test services/steamService.test.js
 */

const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

// ---------------------------------------------------------------------------
// Helpers – we mock `axios.get` at the module level so the service under test
// picks up our fake without needing any DI plumbing.
// ---------------------------------------------------------------------------

const axios = require("axios");

/** Stores the mock implementation to swap between tests. */
let axiosGetMock;

/**
 * Build a realistic single-page review response that matches the new
 * IUserReviewsService schema (nested under `response`, no `success` field).
 */
function buildReviewResponse({
  reviews = [],
  cursor = null,
  querySummary = null,
} = {}) {
  const body = { reviews, cursor };
  if (querySummary) body.query_summary = querySummary;
  return { response: body };
}

/** A minimal review object with the fields reviewProcessor.js expects. */
function fakeReview(id, { votedUp = true, votesUp = 10, text = "A solid game with great mechanics." } = {}) {
  return {
    recommendationid: String(id),
    author: {
      steamid: `7656119800000${id}`,
      games_owned: 42,
      playtime_forever: 600,
      playtime_last_two_weeks: 20,
      playtime_at_review: 500,
      last_played: 1700000000,
    },
    language: "english",
    review: text,
    timestamp_created: 1700000000 + id,
    timestamp_updated: 1700000000 + id,
    voted_up: votedUp,
    votes_up: votesUp,
    votes_funny: 0,
    weighted_vote_score: "0.65",
    comment_count: 0,
    steam_purchase: true,
    received_for_free: false,
    written_during_early_access: false,
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("fetchReviews (IUserReviewsService/GetAppReviews/v1)", () => {
  beforeEach(() => {
    // Replace axios.get with a controllable mock before each test
    axiosGetMock = mock.method(axios, "get");
  });

  afterEach(() => {
    axiosGetMock.mock.restore();
  });

  // ── Lazy-load the service under test AFTER mock is wired ──
  function getService() {
    return require("./steamService");
  }

  // ------------------------------------------------------------------
  // 1. Successful single-page response
  // ------------------------------------------------------------------
  it("returns reviews and query_summary from a single page", async () => {
    const reviews = [fakeReview(1), fakeReview(2, { votedUp: false })];
    const summary = { total_positive: 500, total_negative: 50, total_reviews: 550 };

    axiosGetMock.mock.mockImplementation(async (url) => {
      // Verify the URL uses input_json
      assert.ok(url.includes("input_json="), "URL must use input_json parameter");
      assert.ok(
        url.startsWith("https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/"),
        "URL must point to IUserReviewsService"
      );

      // Decode and verify the input_json payload
      const match = url.match(/input_json=([^&]+)/);
      assert.ok(match, "input_json must be present in URL");
      const payload = JSON.parse(decodeURIComponent(match[1]));
      assert.equal(payload.appid, 730, "appid must be inside input_json");
      assert.equal(payload.filter, 0, "filter must be 0 (Helpful)");
      assert.equal(payload.review_type, 0, "review_type must be 0 (all)");
      assert.equal(payload.purchase_type, 1, "purchase_type must be 1 (all)");
      assert.equal(payload.num_per_page, 100);
      assert.deepEqual(payload.languages, ["english"], "must use languages array");
      assert.equal(payload.language, undefined, "deprecated singular language field must not be present");

      return {
        data: buildReviewResponse({
          reviews,
          cursor: null, // no next page
          querySummary: summary,
        }),
      };
    });

    const result = await getService().fetchReviews(730);

    assert.equal(result.reviews.length, 2);
    assert.equal(result.total_positive, 500);
    assert.equal(result.total_negative, 50);
    assert.equal(result.total_reviews, 550);
    // Verify review fields that reviewProcessor.js depends on
    assert.equal(result.reviews[0].recommendationid, "1");
    assert.equal(result.reviews[0].voted_up, true);
    assert.equal(typeof result.reviews[0].votes_up, "number");
    assert.equal(typeof result.reviews[0].timestamp_created, "number");
    assert.ok(result.reviews[0].review.length > 0);
  });

  // ------------------------------------------------------------------
  // 2. Multi-page pagination (2 pages)
  // ------------------------------------------------------------------
  it("paginates across multiple pages using cursor", async () => {
    let callCount = 0;

    axiosGetMock.mock.mockImplementation(async (url) => {
      callCount++;
      const match = url.match(/input_json=([^&]+)/);
      const payload = JSON.parse(decodeURIComponent(match[1]));

      if (callCount === 1) {
        assert.equal(payload.cursor, "*", "First request must use * cursor");
        return {
          data: buildReviewResponse({
            reviews: [fakeReview(1), fakeReview(2)],
            cursor: "AoJ4page2cursor==",
            querySummary: { total_positive: 1000, total_negative: 200, total_reviews: 1200 },
          }),
        };
      }

      // Second page
      assert.equal(payload.cursor, "AoJ4page2cursor==", "Second request must use returned cursor");
      return {
        data: buildReviewResponse({
          reviews: [fakeReview(3)],
          cursor: null, // no more pages
        }),
      };
    });

    const result = await getService().fetchReviews(440);

    assert.equal(result.reviews.length, 3, "Should aggregate reviews from both pages");
    assert.equal(callCount, 2, "Should make exactly 2 API calls");
    assert.equal(result.total_positive, 1000, "Summary comes from first page");
  });

  // ------------------------------------------------------------------
  // 3. Empty review list on first page
  // ------------------------------------------------------------------
  it("returns empty results when first page has no reviews", async () => {
    axiosGetMock.mock.mockImplementation(async () => ({
      data: buildReviewResponse({
        reviews: [],
        cursor: null,
        querySummary: { total_positive: 0, total_negative: 0, total_reviews: 0 },
      }),
    }));

    const result = await getService().fetchReviews(99999);

    assert.equal(result.reviews.length, 0);
    assert.equal(result.total_reviews, 0);
  });

  // ------------------------------------------------------------------
  // 4. Response without success field (new endpoint behavior)
  // ------------------------------------------------------------------
  it("accepts response that has reviews array but no success field", async () => {
    axiosGetMock.mock.mockImplementation(async () => ({
      data: {
        response: {
          reviews: [fakeReview(10)],
          query_summary: { total_positive: 5, total_negative: 1, total_reviews: 6 },
          cursor: null,
          // Note: no `success` field at all
        },
      },
    }));

    const result = await getService().fetchReviews(570);

    assert.equal(result.reviews.length, 1);
    assert.equal(result.total_positive, 5);
  });

  // ------------------------------------------------------------------
  // 5. Malformed response (no reviews array, no success field)
  // ------------------------------------------------------------------
  it("throws on malformed response on first page", async () => {
    axiosGetMock.mock.mockImplementation(async () => ({
      data: { something: "unexpected" },
    }));

    await assert.rejects(
      () => getService().fetchReviews(12345),
      (err) => {
        assert.ok(err.message.includes("12345"), "Error must include appid");
        return true;
      }
    );
  });

  // ------------------------------------------------------------------
  // 6. null/undefined response data
  // ------------------------------------------------------------------
  it("throws when response data is null", async () => {
    axiosGetMock.mock.mockImplementation(async () => ({
      data: null,
    }));

    await assert.rejects(
      () => getService().fetchReviews(67890),
      (err) => {
        assert.ok(err.message.includes("67890"));
        return true;
      }
    );
  });

  // ------------------------------------------------------------------
  // 7. HTTP error (e.g. 429 rate limit)
  // ------------------------------------------------------------------
  it("throws on HTTP error on first page and includes appid in message", async () => {
    const httpError = new Error("Request failed with status code 429");
    httpError.response = {
      status: 429,
      data: { error: "Too many requests" },
    };

    axiosGetMock.mock.mockImplementation(async () => {
      throw httpError;
    });

    await assert.rejects(
      () => getService().fetchReviews(1091500),
      (err) => {
        assert.ok(err.message.includes("1091500"));
        return true;
      }
    );
  });

  // ------------------------------------------------------------------
  // 8. HTTP error on second page doesn't throw — returns partial data
  // ------------------------------------------------------------------
  it("returns partial results when HTTP error occurs on page 2", async () => {
    let callCount = 0;

    axiosGetMock.mock.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          data: buildReviewResponse({
            reviews: [fakeReview(1), fakeReview(2)],
            cursor: "nextpage",
            querySummary: { total_positive: 100, total_negative: 10, total_reviews: 110 },
          }),
        };
      }
      // Second call fails
      const httpError = new Error("Internal Server Error");
      httpError.response = { status: 500, data: "server error" };
      throw httpError;
    });

    const result = await getService().fetchReviews(292030);

    assert.equal(result.reviews.length, 2, "Should return page 1 reviews");
    assert.equal(result.total_positive, 100);
  });

  // ------------------------------------------------------------------
  // 9. Malformed response on second page — returns partial data
  // ------------------------------------------------------------------
  it("returns partial results when second page has malformed data", async () => {
    let callCount = 0;

    axiosGetMock.mock.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          data: buildReviewResponse({
            reviews: [fakeReview(1)],
            cursor: "page2cursor",
            querySummary: { total_positive: 50, total_negative: 5, total_reviews: 55 },
          }),
        };
      }
      // Second call returns garbage
      return { data: { broken: true } };
    });

    const result = await getService().fetchReviews(489830);

    assert.equal(result.reviews.length, 1, "Should return only page 1 reviews");
    assert.equal(result.total_positive, 50);
  });

  // ------------------------------------------------------------------
  // 10. Max 3 pages pagination cap
  // ------------------------------------------------------------------
  it("stops after 3 pages even if more data is available", async () => {
    let callCount = 0;

    axiosGetMock.mock.mockImplementation(async () => {
      callCount++;
      return {
        data: buildReviewResponse({
          reviews: [fakeReview(callCount * 100)],
          cursor: `page${callCount + 1}`,
          querySummary: callCount === 1
            ? { total_positive: 999, total_negative: 1, total_reviews: 1000 }
            : undefined,
        }),
      };
    });

    const result = await getService().fetchReviews(620);

    assert.equal(callCount, 3, "Must stop at 3 pages");
    assert.equal(result.reviews.length, 3);
  });
});
