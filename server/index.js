require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { initDB, closeDB, isPostgresConnected } = require("./db/database");
const gameRoutes = require("./routes/game");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    methods: ["GET", "DELETE"],
  })
);
app.use(express.json());

app.use("/api", gameRoutes);

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
    });
  } catch (err) {
    console.error("❌ Failed to start server:", err.message);
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  console.log("\n🛑 Shutting down...");
  await closeDB();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await closeDB();
  process.exit(0);
});

start();

