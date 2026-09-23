import { useState, useEffect, useRef } from "react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

const QUICK_PICKS = [
  { name: "Dota 2", appid: "570" },
  { name: "CS2", appid: "730" },
  { name: "Cyberpunk 2077", appid: "1091500" },
  { name: "Witcher 3", appid: "292030" },
  { name: "Elden Ring", appid: "1245620" },
];

export default function SearchBar({ onSearch, loading }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef(null);
  const abortRef = useRef(null);
  const skipSearchRef = useRef(false);

  // ── Debounced search ────────────────────────────────────
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }

    // Skip short / empty queries
    if (query.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    const timer = setTimeout(async () => {
      // Abort any in-flight request
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSearching(true);
      try {
        const res = await fetch(
          `${API_URL}/api/search?query=${encodeURIComponent(query.trim())}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        if (data.results) {
          setSuggestions(data.results);
          setShowDropdown(data.results.length > 0);
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Search failed:", err);
          setSuggestions([]);
        }
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [query]);

  // ── Close dropdown on outside click ─────────────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ── Handle keyboard ────────────────────────────────────
  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }

  // ── Select a game from dropdown ─────────────────────────
  function handleSelect(game) {
    skipSearchRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    setQuery(game.name);
    setSuggestions([]);
    setShowDropdown(false);
    onSearch(String(game.appid));
  }

  // ── Quick picks ─────────────────────────────────────────
  function handleQuickPick(pick) {
    skipSearchRef.current = true;
    if (abortRef.current) abortRef.current.abort();
    setQuery(pick.name);
    setSuggestions([]);
    setShowDropdown(false);
    onSearch(pick.appid);
  }

  return (
    <div
      className="relative z-30 animate-fade-in"
      style={{ animationDelay: "100ms", animationFillMode: "both" }}
      ref={wrapperRef}
    >
      <div className="relative">
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
            {searching ? (
              <svg
                className="animate-spin w-4 h-4 text-steam-accent"
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
            ) : (
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
            )}
          </div>
          <input
            id="game-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search for a game..."
            disabled={loading}
            autoComplete="off"
            className="w-full bg-steam-card border border-steam-border rounded-xl py-3 pl-11 pr-4 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-steam-accent/50 focus:ring-1 focus:ring-steam-accent/20 transition-all disabled:opacity-50"
          />
        </div>

        {/* ── Dropdown ──────────────────────────────────────── */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 w-full mt-1.5 bg-steam-card border border-steam-border rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-fade-in">
            {suggestions.map((game) => (
              <button
                key={game.appid}
                id={`search-result-${game.appid}`}
                onClick={() => handleSelect(game)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-steam-accent/10 transition-colors group"
              >
                {game.image ? (
                  <img
                    src={game.image}
                    alt={game.name}
                    className="w-[58px] h-[22px] rounded object-cover flex-shrink-0 opacity-80 group-hover:opacity-100 transition-opacity"
                  />
                ) : (
                  <div className="w-[58px] h-[22px] rounded bg-steam-border flex-shrink-0" />
                )}
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors truncate">
                  {game.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick Picks ──────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-500 mr-1">Quick picks:</span>
        {QUICK_PICKS.map((game) => (
          <button
            key={game.appid}
            id={`quick-pick-${game.appid}`}
            onClick={() => handleQuickPick(game)}
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
