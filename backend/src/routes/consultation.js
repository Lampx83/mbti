/**
 * GET /api/ai-consultation?mbtiType=INTJ&sessionId=123
 * - Tải DOCX từ MinIO, bóc text bằng mammoth.
 * - Parse 7 mục bằng heuristic + AI (OpenAI/Ollama) nếu cấu hình.
 * - Nếu có sessionId, lưu kết quả vào ai_consultations.
 */
import mammoth from "mammoth";
import { fetchPersonalityDoc, isNotFoundError } from "../lib/minio.js";
import { extractSectionsByHeadings, normalizeSections } from "../lib/sections.js";
import { extractSectionsWithAI, resolveAIProvider } from "../lib/ai.js";
import { query } from "../db.js";
import { EXTERNAL_AI_BASE } from "../env.js";

export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

const PROVIDER_ALLOWED = new Set(["vercel", "heuristic", "openai", "ollama", "external"]);

function normalizeProvider(input) {
  const raw = typeof input === "string" ? input.trim() : "";
  const s = raw.toLowerCase();
  if (!s) return "vercel";
  if (s === "vercel") return "vercel";
  if (s === "heuristic") return "heuristic";
  if (s === "openai" || s === "ai:openai") return "openai";
  if (s === "ollama" || s === "ai:ollama") return "ollama";
  if (s === "external" || s === "ai:external") return "external";
  if (s.startsWith("ai:openai")) return "openai";
  if (s.startsWith("ai:ollama")) return "ollama";
  return "external";
}

async function saveConsultation(sessionId, mbtiType, provider, consultation, sections, objectName) {
  if (!sessionId) return;
  try {
    await query(
      `INSERT INTO __SCHEMA__.ai_consultations
        (session_id, mbti_result, provider, consultation, sections, object_name)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
      [
        sessionId,
        mbtiType,
        provider || "none",
        consultation || null,
        sections ? JSON.stringify(sections) : null,
        objectName || null,
      ],
    );
  } catch (err) {
    console.error("[Consultation] save ai_consultations failed:", err?.message || err);
  }
}

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), ms);
  return { signal: ac.signal, clear: () => clearTimeout(t) };
}

async function fetchExternalConsultation(mbtiType) {
  if (!EXTERNAL_AI_BASE) return null;
  if (typeof fetch !== "function") {
    throw new Error("Runtime does not support fetch(); cannot call external AI.");
  }

  const url = `${EXTERNAL_AI_BASE}/api/ai-consultation?mbtiType=${encodeURIComponent(mbtiType)}`;
  const { signal, clear } = withTimeout(15000);
  try {
    const resp = await fetch(url, { method: "GET", signal });
    const text = await resp.text().catch(() => "");
    if (!resp.ok) {
      throw new Error(`External AI failed (HTTP ${resp.status}): ${text || "no body"}`);
    }
    const data = text ? JSON.parse(text) : null;
    if (!data || typeof data !== "object") {
      throw new Error("External AI returned invalid JSON");
    }
    return data;
  } finally {
    clear();
  }
}

async function ensureSessionExists(sessionId) {
  const out = await query(
    `SELECT 1
       FROM __SCHEMA__.mbti_sessions
      WHERE id = $1
      LIMIT 1`,
    [sessionId],
  );
  return out.rowCount > 0;
}

/**
 * "PUT semantics" for consultation save:
 * - If the session already has an ai_consultations row: update the latest one.
 * - Else: insert a new row.
 *
 * This avoids unbounded row growth from repeated external callbacks.
 * Throws on DB errors so caller can return non-2xx.
 */
async function putConsultation(sessionId, mbtiType, provider, consultation, sections, objectName) {
  const latest = await query(
    `SELECT id
       FROM __SCHEMA__.ai_consultations
      WHERE session_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    [sessionId],
  );

  const payload = [
    sessionId,
    mbtiType,
    provider || "none",
    consultation || null,
    sections ? JSON.stringify(sections) : null,
    objectName || null,
  ];

  if (latest.rows[0]?.id) {
    await query(
      `UPDATE __SCHEMA__.ai_consultations
          SET session_id = $1,
              mbti_result = $2,
              provider = $3,
              consultation = $4,
              sections = $5::jsonb,
              object_name = $6,
              created_at = now()
        WHERE id = $7`,
      [...payload, latest.rows[0].id],
    );
    return { mode: "update", id: latest.rows[0].id };
  }

  const ins = await query(
    `INSERT INTO __SCHEMA__.ai_consultations
      (session_id, mbti_result, provider, consultation, sections, object_name)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     RETURNING id`,
    payload,
  );
  return { mode: "insert", id: ins.rows[0]?.id ?? null };
}

function normalizeMbtiType(input) {
  const s = typeof input === "string" ? input.trim().toUpperCase() : "";
  return MBTI_TYPES.includes(s) ? s : "";
}

/**
 * POST /api/ai-consultation/save
 * Nhận payload từ service AI (vd Vercel) và lưu vào DB theo schema hiện tại.
 */
export async function postConsultationSave(req, res) {
  try {
    const sessionId = Number(req.body?.session_id);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: "session_id khong hop le" });
    }

    const sessionExists = await ensureSessionExists(sessionId);
    if (!sessionExists) {
      return res.status(404).json({ error: "Khong tim thay session" });
    }

    const mbtiType = normalizeMbtiType(req.body?.mbti_result || req.body?.mbtiType);
    if (!mbtiType) {
      return res.status(400).json({ error: "mbti_result khong hop le" });
    }

    const providerCandidate =
      typeof req.body?.provider === "string" && req.body.provider.trim()
        ? req.body.provider.trim()
        : "ai:external";
    const provider = normalizeProvider(providerCandidate);
    if (!PROVIDER_ALLOWED.has(provider)) {
      return res.status(400).json({ error: "provider khong hop le" });
    }
    const consultation =
      typeof req.body?.consultation === "string" && req.body.consultation.trim()
        ? req.body.consultation
        : null;
    const objectName =
      typeof req.body?.object_name === "string" && req.body.object_name.trim()
        ? req.body.object_name.trim()
        : typeof req.body?.objectName === "string" && req.body.objectName.trim()
          ? req.body.objectName.trim()
          : null;

    const pickJsonObject = (v) => {
      if (v && typeof v === "object") return v;
      if (typeof v === "string" && v.trim()) {
        try { return JSON.parse(v); } catch { return null; }
      }
      return null;
    };

    // Strong contract: chỉ nhận canonical payload `sections_for_storage` (hoặc alias camelCase).
    const sections =
      pickJsonObject(req.body?.sections_for_storage) ||
      pickJsonObject(req.body?.sectionsForStorage);
    if (!sections) {
      return res.status(400).json({ error: "Thieu sections_for_storage" });
    }

    const result = await putConsultation(sessionId, mbtiType, provider, consultation, sections, objectName);
    // Backward-compatible success status (previously always 201).
    // Now we only return 201 when the DB write actually succeeded.
    return res.status(201).json({ ok: true, mode: result.mode, id: result.id });
  } catch (err) {
    console.error("[Consultation] save endpoint error:", err?.message || err);
    return res.status(500).json({ error: "Loi khi luu tu van" });
  }
}

export async function getConsultation(req, res) {
  try {
    const mbtiType = normalizeMbtiType(req.query.mbtiType);
    if (!mbtiType) {
      return res.status(400).json({ error: "mbtiType khong hop le. Can mot trong 16 loai MBTI." });
    }
    const sessionIdRaw = req.query.sessionId;
    const sessionId = sessionIdRaw && Number.isFinite(Number(sessionIdRaw)) ? Number(sessionIdRaw) : null;

    // If configured, prefer external JSON provider (e.g. Vercel), then persist to DB.
    if (EXTERNAL_AI_BASE) {
      const ext = await fetchExternalConsultation(mbtiType);

      const consultation =
        typeof ext?.consultation === "string" && ext.consultation.trim() ? ext.consultation : "";
      const sections =
        ext?.sections && typeof ext.sections === "object" ? ext.sections : null;
      const sectionsForStorage =
        ext?.sections_for_storage && typeof ext.sections_for_storage === "object"
          ? ext.sections_for_storage
          : ext?.sectionsForStorage && typeof ext.sectionsForStorage === "object"
            ? ext.sectionsForStorage
            : sections;

      const providerCandidate =
        (typeof ext?.sections_source === "string" && ext.sections_source.trim()) ||
        (typeof ext?.provider === "string" && ext.provider.trim()) ||
        "vercel";
      const provider = normalizeProvider(providerCandidate);
      const objectName =
        (typeof ext?.objectName === "string" && ext.objectName.trim()) ||
        (typeof ext?.object_name === "string" && ext.object_name.trim()) ||
        null;

      // Persist if session exists; do not fail the user-facing response if persistence fails.
      if (sessionId) {
        try {
          const exists = await ensureSessionExists(sessionId);
          if (exists) {
            await putConsultation(sessionId, mbtiType, provider, consultation || null, sectionsForStorage, objectName);
          }
        } catch (err) {
          console.error("[Consultation] external persist failed:", err?.message || err);
        }
      }

      return res.json({
        mbtiType,
        consultation,
        sections,
        sections_for_storage: sectionsForStorage || null,
        sections_source: provider,
        objectName: objectName || "",
      });
    }

    let personalityData = "";
    let objectNameUsed = "";

    try {
      const { objectName, buffer } = await fetchPersonalityDoc(mbtiType);
      objectNameUsed = objectName;
      const result = await mammoth.extractRawText({ buffer });
      personalityData = (result.value || "").trim();
    } catch (minioErr) {
      const notFound = isNotFoundError(minioErr);
      console.error("[MinIO] Doc file loi:", mbtiType, minioErr.message);
      return res.status(notFound ? 404 : 502).json({
        error: notFound
          ? "Khong tim thay du lieu tinh cach cho " + mbtiType
          : "Khong ket noi duoc den kho du lieu MBTI",
        detail: minioErr.message,
      });
    }

    if (!personalityData) {
      return res.status(500).json({ error: "Du lieu DOCX trong hoac khong trich xuat duoc van ban." });
    }

    const text = personalityData;
    const heuristicSections = normalizeSections(extractSectionsByHeadings(text), mbtiType);
    const useAIParam = String(req.query.useAI || "").toLowerCase();
    const provider = resolveAIProvider();
    const useAI = provider !== "none" && useAIParam !== "false";
    const aiSections = useAI ? await extractSectionsWithAI(text, mbtiType, provider) : null;
    const sections = aiSections || heuristicSections;
    const sourceTag = aiSections ? `ai:${provider}` : heuristicSections ? "heuristic" : "none";

    // Keep existing behavior: attempt to insert a row (best-effort).
    // NOTE: In external-AI mode we use putConsultation (update latest) to avoid row growth.
    await saveConsultation(sessionId, mbtiType, sourceTag, text, sections, objectNameUsed);

    return res.json({
      mbtiType,
      consultation: text,
      sections,
      sections_source: sourceTag,
      objectName: objectNameUsed,
    });
  } catch (err) {
    console.error("[Consultation] Loi:", err.message);
    return res.status(500).json({
      error: "Loi khi tai tu van tu tai lieu.",
      detail: err.message,
    });
  }
}
