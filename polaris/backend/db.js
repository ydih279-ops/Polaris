const { Pool } = require("pg");
require("dotenv").config();

// Railway (and most hosted Postgres) require SSL in production.
// Locally you usually don't. This toggles based on NODE_ENV.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

pool.on("error", (err) => {
  console.error("Unexpected DB error:", err);
});

module.exports = pool;
