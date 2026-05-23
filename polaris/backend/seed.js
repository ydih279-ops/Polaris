// Creates a demo account with 90 days of plausible data so the live app
// looks alive the moment a recruiter opens it.
//   Login: demo@polaris.app  /  demo123
// Run: npm run seed   (safe to re-run; it wipes the demo user first)
const bcrypt = require("bcryptjs");
const pool = require("./db");

const DEMO_EMAIL = "demo@polaris.app";
const DEMO_PASS = "demo123";

function genSeries(days, start, drift, noise) {
  const out = [];
  let v = start;
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    v = Math.max(0, v * (1 + drift) + (Math.random() - 0.5) * noise);
    out.push({ date: d.toISOString().slice(0, 10), value: Math.round(v) });
  }
  return out;
}

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM users WHERE email = $1", [DEMO_EMAIL]);

    const hash = await bcrypt.hash(DEMO_PASS, 10);
    const u = await client.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [DEMO_EMAIL, hash]
    );
    const user_id = u.rows[0].id;

    const ds = await client.query(
      "INSERT INTO datasets (user_id, name) VALUES ($1, $2) RETURNING id",
      [user_id, "Q2 Product Metrics (demo)"]
    );
    const dataset_id = ds.rows[0].id;

    const metrics = {
      active_users: genSeries(90, 800, 0.012, 60),
      revenue: genSeries(90, 3200, 0.015, 220),
      signups: genSeries(90, 40, 0.01, 12),
    };

    const values = [];
    const ph = [];
    let n = 0;
    for (const [name, pts] of Object.entries(metrics)) {
      for (const p of pts) {
        const o = n * 4;
        ph.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`);
        values.push(dataset_id, p.date, name, p.value);
        n++;
      }
    }
    await client.query(
      `INSERT INTO data_points (dataset_id, date, metric_name, metric_value) VALUES ${ph.join(",")}`,
      values
    );

    await client.query("COMMIT");
    console.log(`✓ Seeded ${n} points. Login: ${DEMO_EMAIL} / ${DEMO_PASS}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("✗ Seed failed:", err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
