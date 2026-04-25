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

export async function getConsultation(req, res) {
  try {
    const mbtiType = String(req.query.mbtiType || "").toUpperCase();
    if (!MBTI_TYPES.includes(mbtiType)) {
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
