/**
 * Local server entrypoint
 * Runs the API app and (if present) serves the built frontend from dist/.
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import express from "express";
import app from "./app.js";
import pool from "./src/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

// Production: serve built frontend (dist/) and SPA fallback
const distPath = path.join(__dirname, "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Express v5 + path-to-regexp v6 doesn't accept bare "*"
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/health") return next();
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.get('/mbti_log', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send('DB error');
  }
});

// Backward-compatible dev endpoint (deprecated).
// Prefer POST /api/mbti/sessions.
app.post("/save-mbti", async (req, res) => {
  const { user_name, mbti_result } = req.body || {};
  try {
    const result = await pool.query(
      `INSERT INTO mbti_sessions (user_name, mbti_result)
       VALUES ($1, $2)
       RETURNING *`,
      [user_name ?? null, mbti_result ?? null],
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving");
  }
});

app.listen(PORT, () => {
  console.log(`[Server] Dang chay tai http://localhost:${PORT}`);
});
