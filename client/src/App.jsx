import { useState, useEffect, useCallback } from "react";
import SearchBar from "./components/SearchBar";
import GameCard from "./components/GameCard";
import CompatibilityCard from "./components/CompatibilityCard";
import SummaryCard from "./components/SummaryCard";
import ProsCons from "./components/ProsCons";
import PriceHistory from "./components/PriceHistory";
import AuthModal from "./components/AuthModal";
import { useAuth } from "./contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function App() {
  const { user, logout, getAuthHeaders } = useAuth();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Auth Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Personalization States
  const [userVote, setUserVote] = useState(null);
  const [votingLoading, setVotingLoading] = useState(false);
  const [compatibility, setCompatibility] = useState(null);
  const [compatibilityLoading, setCompatibilityLoading] = useState(false);

  const fetchCompatibilityAndVote = useCallback(
    async (appid) => {
      if (!appid) return;
      setCompatibilityLoading(true);

      try {
        const headers = getAuthHeaders();
        const compPromise = fetch(`${API_URL}/api/game/${appid}/compatibility`, {
          headers,
        }).then((res) => (res.ok ? res.json() : null));

        const votePromise = user
          ? fetch(`${API_URL}/api/game/${appid}/vote`, { headers }).then((res) =>
              res.ok ? res.json() : null
            )
          : Promise.resolve(null);

        const [compData, voteData] = await Promise.all([compPromise, votePromise]);

        if (compData) {
          setCompatibility(compData);
        }
        if (voteData) {
          setUserVote(voteData.vote ?? null);
        } else if (!user) {
          setUserVote(null);
        }
      } catch (err) {
        console.warn("[App] Error fetching compatibility/vote:", err.message);
      } finally {
        setCompatibilityLoading(false);
      }
    },
    [user, getAuthHeaders]
  );

  // Re-fetch compatibility & vote when user logs in/out while viewing a game
  useEffect(() => {
    if (result?.appid) {
      fetchCompatibilityAndVote(result.appid);
    }
  }, [user, result?.appid, fetchCompatibilityAndVote]);

  async function handleSearch(appid) {
    setLoading(true);
    setError(null);
    setResult(null);
    setCompatibility(null);
    setUserVote(null);

    try {
      const res = await fetch(`${API_URL}/api/game/${appid}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `Server returned ${res.status}`);
      }

      setResult(data);
      // Fetch personal compatibility & existing vote for the searched game
      fetchCompatibilityAndVote(appid);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVote(vote) {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }

    if (!result?.appid || votingLoading) return;

    // Optimistic UI state
    const previousVote = userVote;
    setUserVote(vote);
    setVotingLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/game/${result.appid}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ vote }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to record vote");
      }

      setUserVote(data.vote);
      // Refresh compatibility after vote update
      fetchCompatibilityAndVote(result.appid);
    } catch (err) {
      console.error("[Vote] Error:", err.message);
      setUserVote(previousVote);
    } finally {
      setVotingLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-steam-dark">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-steam-accent/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-6 sm:py-10">
        {/* ── Top Navigation / Auth Bar ── */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-steam-border/40">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-gray-400 font-medium">SteamLens Intelligence</span>
          </div>

          <div>
            {user ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-steam-card border border-steam-border text-xs">
                  <span className="text-steam-accent">●</span>
                  <span className="text-gray-300 font-medium truncate max-w-[150px] sm:max-w-[200px]">
                    {user.email}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="text-xs text-gray-400 hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-steam-card transition-colors"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-steam-accent to-blue-600 text-white hover:opacity-90 transition-opacity shadow-sm shadow-steam-accent/20"
              >
                <span>Sign In / Register</span>
              </button>
            )}
          </div>
        </div>

        {/* ── Header ── */}
        <header className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-steam-accent to-blue-600 flex items-center justify-center shadow-lg shadow-steam-accent/20">
              <svg
                className="w-5 h-5 text-white"
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
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              <span className="text-white">Steam</span>
              <span className="text-steam-accent">Lens</span>
            </h1>
          </div>
          <p className="text-gray-400 text-sm sm:text-base max-w-md mx-auto">
            AI-powered Steam review analysis & explainable personalization.
          </p>
        </header>

        <SearchBar onSearch={handleSearch} loading={loading} />

        {error && (
          <div className="mt-6 animate-fade-in">
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 text-red-400 text-sm flex items-start gap-3">
              <svg
                className="w-5 h-5 flex-shrink-0 mt-0.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
              <span>{error}</span>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-8 space-y-6 animate-fade-in">
            <div className="bg-steam-card rounded-2xl border border-steam-border overflow-hidden">
              <div className="skeleton h-48 w-full" />
              <div className="p-5 space-y-3">
                <div className="skeleton h-6 w-2/3 rounded" />
                <div className="skeleton h-4 w-1/3 rounded" />
              </div>
            </div>
            <div className="bg-steam-card rounded-2xl border border-steam-border p-5 space-y-3">
              <div className="skeleton h-5 w-1/4 rounded" />
              <div className="skeleton h-20 w-full rounded" />
              <div className="skeleton h-4 w-1/2 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-steam-card rounded-2xl border border-steam-border p-5 space-y-3">
                <div className="skeleton h-5 w-1/3 rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-4 w-4/5 rounded" />
              </div>
              <div className="bg-steam-card rounded-2xl border border-steam-border p-5 space-y-3">
                <div className="skeleton h-5 w-1/3 rounded" />
                <div className="skeleton h-4 w-full rounded" />
                <div className="skeleton h-4 w-5/6 rounded" />
                <div className="skeleton h-4 w-4/5 rounded" />
              </div>
            </div>
          </div>
        )}

        {result && !loading && (
          <div className="mt-8 space-y-6">
            <div className="animate-slide-up" style={{ animationDelay: "0ms" }}>
              <GameCard
                data={result}
                userVote={userVote}
                onVote={handleVote}
                votingLoading={votingLoading}
                onOpenAuth={() => setAuthModalOpen(true)}
              />
            </div>

            <div
              className="animate-slide-up"
              style={{ animationDelay: "100ms", animationFillMode: "both" }}
            >
              <CompatibilityCard
                compatibility={compatibility}
                loading={compatibilityLoading}
                onOpenAuth={() => setAuthModalOpen(true)}
              />
            </div>

            <div
              className="animate-slide-up"
              style={{ animationDelay: "200ms", animationFillMode: "both" }}
            >
              <PriceHistory appid={result.appid} />
            </div>

            <div
              className="animate-slide-up"
              style={{ animationDelay: "300ms", animationFillMode: "both" }}
            >
              <SummaryCard data={result} />
            </div>

            <div
              className="animate-slide-up"
              style={{ animationDelay: "400ms", animationFillMode: "both" }}
            >
              <ProsCons pros={result.pros} cons={result.cons} />
            </div>
          </div>
        )}

        {/* ── Auth Modal ── */}
        {authModalOpen && (
          <AuthModal onClose={() => setAuthModalOpen(false)} />
        )}

        <footer className="mt-16 text-center text-gray-600 text-xs">
          <p>
            Powered by{" "}
            <span className="text-gray-500">Groq Llama 3</span> &middot; Data
            from{" "}
            <a
              href="https://store.steampowered.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-steam-accent transition-colors"
            >
              Steam
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}


