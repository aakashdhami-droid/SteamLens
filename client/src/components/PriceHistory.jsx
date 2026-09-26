import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

function formatAxisDate(recorded_at, allData) {
  const d = new Date(recorded_at);
  if (isNaN(d.getTime())) return recorded_at;

  const sameDay =
    allData &&
    allData.length > 1 &&
    allData.every(
      (item) =>
        new Date(item.recorded_at).toDateString() ===
        new Date(allData[0].recorded_at).toDateString()
    );

  if (sameDay) {
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  return d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const formattedPrice = data.is_free
      ? "Free"
      : `₹${(data.price_rupees || 0).toLocaleString("en-IN")}`;

    return (
      <div className="bg-steam-card/95 backdrop-blur-md border border-steam-border px-3.5 py-2.5 rounded-xl shadow-2xl text-xs space-y-1">
        <p className="text-gray-400 font-medium">{data.fullDate}</p>
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-sm">{formattedPrice}</span>
          {data.discount_percent > 0 && (
            <span className="bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded text-[10px] font-bold">
              -{data.discount_percent}%
            </span>
          )}
        </div>
      </div>
    );
  }
  return null;
}

export default function PriceHistory({ appid }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!appid) return;

    let isMounted = true;
    const controller = new AbortController();

    async function fetchPriceHistory() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/api/game/${appid}/price-history`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Failed to load price history (${res.status})`);
        }

        const data = await res.json();
        if (isMounted) {
          setHistory(Array.isArray(data.history) ? data.history : []);
        }
      } catch (err) {
        if (err.name !== "AbortError" && isMounted) {
          console.warn("[PriceHistory] Error fetching history:", err.message);
          setError("Unable to load price history.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchPriceHistory();

    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [appid]);

  // Loading state
  if (loading) {
    return (
      <div
        id="price-history-card"
        className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="skeleton h-4 w-36 rounded" />
          <div className="skeleton h-4 w-24 rounded-full" />
        </div>
        <div className="skeleton h-44 w-full rounded-xl" />
      </div>
    );
  }

  // Non-blocking error state
  if (error) {
    return (
      <div
        id="price-history-card"
        className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl"
      >
        <div className="flex items-center gap-2 text-gray-400 text-sm font-semibold uppercase tracking-wider mb-2">
          <svg
            className="w-4 h-4 text-steam-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          Price History (₹)
        </div>
        <p className="text-sm text-gray-400">{error}</p>
      </div>
    );
  }

  // Empty state
  if (!history || history.length === 0) {
    return (
      <div
        id="price-history-card"
        className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <svg
              className="w-4 h-4 text-steam-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            Price History (₹)
          </h3>
        </div>
        <div className="py-6 text-center text-gray-400 text-sm">
          <p className="font-medium text-gray-300">No price history available yet.</p>
          <p className="text-xs text-gray-500 mt-1">
            Price tracking is active and new price changes will be recorded over time.
          </p>
        </div>
      </div>
    );
  }

  // Process data chronologically
  const chronological = [...history].sort(
    (a, b) => new Date(a.recorded_at) - new Date(b.recorded_at)
  );

  const chartData = chronological.map((item) => {
    const price_rupees = item.is_free
      ? 0
      : item.price_paise != null
      ? item.price_paise / 100
      : 0;

    const dateObj = new Date(item.recorded_at);
    const fullDate = !isNaN(dateObj.getTime())
      ? dateObj.toLocaleString("en-IN", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : item.recorded_at;

    return {
      ...item,
      price_rupees,
      fullDate,
    };
  });

  // Single snapshot case
  if (chartData.length === 1) {
    const single = chartData[0];
    const displayPrice = single.is_free
      ? "Free"
      : `₹${single.price_rupees.toLocaleString("en-IN")}`;

    return (
      <div
        id="price-history-card"
        className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
            <svg
              className="w-4 h-4 text-steam-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
            Price History (₹)
          </h3>
          <span className="text-xs text-gray-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
            1 Snapshot Recorded
          </span>
        </div>

        <div className="bg-white/[0.02] border border-steam-border/60 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-bold text-white">
                {displayPrice}
              </span>
              {single.discount_percent > 0 && (
                <span className="bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded text-xs font-bold">
                  -{single.discount_percent}%
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Recorded on {single.fullDate}
            </p>
          </div>
          <p className="text-xs text-gray-500 sm:text-right max-w-xs">
            Historical trend line will be charted automatically as further price changes are logged.
          </p>
        </div>
      </div>
    );
  }

  // Multiple historical snapshots -> Line Chart
  const prices = chartData.map((d) => d.price_rupees);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const isFreeAll = chartData.every((d) => d.is_free || d.price_rupees === 0);

  return (
    <div
      id="price-history-card"
      className="bg-steam-card rounded-2xl border border-steam-border p-5 sm:p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <svg
            className="w-4 h-4 text-steam-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
          </svg>
          Price History (₹)
        </h3>
        <span className="text-xs text-gray-400 bg-white/5 border border-white/10 px-2.5 py-1 rounded-full">
          {chartData.length} Snapshots
        </span>
      </div>

      <div className="w-full h-56 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 12, left: -10, bottom: 0 }}
          >
            <CartesianGrid stroke="#2a2d35" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="recorded_at"
              tickFormatter={(val) => formatAxisDate(val, chartData)}
              stroke="#6b7280"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickLine={{ stroke: "#2a2d35" }}
              axisLine={{ stroke: "#2a2d35" }}
            />
            <YAxis
              stroke="#6b7280"
              tick={{ fill: "#9ca3af", fontSize: 11 }}
              tickLine={{ stroke: "#2a2d35" }}
              axisLine={{ stroke: "#2a2d35" }}
              tickFormatter={(val) => `₹${val}`}
              domain={
                isFreeAll
                  ? [0, 100]
                  : minPrice === maxPrice
                  ? [Math.max(0, minPrice - 100), maxPrice + 100]
                  : ["dataMin", "dataMax"]
              }
            />
            <Tooltip content={<CustomTooltip />} />
            <Line
              type="monotone"
              dataKey="price_rupees"
              name="Price"
              stroke="#66c0f4"
              strokeWidth={2.5}
              dot={{ fill: "#66c0f4", r: 3.5, stroke: "#1a1d24", strokeWidth: 1.5 }}
              activeDot={{ fill: "#66c0f4", r: 6, stroke: "#ffffff", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
