-- Polaris schema
-- Run automatically by initdb.js, or manually: psql $DATABASE_URL < schema.sql

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS datasets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_points (
  id           SERIAL PRIMARY KEY,
  dataset_id   INTEGER NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  date         DATE NOT NULL,
  metric_name  VARCHAR(255) NOT NULL,
  metric_value DECIMAL(14, 2) NOT NULL,
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dp_dataset_date
  ON data_points(dataset_id, date);
