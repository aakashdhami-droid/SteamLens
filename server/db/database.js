const { Pool } = require("pg");

let pool = null;
let isPgConnected = false;
const memoryStore = new Map();
const memoryTrackedGames = new Map();
const memoryPriceHistory = [];

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

      // ── Price Tracking tables ──
      await client.query(`
        CREATE TABLE IF NOT EXISTS tracked_games (
          id                    SERIAL PRIMARY KEY,
          appid                 VARCHAR(20) UNIQUE NOT NULL,
          game_name             TEXT NOT NULL,
          tracking_started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_checked_at       TIMESTAMPTZ,
          price_change_number   BIGINT,
          is_active             BOOLEAN NOT NULL DEFAULT TRUE
        )
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tracked_games_appid ON tracked_games (appid)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tracked_games_active ON tracked_games (is_active) WHERE is_active = TRUE
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS price_history (
          id                    SERIAL PRIMARY KEY,
          appid                 VARCHAR(20) NOT NULL,
          price_paise           INTEGER,
          currency              VARCHAR(10) NOT NULL DEFAULT 'INR',
          original_price_paise  INTEGER,
          discount_percent      INTEGER DEFAULT 0,
          is_free               BOOLEAN DEFAULT FALSE,
          recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      // Migration check in case table was created with old column names
      await client.query(`
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_history' AND column_name='price_cents') THEN
            ALTER TABLE price_history RENAME COLUMN price_cents TO price_paise;
          END IF;
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='price_history' AND column_name='original_price_cents') THEN
            ALTER TABLE price_history RENAME COLUMN original_price_cents TO original_price_paise;
          END IF;
        END $$;
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_price_history_appid ON price_history (appid)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_price_history_appid_recorded ON price_history (appid, recorded_at DESC)
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

// ── Price Tracking functions ──────────────────────────────

async function addTrackedGame(appid, gameName) {
  if (isPgConnected && pool) {
    try {
      const { rowCount } = await pool.query(
        `INSERT INTO tracked_games (appid, game_name)
         VALUES ($1, $2)
         ON CONFLICT (appid) DO NOTHING`,
        [String(appid), gameName]
      );
      return { isNew: rowCount > 0 };
    } catch (err) {
      console.error("PostgreSQL addTrackedGame error:", err.message);
    }
  }

  const key = String(appid);
  if (!memoryTrackedGames.has(key)) {
    memoryTrackedGames.set(key, {
      id: memoryTrackedGames.size + 1,
      appid: key,
      game_name: gameName,
      tracking_started_at: new Date().toISOString(),
      last_checked_at: null,
      price_change_number: null,
      is_active: true,
    });
    return { isNew: true };
  }
  return { isNew: false };
}

async function getActiveTrackedGames() {
  if (isPgConnected && pool) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM tracked_games WHERE is_active = TRUE`
      );
      return rows;
    } catch (err) {
      console.error("PostgreSQL getActiveTrackedGames error:", err.message);
    }
  }

  return Array.from(memoryTrackedGames.values()).filter((g) => g.is_active);
}

async function updateTrackedGameAfterCheck(appid, priceChangeNumber) {
  if (isPgConnected && pool) {
    try {
      await pool.query(
        `UPDATE tracked_games
         SET last_checked_at = NOW(),
             price_change_number = $2
         WHERE appid = $1`,
        [String(appid), priceChangeNumber]
      );
      return;
    } catch (err) {
      console.error("PostgreSQL updateTrackedGameAfterCheck error:", err.message);
    }
  }

  const game = memoryTrackedGames.get(String(appid));
  if (game) {
    game.last_checked_at = new Date().toISOString();
    game.price_change_number = priceChangeNumber;
  }
}

async function savePriceSnapshot(data) {
  if (isPgConnected && pool) {
    try {
      // Check the most recent snapshot — skip if price is identical
      const { rows } = await pool.query(
        `SELECT price_paise, original_price_paise, discount_percent, is_free
         FROM price_history
         WHERE appid = $1
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [String(data.appid)]
      );

      if (rows.length > 0) {
        const last = rows[0];
        if (
          last.price_paise === data.price_paise &&
          last.original_price_paise === data.original_price_paise &&
          last.discount_percent === data.discount_percent &&
          last.is_free === data.is_free
        ) {
          return { inserted: false };
        }
      }

      await pool.query(
        `INSERT INTO price_history
           (appid, price_paise, currency, original_price_paise, discount_percent, is_free)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          String(data.appid),
          data.price_paise ?? null,
          data.currency || "INR",
          data.original_price_paise ?? null,
          data.discount_percent ?? 0,
          data.is_free ?? false,
        ]
      );
      return { inserted: true };
    } catch (err) {
      console.error("PostgreSQL savePriceSnapshot error:", err.message);
    }
  }

  // In-memory fallback
  const appidStr = String(data.appid);
  const appSnapshots = memoryPriceHistory.filter((s) => s.appid === appidStr);
  if (appSnapshots.length > 0) {
    const last = appSnapshots[appSnapshots.length - 1];
    if (
      last.price_paise === data.price_paise &&
      last.original_price_paise === data.original_price_paise &&
      last.discount_percent === data.discount_percent &&
      last.is_free === data.is_free
    ) {
      return { inserted: false };
    }
  }

  memoryPriceHistory.push({
    id: memoryPriceHistory.length + 1,
    appid: appidStr,
    price_paise: data.price_paise ?? null,
    currency: data.currency || "INR",
    original_price_paise: data.original_price_paise ?? null,
    discount_percent: data.discount_percent ?? 0,
    is_free: data.is_free ?? false,
    recorded_at: new Date().toISOString(),
  });
  return { inserted: true };
}

async function getLatestPrice(appid) {
  if (isPgConnected && pool) {
    try {
      const { rows } = await pool.query(
        `SELECT * FROM price_history
         WHERE appid = $1
         ORDER BY recorded_at DESC
         LIMIT 1`,
        [String(appid)]
      );
      return rows.length > 0 ? rows[0] : null;
    } catch (err) {
      console.error("PostgreSQL getLatestPrice error:", err.message);
    }
  }

  const appidStr = String(appid);
  const appSnapshots = memoryPriceHistory.filter((s) => s.appid === appidStr);
  return appSnapshots.length > 0 ? appSnapshots[appSnapshots.length - 1] : null;
}

async function getPriceHistory(appid) {
  if (isPgConnected && pool) {
    try {
      const { rows } = await pool.query(
        `SELECT price_paise, currency, original_price_paise, discount_percent, is_free, recorded_at
         FROM price_history
         WHERE appid = $1
         ORDER BY recorded_at ASC`,
        [String(appid)]
      );
      return rows;
    } catch (err) {
      console.error("PostgreSQL getPriceHistory error:", err.message);
      throw err;
    }
  }

  const appidStr = String(appid);
  return memoryPriceHistory
    .filter((s) => s.appid === appidStr)
    .sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at))
    .map((s) => ({
      price_paise: s.price_paise,
      currency: s.currency,
      original_price_paise: s.original_price_paise,
      discount_percent: s.discount_percent,
      is_free: s.is_free,
      recorded_at: s.recorded_at,
    }));
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
  // Price tracking
  addTrackedGame,
  getActiveTrackedGames,
  updateTrackedGameAfterCheck,
  savePriceSnapshot,
  getLatestPrice,
  getPriceHistory,
};

