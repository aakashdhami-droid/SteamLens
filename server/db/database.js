const { Pool } = require("pg");

let pool = null;
let isPgConnected = false;
const memoryStore = new Map();

function getPool() {
  if (!pool && process.env.DATABASE_URL) {
    const isLocal =
      process.env.DATABASE_URL.includes("localhost") ||
      process.env.DATABASE_URL.includes("127.0.0.1");

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 3000,
    });

    pool.on("error", (err) => {
      console.error("⚠️  Unexpected PostgreSQL pool error:", err.message);
    });
  }
  return pool;
}

async function initDB() {
  const p = getPool();
  if (!p) {
    console.warn("⚠️  No DATABASE_URL configured. Running with in-memory cache.");
    return;
  }

  try {
    const client = await p.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS summaries (
          id SERIAL PRIMARY KEY,
          appid VARCHAR(20) UNIQUE NOT NULL,
          game_name TEXT NOT NULL,
          summary TEXT NOT NULL,
          pros JSONB NOT NULL,
          cons JSONB NOT NULL,
          sentiment VARCHAR(20) NOT NULL,
          confidence INTEGER NOT NULL,
          total_reviews_fetched INTEGER DEFAULT 0,
          reviews_sent_to_ai INTEGER DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_summaries_appid ON summaries (appid)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_summaries_created_at ON summaries (created_at DESC)
      `);

      isPgConnected = true;
      console.log("✅ PostgreSQL connected & schema initialized");
    } finally {
      client.release();
    }
  } catch (err) {
    isPgConnected = false;
    console.warn(
      `⚠️  PostgreSQL connection failed (${err.code || err.message || "Connection refused"}). Falling back to in-memory cache for local development.`
    );
  }
}

async function getCached(appid) {
  if (isPgConnected && pool) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM summaries
         WHERE appid = $1
           AND created_at > NOW() - INTERVAL '7 days'`,
        [String(appid)]
      );

      if (rows.length > 0) {
        const row = rows[0];
        return {
          ...row,
          pros: typeof row.pros === "string" ? JSON.parse(row.pros) : row.pros,
          cons: typeof row.cons === "string" ? JSON.parse(row.cons) : row.cons,
        };
      }
    } catch (err) {
      console.error("PostgreSQL getCached error:", err.message);
    }
  }

  const item = memoryStore.get(String(appid));
  if (!item) return null;
  const isExpired =
    Date.now() - new Date(item.created_at).getTime() > 7 * 24 * 60 * 60 * 1000;
  if (isExpired) {
    memoryStore.delete(String(appid));
    return null;
  }
  return item;
}

async function saveSummary(data) {
  if (isPgConnected && pool) {
    try {
      await pool.query(
        `INSERT INTO summaries
           (appid, game_name, summary, pros, cons, sentiment, confidence,
            total_reviews_fetched, reviews_sent_to_ai, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         ON CONFLICT (appid) DO UPDATE SET
           game_name = EXCLUDED.game_name,
           summary = EXCLUDED.summary,
           pros = EXCLUDED.pros,
           cons = EXCLUDED.cons,
           sentiment = EXCLUDED.sentiment,
           confidence = EXCLUDED.confidence,
           total_reviews_fetched = EXCLUDED.total_reviews_fetched,
           reviews_sent_to_ai = EXCLUDED.reviews_sent_to_ai,
           created_at = NOW()`,
        [
          String(data.appid),
          data.game_name,
          data.summary,
          JSON.stringify(data.pros),
          JSON.stringify(data.cons),
          data.sentiment,
          data.confidence,
          data.total_reviews_fetched || 0,
          data.reviews_sent_to_ai || 0,
        ]
      );
      return;
    } catch (err) {
      console.error("PostgreSQL saveSummary error:", err.message);
    }
  }

  memoryStore.set(String(data.appid), {
    id: memoryStore.size + 1,
    appid: String(data.appid),
    game_name: data.game_name,
    summary: data.summary,
    pros: data.pros,
    cons: data.cons,
    sentiment: data.sentiment,
    confidence: data.confidence,
    total_reviews_fetched: data.total_reviews_fetched || 0,
    reviews_sent_to_ai: data.reviews_sent_to_ai || 0,
    created_at: new Date().toISOString(),
  });
}

async function getAllCached() {
  if (isPgConnected && pool) {
    try {
      const { rows } = await pool.query(
        "SELECT * FROM summaries ORDER BY created_at DESC"
      );

      return rows.map((row) => ({
        ...row,
        pros: typeof row.pros === "string" ? JSON.parse(row.pros) : row.pros,
        cons: typeof row.cons === "string" ? JSON.parse(row.cons) : row.cons,
      }));
    } catch (err) {
      console.error("PostgreSQL getAllCached error:", err.message);
    }
  }

  return Array.from(memoryStore.values()).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );
}

async function deleteCached(appid) {
  if (isPgConnected && pool) {
    try {
      await pool.query("DELETE FROM summaries WHERE appid = $1", [String(appid)]);
    } catch (err) {
      console.error("PostgreSQL deleteCached error:", err.message);
    }
  }
  memoryStore.delete(String(appid));
}

async function closeDB() {
  if (pool && isPgConnected) {
    await pool.end();
    console.log("🔌 PostgreSQL pool closed");
  }
}

module.exports = {
  initDB,
  getCached,
  saveSummary,
  getAllCached,
  deleteCached,
  closeDB,
  isPostgresConnected: () => isPgConnected,
};

