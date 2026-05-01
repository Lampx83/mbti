/**
 * Entry cho AI Portal: mount router dùng DB của Portal, schema riêng mbti_career.
 * Portal set PORTAL_DATABASE_URL; ta set DB_SCHEMA=mbti_career để không đụng schema ai_portal.
 */
import cors from 'cors';
import express from "express";
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
import { ensureDatabase } from "./ensure-db.js";

process.env.DB_SCHEMA = process.env.DB_SCHEMA || "mbti_career";
process.env.RUN_MODE = "embedded";

export function createEmbedRouter() {
  const router = express.Router({ mergeParams: true });
  
  // ✅ Thêm CORS middleware trước các routes
  router.use(cors({
    origin:[
    'https://mbti-career-neu.vercel.app',  // Frontend Vercel
    'http://localhost:3000',                 // Dev local
    'http://localhost:5173'                   // Vite dev
    ],  // hoặc whitelist domain cụ thể
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  router.use(express.json({ limit: "2mb" }));

  router.get("/", (_req, res) => {
    res.json({
      service: "mbti-career-neu",
      status: "ok",
      message: "MBTI Career NEU API (mounted on AI Portal). Use /health, /api/ai-consultation, /api/mbti/sessions, /api/admin/*",
      timestamp: new Date().toISOString(),
    });
  });
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "mbti-career-neu", timestamp: new Date().toISOString() });
  });

  router.get("/api/ai-consultation", getConsultation);
  router.post("/api/ai-consultation/save", postConsultationSave);
  router.post("/api/mbti/sessions", postSession);
  router.post("/api/mbti/sessions/:id/ai", postSessionAI);

  router.post("/api/admin/login", postAdminLogin);
  router.get("/api/admin/stats", requireAdmin, getAdminStats);
  router.get("/api/admin/sessions", requireAdmin, getAdminSessions);
  router.get("/api/admin/sessions/:id", requireAdmin, getAdminSessionDetail);
  router.get("/api/admin/export", requireAdmin, getAdminExport);

  ensureDatabase().catch((err) => console.error("[mbti-embed] ensureDatabase failed:", err));
  return router;
}

export default createEmbedRouter;