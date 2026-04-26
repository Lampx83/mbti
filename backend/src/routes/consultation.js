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

export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

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

    const mbtiType = normalizeMbtiType(req.body?.mbti_result || req.body?.mbtiType);
    if (!mbtiType) {
      return res.status(400).json({ error: "mbti_result khong hop le" });
    }

    const provider =
      typeof req.body?.provider === "string" && req.body.provider.trim()
        ? req.body.provider.trim()
        : "ai:external";
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

    // Prefer canonical/index payload for strong reporting (from Vercel),
    // fallback to legacy `sections` if that's all we have.
    const sections =
      pickJsonObject(req.body?.sections_for_storage) ||
      pickJsonObject(req.body?.sectionsForStorage) ||
      pickJsonObject(req.body?.sections);

    await saveConsultation(sessionId, mbtiType, provider, consultation, sections, objectName);
    return res.status(201).json({ ok: true });
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
