/**
 * Unit tests for reviewProcessor.removeDuplicates using word-level
 * Jaccard similarity.
 *
 * Run with: node --test services/reviewProcessor.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { removeDuplicates } = require("./reviewProcessor");

function review(id, text, votedUp = true) {
  return {
    recommendationid: String(id),
    review: text,
    voted_up: votedUp,
    votes_up: 0,
    timestamp_created: 1700000000 + Number(id),
  };
}

describe("removeDuplicates (word-level Jaccard similarity)", () => {
  it("deduplicates identical reviews", () => {
    const text =
      "This game has a wonderful story and the combat is very satisfying.";
    const result = removeDuplicates([
      review(1, text),
      review(2, text),
    ]);

    assert.equal(result.length, 1);
    assert.equal(result[0].recommendationid, "1");
  });

  it("keeps a positive and a negative review with different wording", () => {
    const positive = review(
      1,
      "An absolute masterpiece with gorgeous visuals and a breathtaking soundtrack that kept me hooked.",
      true
    );
    const negative = review(
      2,
      "Refunded after two hours because the controls felt clunky and the plot was dull.",
      false
    );

    const result = removeDuplicates([positive, negative]);

    assert.equal(result.length, 2);
    assert.deepEqual(
      result.map((r) => r.recommendationid),
      ["1", "2"]
    );
  });

  it("treats punctuation and case differences as the same word", () => {
    const result = removeDuplicates([
      review(1, "Great!"),
      review(2, "great"),
    ]);

    assert.equal(result.length, 1);
  });
});
