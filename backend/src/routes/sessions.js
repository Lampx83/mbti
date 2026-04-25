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
