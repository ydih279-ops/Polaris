# Polaris — Full-Stack Analytics App

A small but complete SaaS: marketing landing page, user auth, CSV data upload,
and a live dashboard that renders charts from real data in a Postgres database.

**Stack:** Node.js + Express · PostgreSQL · vanilla JS frontend (single file, SVG charts) · JWT auth.

Built to be understood, not just deployed. Read [ARCHITECTURE](#architecture) before your interview.

---

## What it does

- Sign up / log in (passwords hashed with bcrypt, sessions via JWT).
- Upload a CSV of metrics; rows are parsed, validated, and stored.
- View a dashboard: stat cards with % change, a multi-line trend chart drawn from live API data.
- Every user only sees their own datasets (enforced server-side).

A seeded demo account (`demo@polaris.app` / `demo123`) ships with 90 days of data so the app looks alive immediately.

---

## Run locally

You need Node 18+ and a PostgreSQL database. Easiest free DB: [neon.tech](https://neon.tech) (no install).

```bash
cd backend
npm install
cp .env.example .env          # then paste your DATABASE_URL + a random JWT_SECRET
npm run init-db               # creates the tables
npm run seed                  # optional: demo account + sample data

# put the frontend where the server serves it:
mkdir -p public && cp ../frontend/index.html public/

npm start                     # http://localhost:5000
```

Open http://localhost:5000 and log in with the demo account.

---

## Deploy (Railway, free)

1. Push this repo to GitHub.
2. On [railway.app](https://railway.app): **New Project → Deploy from GitHub repo**, pick this repo, set root directory to `backend`.
3. In the same project: **New → Database → PostgreSQL**. Railway auto-injects `DATABASE_URL`.
4. Add two variables to the backend service: `JWT_SECRET` (any long random string) and `NODE_ENV=production`.
5. Before first boot, copy the frontend in: add a build step or commit `frontend/index.html` to `backend/public/index.html`.
6. Open the Railway shell once and run `npm run init-db` then `npm run seed`.
7. Hit the generated URL. Done.

(Full click-by-click steps were provided in chat.)

---

## Architecture

```
frontend/index.html      one-file dashboard: auth UI, fetch() calls, SVG chart renderer
backend/
  server.js              Express app; mounts routers; serves the frontend
  db.js                  pg connection pool (SSL on in production)
  schema.sql             users · datasets · data_points (+ index)
  auth.js                /auth/signup /login /me  + verifyToken JWT middleware
  upload.js              /upload  — multer + papaparse, transactional batch insert
  dashboard.js           /dashboard/datasets /data/:id /stats/:id  (+ ownership checks)
  seed.js                demo account generator
  initdb.js              applies schema.sql
```

**Why these choices (the interview answers):**

- **JWT, not server sessions** — the API is stateless, so it scales horizontally and the same backend can serve web or mobile without a shared session store. Trade-off: you can't instantly revoke a token, which is why they expire in 7 days.
- **Three normalized tables** — `data_points` is one row per (metric, day) so the DB can aggregate, filter, and the chart query stays a simple indexed range scan instead of parsing blobs.
- **Batch insert in a transaction** — a 1,000-row CSV is one `INSERT ... VALUES (...),(...)` inside `BEGIN/COMMIT`, not 1,000 round-trips. If any row fails, the whole upload rolls back.
- **Ownership check on every read** — `verifyToken` proves *who* you are; `ownsDataset()` proves you're allowed to see *this* data. Authentication and authorization are separate on purpose.

## Tests

`node test.js` (in chat) runs 13 integration checks against the live Express app
with the DB driver stubbed: auth, token rejection, duplicate handling, CSV
parsing, the stats math, and cross-user access blocking. All pass.
