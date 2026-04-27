/**
 * POST /api/mbti/sessions
 * Lưu một lần làm bài (session + 20 answers). Trả về session_id để frontend lấy AI consultation gắn với session.
 */
import { withTransaction, withSchema } from "../db.js";
import { MBTI_TYPES } from "./consultation.js";

function isValidMbtiCode(code) {
  return typeof code === "string" && MBTI_TYPES.includes(code.trim().toUpperCase());
}

function isValidAnswerValue(v) {
  return Number.isInteger(v) && v >= 1 && v <= 7;
}

function normalizeAnswersInput(answers) {
  if (!Array.isArray(answers)) return null;
  const normalized = [];
  for (const item of answers) {
    const question_number = Number(item?.question_number);
    const answer_value = Number(item?.answer_value);
    if (!Number.isInteger(question_number) || question_number < 1) return null;
    if (!isValidAnswerValue(answer_value)) return null;
    normalized.push({ question_number, answer_value });
  }
  return normalized.length ? normalized : null;
}

function pickJsonObject(v) {
  if (v && typeof v === "object") return v;
  if (typeof v === "string" && v.trim()) {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
}

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
  // Handle pattern like "ai:gpt-4o-mini" → treat as openai
  if (s.startsWith("ai:openai")) return "openai";
  if (s.startsWith("ai:ollama")) return "ollama";
  // Unknown tags (e.g. "ai:gpt-4o-mini") → external (safe bucket for reporting)
  return "external";
}

function extractOptionalAiPayload(body) {
  const src = body?.ai_consultation && typeof body.ai_consultation === "object" ? body.ai_consultation : body;
  if (!src || typeof src !== "object") return null;

  const providerCandidate =
    typeof src?.provider === "string" && src.provider.trim()
      ? src.provider.trim()
      : typeof src?.sections_source === "string" && src.sections_source.trim()
        ? src.sections_source.trim()
        : "vercel";
  const provider = normalizeProvider(providerCandidate);
  if (!PROVIDER_ALLOWED.has(provider)) return null;

  const consultation =
    typeof src?.consultation === "string" && src.consultation.trim()
      ? src.consultation
      : null;

  const object_name =
    typeof src?.objectName === "string" && src.objectName.trim()
      ? src.objectName.trim()
      : typeof src?.object_name === "string" && src.object_name.trim()
        ? src.object_name.trim()
        : null;

  // Strong contract: chỉ nhận canonical payload `sections_for_storage` (hoặc alias camelCase).
  // Không dùng `sections` để lưu DB để tránh mismatch/thiếu khóa cho báo cáo.
  const sections =
    pickJsonObject(src?.sections_for_storage) ||
    pickJsonObject(src?.sectionsForStorage) ||
    null;

  // Data policy: bắt buộc phải có sections_for_storage khi lưu DB.
  if (!sections) return null;
  return { provider, consultation, object_name, sections };
}

export async function postSession(req, res) {
  // Optional mode: save AI consultation (no session/answers creation).
  // This is designed to work with Portal allowlists that only forward POST /api/mbti/sessions.
  const modeFromBody = typeof req.body?.mode === "string" ? req.body.mode.trim() : "";
  const modeFromQuery = typeof req.query?.mode === "string" ? req.query.mode.trim() : "";
  const mode = modeFromQuery || modeFromBody;
  const looksLikeAiSave =
    mode === "ai_save" ||
    // Some proxy layers may drop query parsing; fallback to raw URL.
    // If the incoming URL still contains `mode=ai_save`, treat as ai_save no matter what.
    (typeof req.originalUrl === "string" && /[?&]mode=ai_save\b/.test(req.originalUrl)) ||
    // Some proxies/framework layers may drop/transform `mode` — fall back to shape-based detection.
    // We only enter this branch when session_id + mbtiType exist AND there's AI payload.
    (Number.isFinite(Number(req.body?.session_id)) &&
      typeof req.body?.mbtiType === "string" &&
      (req.body?.sections_for_storage !== undefined || req.body?.sections !== undefined || req.body?.consultation !== undefined));

  if (looksLikeAiSave) {
    const sessionId = Number(req.body?.session_id);
    if (!Number.isFinite(sessionId) || sessionId <= 0) {
      return res.status(400).json({ error: "session_id khong hop le" });
    }

    const mbti_result =
      typeof req.body?.mbtiType === "string"
        ? req.body.mbtiType.trim().toUpperCase()
        : typeof req.body?.mbti_result === "string"
          ? req.body.mbti_result.trim().toUpperCase()
          : "";
    if (!isValidMbtiCode(mbti_result)) {
      return res.status(400).json({ error: "mbti_result khong hop le" });
    }

    const provider =
      typeof req.body?.provider === "string" && req.body.provider.trim()
        ? req.body.provider.trim()
        : typeof req.body?.sections_source === "string" && req.body.sections_source.trim()
          ? req.body.sections_source.trim()
          : "vercel";

    const consultation =
      typeof req.body?.consultation === "string" && req.body.consultation.trim()
        ? req.body.consultation
        : null;

    const object_name =
      typeof req.body?.objectName === "string" && req.body.objectName.trim()
        ? req.body.objectName.trim()
        : typeof req.body?.object_name === "string" && req.body.object_name.trim()
          ? req.body.object_name.trim()
          : null;

    const sections =
      pickJsonObject(req.body?.sections_for_storage) ||
      pickJsonObject(req.body?.sectionsForStorage) ||
      pickJsonObject(req.body?.sections) ||
      null;

    if (!consultation && !sections) {
      return res.status(400).json({ error: "Thieu du lieu tu van (consultation/sections)" });
    }

    try {
      const out = await withTransaction(async (client) => {
        const session = await client.query(
          withSchema(`SELECT id FROM __SCHEMA__.mbti_sessions WHERE id = $1`),
          [sessionId],
        );
        if (!session.rows?.length) return null;

        // PUT semantics: update latest row if exists; else insert new.
        const latest = await client.query(
          withSchema(
            `SELECT id
               FROM __SCHEMA__.ai_consultations
              WHERE session_id = $1
              ORDER BY created_at DESC, id DESC
              LIMIT 1`,
          ),
          [sessionId],
        );

        if (latest.rows?.[0]?.id) {
          await client.query(
            withSchema(
              `UPDATE __SCHEMA__.ai_consultations
                  SET mbti_result = $1,
                      provider = $2,
                      consultation = $3,
                      sections = $4::jsonb,
                      object_name = $5,
                      created_at = now()
                WHERE id = $6`,
            ),
            [
              mbti_result,
              provider,
              consultation,
              sections ? JSON.stringify(sections) : null,
              object_name,
              latest.rows[0].id,
            ],
          );
          return { ok: true, mode: "update", id: latest.rows[0].id };
        }

        const ins = await client.query(
          withSchema(
            `INSERT INTO __SCHEMA__.ai_consultations
              (session_id, mbti_result, provider, consultation, sections, object_name)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6)
             RETURNING id`,
          ),
          [
            sessionId,
            mbti_result,
            provider,
            consultation,
            sections ? JSON.stringify(sections) : null,
            object_name,
          ],
        );
        return { ok: true, mode: "insert", id: ins.rows?.[0]?.id ?? null };
      });

      if (!out) return res.status(404).json({ error: "Khong tim thay session" });
      return res.status(201).json(out);
    } catch (err) {
      console.error("[Sessions] ai_save error:", err?.message || err);
      return res.status(500).json({ error: "Loi luu tu van AI" });
    }
  }

  const user_name = typeof req.body?.user_name === "string" ? req.body.user_name.trim() : "";
  const user_profile_id =
    typeof req.body?.user_profile_id === "string" ? req.body.user_profile_id.trim() : "";
  const mbti_result = typeof req.body?.mbti_result === "string" ? req.body.mbti_result.trim().toUpperCase() : "";
  const answers = normalizeAnswersInput(req.body?.answers);
  const optionalAi = extractOptionalAiPayload(req.body);

  if (!user_name) return res.status(400).json({ error: "user_name bat buoc" });
  if (!user_profile_id) return res.status(400).json({ error: "user_profile_id bat buoc" });
  if (!isValidMbtiCode(mbti_result)) return res.status(400).json({ error: "mbti_result khong hop le" });
  if (!answers) return res.status(400).json({ error: "answers khong hop le" });

  try {
    const out = await withTransaction(async (client) => {
      const sessionIns = await client.query(
        withSchema(
          `INSERT INTO __SCHEMA__.mbti_sessions (user_name, user_profile_id, mbti_result)
           VALUES ($1, $2, $3)
           RETURNING id, user_name, user_profile_id, mbti_result, created_at`,
        ),
        [user_name, user_profile_id, mbti_result],
      );
      const session = sessionIns.rows[0];

      const values = [];
      const params = [];
      let p = 1;
      for (const a of answers) {
        values.push(`($${p++}, $${p++}, $${p++})`);
        params.push(session.id, a.question_number, a.answer_value);
      }
      await client.query(
        withSchema(
          `INSERT INTO __SCHEMA__.mbti_answers (session_id, question_number, answer_value)
           VALUES ${values.join(", ")}`,
        ),
        params,
      );

      // Optional: persist AI consultation together with the session.
      // Best-effort: do not fail the whole request if AI payload is malformed.
      let ai_saved = false;
      let ai_id = null;
      if (optionalAi) {
        try {
          // PUT semantics: update latest row if exists; else insert new.
          const latest = await client.query(
            withSchema(
              `SELECT id
                 FROM __SCHEMA__.ai_consultations
                WHERE session_id = $1
                ORDER BY created_at DESC, id DESC
                LIMIT 1`,
            ),
            [session.id],
          );

          const sectionsJson = optionalAi.sections ? JSON.stringify(optionalAi.sections) : null;

          if (latest.rows?.[0]?.id) {
            const upd = await client.query(
              withSchema(
                `UPDATE __SCHEMA__.ai_consultations
                    SET mbti_result = $1,
                        provider = $2,
                        consultation = $3,
                        sections = $4::jsonb,
                        object_name = $5,
                        created_at = now()
                  WHERE id = $6
                  RETURNING id`,
              ),
              [
                mbti_result,
                optionalAi.provider,
                optionalAi.consultation,
                sectionsJson,
                optionalAi.object_name,
                latest.rows[0].id,
              ],
            );
            ai_saved = true;
            ai_id = upd.rows?.[0]?.id ?? latest.rows[0].id;
          } else {
            const ins = await client.query(
              withSchema(
                `INSERT INTO __SCHEMA__.ai_consultations
                  (session_id, mbti_result, provider, consultation, sections, object_name)
                 VALUES ($1, $2, $3, $4, $5::jsonb, $6)
                 RETURNING id`,
              ),
              [
                session.id,
                mbti_result,
                optionalAi.provider,
                optionalAi.consultation,
                sectionsJson,
                optionalAi.object_name,
              ],
            );
            ai_saved = true;
            ai_id = ins.rows?.[0]?.id ?? null;
          }
        } catch (err) {
          // Keep request successful (session is saved), but log details for debugging.
          console.error("[Sessions] optional AI save failed:", {
            message: err?.message || String(err),
            code: err?.code,
            detail: err?.detail,
            constraint: err?.constraint,
          });
        }
      }
      return { session, ai_saved, ai_id };
    });

    return res.status(201).json({
      session: out.session,
      answers_saved: answers.length,
      ai_consultation_saved: out.ai_saved,
      ai_consultation_id: out.ai_id,
    });
  } catch (err) {
    console.error("[Sessions] save error:", err?.message || err);
    return res.status(500).json({ error: "Loi luu ket qua MBTI" });
  }
}

/**
 * POST /api/mbti/sessions/:id/ai
 * Lưu AI consultation (từ Vercel GET) vào DB theo session_id đã có sẵn.
 *
 * Payload gợi ý (map trực tiếp từ response Vercel):
 *   {
 *     "provider": "vercel",
 *     "mbtiType": "INTJ",
 *     "consultation": "...",
 *     "objectName": "...",
 *     "sections_for_storage": { ... } // ưu tiên
 *     "sections": { ... }             // fallback
 *   }
 */
export async function postSessionAI(req, res) {
  const sessionId = Number(req.params?.id);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: "session_id khong hop le" });
  }

  const mbti_result = typeof req.body?.mbtiType === "string"
    ? req.body.mbtiType.trim().toUpperCase()
    : typeof req.body?.mbti_result === "string"
      ? req.body.mbti_result.trim().toUpperCase()
      : "";
  if (!isValidMbtiCode(mbti_result)) {
    return res.status(400).json({ error: "mbti_result khong hop le" });
  }

  const provider =
    typeof req.body?.provider === "string" && req.body.provider.trim()
      ? req.body.provider.trim()
      : typeof req.body?.sections_source === "string" && req.body.sections_source.trim()
        ? req.body.sections_source.trim()
        : "vercel";

  const consultation =
    typeof req.body?.consultation === "string" && req.body.consultation.trim()
      ? req.body.consultation
      : null;

  const object_name =
    typeof req.body?.objectName === "string" && req.body.objectName.trim()
      ? req.body.objectName.trim()
      : typeof req.body?.object_name === "string" && req.body.object_name.trim()
        ? req.body.object_name.trim()
        : null;

  const pickJsonObject = (v) => {
    if (v && typeof v === "object") return v;
    if (typeof v === "string" && v.trim()) {
      try { return JSON.parse(v); } catch { return null; }
    }
    return null;
  };

  const sections =
    pickJsonObject(req.body?.sections_for_storage) ||
    pickJsonObject(req.body?.sectionsForStorage) ||
    pickJsonObject(req.body?.sections) ||
    null;

  if (!consultation && !sections) {
    return res.status(400).json({ error: "Thieu du lieu tu van (consultation/sections)" });
  }

  try {
    // Ensure session exists before insert
    const check = await withTransaction(async (client) => {
      const session = await client.query(
        withSchema(`SELECT id FROM __SCHEMA__.mbti_sessions WHERE id = $1`),
        [sessionId],
      );
      if (!session.rows?.length) return null;

      await client.query(
        withSchema(
          `INSERT INTO __SCHEMA__.ai_consultations
            (session_id, mbti_result, provider, consultation, sections, object_name)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
        ),
        [
          sessionId,
          mbti_result,
          provider,
          consultation,
          sections ? JSON.stringify(sections) : null,
          object_name,
        ],
      );
      return { ok: true };
    });

    if (!check) return res.status(404).json({ error: "Khong tim thay session" });
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("[Sessions] save AI error:", err?.message || err);
    return res.status(500).json({ error: "Loi luu tu van AI" });
  }
}
