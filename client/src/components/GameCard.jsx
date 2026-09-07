export default function GameCard({ data }) {
  const {
    game_name,
    header_image,
    total_positive,
    total_negative,
    total_reviews,
    cached,
    reviews_fetched,
    reviews_sent_to_ai,
    total_reviews_fetched,
  } = data;

  const hasReviewCounts =
    total_positive !== undefined && total_negative !== undefined;
  const totalVotes = hasReviewCounts ? total_positive + total_negative : 0;
  const positivePercent =
    totalVotes > 0 ? Math.round((total_positive / totalVotes) * 100) : null;

  function getPercentColor(pct) {
    if (pct >= 70) return "text-steam-positive bg-steam-positive/10 border-steam-positive/20";
    if (pct >= 40) return "text-steam-mixed bg-steam-mixed/10 border-steam-mixed/20";
    return "text-steam-negative bg-steam-negative/10 border-steam-negative/20";
  }

  const fetched = reviews_fetched || total_reviews_fetched || 0;
  const sentToAi = reviews_sent_to_ai || 0;

  return (
    <div
      id="game-card"
      className="bg-steam-card rounded-2xl border border-steam-border overflow-hidden shadow-xl"
    >
      {header_image && (
        <div className="relative">
          <img
            src={header_image}
            alt={game_name}
            className="w-full h-48 sm:h-56 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-steam-card via-transparent to-transparent" />
        </div>
      )}

      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-bold text-white">
              {game_name}
            </h2>
            {total_reviews > 0 && (
              <p className="text-sm text-gray-400">
                {total_reviews.toLocaleString()} total reviews
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {positivePercent !== null && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-3 py-1 rounded-full border ${getPercentColor(
                  positivePercent
                )}`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.75.75 0 01.75-.75A2.25 2.25 0 0116.5 4.5c0 1.152-.26 2.243-.723 3.218-.266.558.107 1.282.725 1.282h3.126c1.026 0 1.945.694 2.054 1.715.045.422.068.85.068 1.285a11.95 11.95 0 01-2.649 7.521c-.388.482-.987.729-1.605.729H13.48c-.483 0-.964-.078-1.423-.23l-3.114-1.04a4.501 4.501 0 00-1.423-.23H5.904M14.25 9h2.25M5.904 18.75c.083.205.173.405.27.602.197.4-.078.898-.523.898h-.908c-.889 0-1.713-.518-1.972-1.368a12 12 0 01-.521-3.507c0-1.553.295-3.036.831-4.398C3.387 10.464 4.167 9.75 5.095 9.75h.054c.447 0 .684.461.524.87a8.5 8.5 0 00-.569 3.005c0 1.834.58 3.534 1.568 4.925.14.197.253.405.331.626z" />
                </svg>
                {positivePercent}% Positive
              </span>
            )}

            <span
              className={`inline-flex items-center text-xs font-medium px-3 py-1 rounded-full border ${
                cached
                  ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                  : "text-steam-accent bg-steam-accent/10 border-steam-accent/20"
              }`}
            >
              {cached ? (
                <>
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                  Cached
                </>
              ) : (
                <>
                  <svg className="w-3 h-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                  Fresh Analysis
                </>
              )}
            </span>
          </div>
        </div>

        {sentToAi > 0 && (
          <p className="mt-3 text-xs text-gray-500">
            <span className="text-gray-400 font-medium">{sentToAi}</span>{" "}
            reviews analyzed
            {fetched > 0 && (
              <>
                {" "}
                from{" "}
                <span className="text-gray-400 font-medium">{fetched}</span>{" "}
                fetched
              </>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

