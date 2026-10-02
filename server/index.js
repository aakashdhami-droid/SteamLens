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
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "POST", "DELETE"],
  })
);
app.use(express.json());

app.use("/api", gameRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/games", preferencesRoutes);
app.use("/api/game", preferencesRoutes);
app.use("/api/preferences", preferencesRoutes);


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

    app.listen(PORT, () => {
      console.log(`🚀 SteamLens API running on http://localhost:${PORT}`);
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


