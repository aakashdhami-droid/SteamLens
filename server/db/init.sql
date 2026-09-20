CREATE TABLE IF NOT EXISTS summaries (
  id              SERIAL PRIMARY KEY,
  appid           VARCHAR(20) UNIQUE NOT NULL,
  game_name       TEXT NOT NULL,
  summary         TEXT NOT NULL,
  pros            JSONB NOT NULL,
  cons            JSONB NOT NULL,
  sentiment       VARCHAR(20) NOT NULL,
  confidence      INTEGER NOT NULL,
  total_reviews_fetched  INTEGER DEFAULT 0,
  reviews_sent_to_ai     INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_appid
  ON summaries (appid);

CREATE INDEX IF NOT EXISTS idx_summaries_created_at
  ON summaries (created_at DESC);

-- ── Price Tracking ────────────────────────────────────────

-- Games being tracked for price monitoring
CREATE TABLE IF NOT EXISTS tracked_games (
  id                    SERIAL PRIMARY KEY,
  appid                 VARCHAR(20) UNIQUE NOT NULL,
  game_name             TEXT NOT NULL,
  tracking_started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at       TIMESTAMPTZ,
  price_change_number   BIGINT,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_tracked_games_appid
  ON tracked_games (appid);
CREATE INDEX IF NOT EXISTS idx_tracked_games_active
  ON tracked_games (is_active) WHERE is_active = TRUE;

-- Price observation history (INR, stored as integer paise)
CREATE TABLE IF NOT EXISTS price_history (
  id                    SERIAL PRIMARY KEY,
  appid                 VARCHAR(20) NOT NULL,
  price_paise           INTEGER,
  currency              VARCHAR(10) NOT NULL DEFAULT 'INR',
  original_price_paise  INTEGER,
  discount_percent      INTEGER DEFAULT 0,
  is_free               BOOLEAN DEFAULT FALSE,
  recorded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_appid
  ON price_history (appid);
CREATE INDEX IF NOT EXISTS idx_price_history_appid_recorded
  ON price_history (appid, recorded_at DESC);


