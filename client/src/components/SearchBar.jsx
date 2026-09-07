import { useState } from "react";

const QUICK_PICKS = [
  { name: "Dota 2", appid: "570" },
  { name: "CS2", appid: "730" },
  { name: "Cyberpunk 2077", appid: "1091500" },
  { name: "Witcher 3", appid: "292030" },
  { name: "Elden Ring", appid: "1245620" },
];

export default function SearchBar({ onSearch, loading }) {
  const [appid, setAppid] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const trimmed = appid.trim();
    if (trimmed && /^\d+$/.test(trimmed)) {
      onSearch(trimmed);
    }
  }

  function handleQuickPick(id) {
    setAppid(id);
    onSearch(id);
  }

  return (
    <div className="animate-fade-in" style={{ animationDelay: "100ms", animationFillMode: "both" }}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg
                className="w-4 h-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                />
              </svg>
            </div>
            <input
              id="appid-input"
              type="text"
              value={appid}
              onChange={(e) => setAppid(e.target.value)}
              placeholder="Enter Steam App ID (e.g. 570)"
              disabled={loading}
              className="w-full bg-steam-card border border-steam-border rounded-xl py-3 pl-11 pr-4 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-steam-accent/50 focus:ring-1 focus:ring-steam-accent/20 transition-all disabled:opacity-50"
            />
          </div>
          <button
            id="analyze-btn"
            type="submit"
            disabled={loading || !appid.trim()}
            className="bg-gradient-to-r from-steam-accent to-blue-600 text-white font-semibold px-6 py-3 rounded-xl text-sm hover:from-steam-accent/90 hover:to-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-steam-accent/10 hover:shadow-steam-accent/20 active:scale-95"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg
                  className="animate-spin w-4 h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Analyzing…
              </span>
            ) : (
              "Analyze"
            )}
          </button>
        </div>
      </form>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Quick picks:</span>
        {QUICK_PICKS.map((game) => (
          <button
            key={game.appid}
            id={`quick-pick-${game.appid}`}
            onClick={() => handleQuickPick(game.appid)}
            disabled={loading}
            className="text-xs bg-steam-card border border-steam-border text-gray-400 px-3 py-1.5 rounded-lg hover:border-steam-accent/40 hover:text-steam-accent transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            {game.name}
          </button>
        ))}
      </div>
    </div>
  );
}

