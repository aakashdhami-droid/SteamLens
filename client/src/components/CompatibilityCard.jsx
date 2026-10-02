import { useAuth } from "../contexts/AuthContext";

export default function CompatibilityCard({
  compatibility,
  loading,
  onOpenAuth,
}) {
  const { user } = useAuth();

  function getScoreColor(pct) {
    if (pct >= 70) return "text-steam-positive border-steam-positive/30 bg-steam-positive/10";
    if (pct >= 45) return "text-steam-mixed border-steam-mixed/30 bg-steam-mixed/10";
    return "text-steam-negative border-steam-negative/30 bg-steam-negative/10";
  }

  function getBadgeStyle(label) {
    switch (label) {
      case "strong_match":
        return {
          bg: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
          icon: "✓",
          text: "Strong match",
        };
      case "match":
        return {
          bg: "bg-sky-500/10 border-sky-500/30 text-sky-300",
          icon: "✓",
          text: "Match",
        };
      case "possible_mismatch":
        return {
          bg: "bg-amber-500/10 border-amber-500/30 text-amber-300",
          icon: "⚠",
          text: "Possible mismatch",
        };
      case "mismatch":
        return {
          bg: "bg-rose-500/10 border-rose-500/30 text-rose-300",
          icon: "✗",
          text: "Low match",
        };
      default:
        return {
          bg: "bg-gray-500/10 border-gray-500/30 text-gray-300",
          icon: "•",
          text: "Neutral",
        };
    }
  }

  return (
    <div
      id="compatibility-card"
      className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-steam-accent/10 border border-steam-accent/20 flex items-center justify-center text-steam-accent text-sm font-bold">
            ⚡
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
              Personal Match Score
            </h3>
            <p className="text-xs text-gray-400">
              Personalized compatibility based on your rated games
            </p>
          </div>
        </div>

        {user && compatibility?.hasEnoughData && compatibility?.percentage != null && (
          <div
            className={`px-3.5 py-1.5 rounded-full border text-sm sm:text-base font-bold flex items-center gap-1.5 shadow-sm ${getScoreColor(
              compatibility.percentage
            )}`}
          >
            <span>{compatibility.percentage}%</span>
            <span className="text-xs font-medium opacity-80">Match</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-4 space-y-3">
          <div className="skeleton h-4 w-1/2 rounded" />
          <div className="skeleton h-8 w-full rounded" />
        </div>
      ) : !user ? (
        <div className="rounded-xl bg-steam-dark/60 border border-steam-border/60 p-4 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm text-gray-300 font-medium">
              Log in and rate games to see your personal match.
            </p>
            <p className="text-xs text-gray-500">
              SteamLens learns your preferred genres & tags from your upvotes and downvotes.
            </p>
          </div>
          <button
            onClick={onOpenAuth}
            className="flex-shrink-0 px-4 py-2 bg-steam-accent/15 hover:bg-steam-accent/25 border border-steam-accent/30 text-steam-accent font-medium text-xs rounded-lg transition-colors"
          >
            Sign In / Register
          </button>
        </div>
      ) : !compatibility?.hasEnoughData ? (
        <div className="rounded-xl bg-steam-dark/60 border border-steam-border/60 p-4">
          <div className="flex items-start gap-3">
            <div className="text-amber-400 text-lg flex-shrink-0 mt-0.5">ℹ️</div>
            <div className="space-y-1.5 flex-1">
              <p className="text-sm font-semibold text-gray-200">
                Rate a few games to build your preference profile.
              </p>
              <p className="text-xs text-gray-400">
                You have rated{" "}
                <span className="text-steam-accent font-semibold">
                  {compatibility?.totalVotedGames || 0}
                </span>{" "}
                of{" "}
                <span className="text-gray-300 font-semibold">
                  {compatibility?.minimumRequired || 3}
                </span>{" "}
                games needed to generate accurate compatibility scores.
              </p>
              <div className="w-full bg-steam-card rounded-full h-2 overflow-hidden mt-2">
                <div
                  className="bg-steam-accent h-2 transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.min(
                      100,
                      ((compatibility?.totalVotedGames || 0) /
                        (compatibility?.minimumRequired || 3)) *
                        100
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {compatibility.explanation && compatibility.explanation.length > 0 ? (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2.5">
                Why this matches your preferences:
              </p>
              <div className="flex flex-wrap gap-2">
                {compatibility.explanation.map((item, idx) => {
                  const style = getBadgeStyle(item.label);
                  return (
                    <span
                      key={idx}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${style.bg}`}
                    >
                      <span className="font-bold">{style.icon}</span>
                      <span>
                        <span className="opacity-75">{style.text}:</span>{" "}
                        <strong className="font-semibold">{item.attribute}</strong>
                      </span>
                    </span>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">
              This game aligns moderately with your general taste profile without extreme genre outliers.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
