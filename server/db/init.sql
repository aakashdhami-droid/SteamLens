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

