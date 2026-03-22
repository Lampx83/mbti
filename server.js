/**
 * Local server entrypoint
 * Runs the API app and (if present) serves the built frontend from dist/.
 */
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import express from "express";
import app from "./app.js";

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

app.listen(PORT, () => {
  console.log(`[Server] Dang chay tai http://localhost:${PORT}`);
});
