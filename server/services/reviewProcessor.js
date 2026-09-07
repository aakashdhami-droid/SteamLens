function filterSpam(reviews) {
  return reviews.filter((review) => {
    const text = (review.review || "").trim();

    if (text.length < 50) return false;

    const emojiPattern =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{200D}\u{20E3}]/gu;
    const emojiMatches = text.match(emojiPattern) || [];
    if (emojiMatches.length / text.length > 0.7) return false;

    const charCounts = {};
    for (const ch of text.toLowerCase()) {
      charCounts[ch] = (charCounts[ch] || 0) + 1;
    }
    const maxCharCount = Math.max(...Object.values(charCounts));
    if (maxCharCount / text.length > 0.5) return false;

    const asciiChars = text.match(/[\x20-\x7E]/g) || [];
    if (asciiChars.length / text.length < 0.6) return false;

    return true;
  });
}

function removeDuplicates(reviews) {
  const unique = [];

  for (const review of reviews) {
    const text = (review.review || "").toLowerCase().trim();
    let isDuplicate = false;

    for (const kept of unique) {
      const keptText = (kept.review || "").toLowerCase().trim();
      const similarity = charOverlapSimilarity(text, keptText);

      if (similarity > 0.8) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(review);
    }
  }

  return unique;
}

function charOverlapSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const freqA = {};
  const freqB = {};
  for (const ch of a) freqA[ch] = (freqA[ch] || 0) + 1;
  for (const ch of b) freqB[ch] = (freqB[ch] || 0) + 1;

  let shared = 0;
  for (const ch in freqA) {
    if (freqB[ch]) {
      shared += Math.min(freqA[ch], freqB[ch]);
    }
  }

  return (2 * shared) / (a.length + b.length);
}

function sampleReviews(reviews) {
  const positive = reviews.filter((r) => r.voted_up === true);
  const negative = reviews.filter((r) => r.voted_up === false);

  const topPositive = [...positive]
    .sort((a, b) => (b.votes_up || 0) - (a.votes_up || 0))
    .slice(0, 10);

  const topNegative = [...negative]
    .sort((a, b) => (b.votes_up || 0) - (a.votes_up || 0))
    .slice(0, 10);

  const mostRecent = [...reviews]
    .sort((a, b) => (b.timestamp_created || 0) - (a.timestamp_created || 0))
    .slice(0, 5);

  const seen = new Set();
  const sampled = [];

  for (const review of [...topPositive, ...topNegative, ...mostRecent]) {
    const id = review.recommendationid;
    if (!seen.has(id)) {
      seen.add(id);
      sampled.push(review);
    }
  }

  return sampled.slice(0, 25);
}

function processReviews(rawReviews) {
  const afterSpamFilter = filterSpam(rawReviews);
  const afterDedup = removeDuplicates(afterSpamFilter);
  const sampled = sampleReviews(afterDedup);

  return {
    sampled,
    stats: {
      raw: rawReviews.length,
      afterSpamFilter: afterSpamFilter.length,
      afterDedup: afterDedup.length,
      sampled: sampled.length,
    },
  };
}

module.exports = { filterSpam, removeDuplicates, sampleReviews, processReviews };

