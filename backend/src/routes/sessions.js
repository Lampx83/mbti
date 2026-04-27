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

export async function postSession(req, res) {
  // Optional mode: save AI consultation (no session/answers creation).
  // This is designed to work with Portal allowlists that only forward POST /api/mbti/sessions.
  const mode = typeof req.body?.mode === "string" ? req.body.mode.trim() : "";
  const looksLikeAiSave =
    mode === "ai_save" ||
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
      const out = await withTransaction(async (client) => {
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

      if (!out) return res.status(404).json({ error: "Khong tim thay session" });
      return res.status(201).json({ ok: true });
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
      return session;
    });

    return res.status(201).json({ session: out, answers_saved: answers.length });
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
