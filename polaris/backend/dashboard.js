const express = require("express");
const pool = require("./db");
const { verifyToken } = require("./auth");

const router = express.Router();

// Helper: confirm the logged-in user owns this dataset before returning data.
async function ownsDataset(user_id, dataset_id) {
  const { rows } = await pool.query(
    "SELECT user_id FROM datasets WHERE id = $1",
    [dataset_id]
  );
  return rows.length > 0 && rows[0].user_id === user_id;
}

// GET /dashboard/datasets — all uploads for this user
router.get("/datasets", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT d.id, d.name, d.created_at,
            COUNT(dp.id)::int AS point_count
     FROM datasets d
     LEFT JOIN data_points dp ON dp.dataset_id = d.id
     WHERE d.user_id = $1
     GROUP BY d.id
     ORDER BY d.created_at DESC`,
    [req.user_id]
  );
  res.json(rows);
});

// GET /dashboard/data/:id — time series, pivoted by metric, for charts
router.get("/data/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!(await ownsDataset(req.user_id, id)))
    return res.status(403).json({ error: "Not authorized" });

  const { rows } = await pool.query(
    "SELECT date, metric_name, metric_value FROM data_points WHERE dataset_id = $1 ORDER BY date ASC",
    [id]
  );

  // shape: { metricName: [{date, value}, ...], ... }
  const series = {};
  for (const r of rows) {
    (series[r.metric_name] ||= []).push({
      date: r.date,
      value: Number(r.metric_value),
    });
  }
  res.json(series);
});

// GET /dashboard/stats/:id — latest value + % change vs first value, per metric
router.get("/stats/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!(await ownsDataset(req.user_id, id)))
    return res.status(403).json({ error: "Not authorized" });

  const { rows } = await pool.query(
    "SELECT date, metric_name, metric_value FROM data_points WHERE dataset_id = $1 ORDER BY date ASC",
    [id]
  );

  const byMetric = {};
  for (const r of rows) (byMetric[r.metric_name] ||= []).push(Number(r.metric_value));

  const stats = Object.entries(byMetric).map(([name, vals]) => {
    const first = vals[0];
    const last = vals[vals.length - 1];
    const change = first !== 0 ? ((last - first) / Math.abs(first)) * 100 : 0;
    return {
      metric_name: name,
      latest: last,
      change_pct: Math.round(change * 10) / 10,
    };
  });

  res.json(stats);
});

// DELETE /dashboard/datasets/:id — let users remove their own data
router.delete("/datasets/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  if (!(await ownsDataset(req.user_id, id)))
    return res.status(403).json({ error: "Not authorized" });
  await pool.query("DELETE FROM datasets WHERE id = $1", [id]);
  res.json({ deleted: Number(id) });
});

module.exports = router;
