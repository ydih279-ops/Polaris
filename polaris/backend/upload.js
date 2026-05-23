const express = require("express");
const multer = require("multer");
const Papa = require("papaparse");
const pool = require("./db");
const { verifyToken } = require("./auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB cap
});

// POST /upload  (multipart form-data, field name "file")
// CSV columns required: date, metric_name, metric_value
router.post("/", verifyToken, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const csv = req.file.buffer.toString("utf-8");
  const parsed = Papa.parse(csv, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length)
    return res.status(400).json({ error: "Could not parse CSV", details: parsed.errors[0] });

  const rows = parsed.data.filter(
    (r) => r.date && r.metric_name && r.metric_value != null && !isNaN(parseFloat(r.metric_value))
  );
  if (rows.length === 0)
    return res.status(400).json({ error: "No valid rows. Need columns: date, metric_name, metric_value" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const ds = await client.query(
      "INSERT INTO datasets (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at",
      [req.user_id, req.file.originalname]
    );
    const dataset_id = ds.rows[0].id;

    // Batch insert: build one big parameterized query instead of N queries.
    const values = [];
    const placeholders = rows
      .map((r, i) => {
        const o = i * 4;
        values.push(dataset_id, r.date, String(r.metric_name), parseFloat(r.metric_value));
        return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
      })
      .join(", ");

    await client.query(
      `INSERT INTO data_points (dataset_id, date, metric_name, metric_value) VALUES ${placeholders}`,
      values
    );

    await client.query("COMMIT");
    res.json({ dataset: ds.rows[0], rows_inserted: rows.length });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
