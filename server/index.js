const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { initDB, ensureDB, closeDB, isPostgresConnected } = require("./db/database");
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

// Trust first proxy hop behind Render's reverse proxy for correct client IP detection
app.set("trust proxy", 1);

const { isOriginAllowed } = require("./utils/corsConfig");

app.use(
  cors({
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    methods: ["GET", "POST", "DELETE", "PUT", "PATCH", "OPTIONS"],
    credentials: true,
  })
);
app.use(express.json());

// Ensure database connection & schema is initialized (crucial for serverless cold starts)
app.use(async (req, res, next) => {
  try {
    await ensureDB();
  } catch (err) {
    console.warn("⚠️  Database initialization warning:", err.message);
  }
  next();
});

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
    await ensureDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 SteamLens API running on http://0.0.0.0:${PORT}`);
      if (!process.env.VERCEL) {
        startPriceCollector();
      }
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

// In Vercel serverless environment, Vercel imports the app without calling listen().
// Only start the server when run directly (local development, Docker, npm run dev).
if (!process.env.VERCEL && require.main === module) {
  start();
}

module.exports = app;


