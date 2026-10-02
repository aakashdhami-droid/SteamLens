import { useState } from "react";
import { useAuth } from "../contexts/AuthContext";

export default function AuthModal({ onClose }) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "register") {
        await register(email, password);
      } else {
        await login(email, password);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-steam-card border border-steam-border rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-3">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-bold text-white">
              {mode === "login" ? "Welcome back" : "Create account"}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 transition-colors p-1"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-400">
            {mode === "login"
              ? "Sign in to track your preferences"
              : "Join SteamLens to get personalized game insights"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6">
          {error && (
            <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label htmlFor="auth-email" className="block text-xs text-gray-400 mb-1.5 font-medium">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full bg-steam-dark border border-steam-border rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-steam-accent/50 focus:ring-1 focus:ring-steam-accent/20 transition-all"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-xs text-gray-400 mb-1.5 font-medium">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="w-full bg-steam-dark border border-steam-border rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-steam-accent/50 focus:ring-1 focus:ring-steam-accent/20 transition-all"
                placeholder={mode === "register" ? "At least 6 characters" : "••••••••"}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full mt-5 bg-gradient-to-r from-steam-accent to-blue-600 text-white font-semibold py-2.5 rounded-lg text-sm hover:opacity-90 transition-opacity disabled:opacity-50 active:scale-[0.98]"
          >
            {submitting
              ? "Please wait..."
              : mode === "login"
              ? "Sign In"
              : "Create Account"}
          </button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
              className="text-xs text-gray-400 hover:text-steam-accent transition-colors"
            >
              {mode === "login"
                ? "Don't have an account? Sign up"
                : "Already have an account? Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
