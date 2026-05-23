const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("./db");

const router = express.Router();

// ---- middleware: verify a request carries a valid token ----
function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user_id = decoded.user_id;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function signToken(user_id) {
  return jwt.sign({ user_id }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// ---- POST /auth/signup ----
router.post("/signup", async (req, res) => {
  const { email, password } = req.body || {};
  if (!emailOk(email)) return res.status(400).json({ error: "Invalid email" });
  if (!password || password.length < 6)
    return res.status(400).json({ error: "Password must be 6+ characters" });

  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email.toLowerCase(), hash]
    );
    res.json({ token: signToken(rows[0].id), user: rows[0] });
  } catch (err) {
    if (err.code === "23505")
      return res.status(409).json({ error: "Email already registered" });
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /auth/login ----
router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ error: "Email and password required" });

  try {
    const { rows } = await pool.query(
      "SELECT id, email, password_hash FROM users WHERE email = $1",
      [email.toLowerCase()]
    );
    if (rows.length === 0)
      return res.status(401).json({ error: "Invalid credentials" });

    const match = await bcrypt.compare(password, rows[0].password_hash);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });

    res.json({
      token: signToken(rows[0].id),
      user: { id: rows[0].id, email: rows[0].email },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /auth/me (handy for the frontend to check the token) ----
router.get("/me", verifyToken, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, email, created_at FROM users WHERE id = $1",
    [req.user_id]
  );
  res.json(rows[0] || null);
});

module.exports = { router, verifyToken };
