// Applies schema.sql to whatever DATABASE_URL points at.
// Run once after creating the database: npm run init-db
const fs = require("fs");
const path = require("path");
const pool = require("./db");

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf-8");
    await pool.query(sql);
    console.log("✓ Schema applied successfully.");
  } catch (err) {
    console.error("✗ Failed to apply schema:", err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
