/**
 * MBTI backend (standalone): chạy trên cổng 4000 (hoặc PORT).
 * Dùng PostgreSQL + schema mbti_career mặc định.
 * Tự động tạo schema/bảng khi khởi động.
 */
import "./env.js";
import express from "express";
import cors from "cors";
import { PORT } from "./env.js";
import { ensureDatabase } from "./ensure-db.js";
import { query } from "./db.js";
import { getConsultation, postConsultationSave } from "./routes/consultation.js";
import { postSession, postSessionAI } from "./routes/sessions.js";
import {
  postAdminLogin,
  getAdminStats,
  getAdminSessions,
  getAdminSessionDetail,
  getAdminExport,
} from "./routes/admin.js";
import { requireAdmin } from "./lib/admin-auth.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

app.get("/health", async (_req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", service: "mbti-career-neu", database: "connected" });
  } catch {
    res.status(503).json({ status: "error", service: "mbti-career-neu", database: "disconnected" });
  }
});

app.get("/api/ai-consultation", getConsultation);
app.post("/api/ai-consultation/save", postConsultationSave);
app.post("/api/mbti/sessions", postSession);
app.post("/api/mbti/sessions/:id/ai", postSessionAI);

app.post("/api/admin/login", postAdminLogin);
app.get("/api/admin/stats", requireAdmin, getAdminStats);
app.get("/api/admin/sessions", requireAdmin, getAdminSessions);
app.get("/api/admin/sessions/:id", requireAdmin, getAdminSessionDetail);
app.get("/api/admin/export", requireAdmin, getAdminExport);

async function start() {
  try {
    await ensureDatabase();
  } catch (err) {
    console.error("[mbti] ensureDatabase failed:", err);
    process.exit(1);
  }
  app.listen(PORT, () => {
    console.log("[mbti] Backend listening on port", PORT);
  });
}

start().catch((err) => {
  console.error("[mbti] start failed:", err);
  process.exit(1);
});
