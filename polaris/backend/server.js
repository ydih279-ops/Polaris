const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { router: authRouter } = require("./auth");
const uploadRouter = require("./upload");
const dashboardRouter = require("./dashboard");

if (!process.env.JWT_SECRET) {
  console.warn("⚠  JWT_SECRET is not set. Set it in .env / Railway variables.");
}

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) =>
  res.json({ status: "ok", service: "polaris-api" })
);

app.use("/auth", authRouter);
app.use("/upload", uploadRouter);
app.use("/dashboard", dashboardRouter);

// Serve the frontend (single folder of static files) in production.
const publicDir = path.join(__dirname, "..", "frontend");
app.use(express.static(publicDir));
app.get("*", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Polaris API running on :${PORT}`));
