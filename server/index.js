require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { initDB, closeDB, isPostgresConnected } = require("./db/database");
const { startPriceCollector, stopPriceCollector } = require("./services/priceCollector");
const gameRoutes = require("./routes/game");
const authRoutes = require("./routes/auth");
const preferencesRoutes = require("./routes/preferences");

// Ensure JWT_SECRET is set (use a safe dev default only for local dev)
if (!process.env.JWT_SECRET) {
  console.warn("⚠️  JWT_SECRET not set. Using development default. Set JWT_SECRET in production!");
  process.env.JWT_SECRET = "steamlens-dev-secret-change-in-production";
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, server-to-server) or any client origin
      callback(null, true);
    },
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());

app.use("/api", gameRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/games", preferencesRoutes);
app.use("/api/game", preferencesRoutes);
app.use("/api/preferences", preferencesRoutes);

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "SteamLens API",
    database: isPostgresConnected() ? "connected" : "fallback",
  });
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "SteamLens API",
    database: isPostgresConnected()
      ? "PostgreSQL (Connected)"
      : "In-Memory Fallback (PostgreSQL Offline)",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  console.error(err.stack);

  const status = err.status || 500;
  res.status(status).json({
    error: err.message || "Internal server error",
  });
});

async function start() {
  try {
    await initDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 SteamLens API running on http://0.0.0.0:${PORT}`);
      startPriceCollector();
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  stopPriceCollector();
  await closeDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  stopPriceCollector();
  await closeDB();
  process.exit(0);
});

start();


