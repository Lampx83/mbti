/**
 * Admin endpoints cho MBTI:
 *  - POST /api/admin/login           — kiểm tra credential, không cần token (Basic Auth dùng tiếp)
 *  - GET  /api/admin/stats           — thống kê số session, phân bố 16 nhóm
 *  - GET  /api/admin/sessions        — danh sách session (pagination)
 *  - GET  /api/admin/sessions/:id    — chi tiết 1 session + answers + ai_consultation
 *  - GET  /api/admin/export          — xuất CSV toàn bộ sessions + answers + ai
 */
import { query } from "../db.js";
import { checkAdminCredentials } from "../lib/admin-auth.js";

export function postAdminLogin(req, res) {
  const username = typeof req.body?.username === "string" ? req.body.username : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!checkAdminCredentials(username, password)) {
    return res.status(401).json({ error: "Sai tài khoản hoặc mật khẩu" });
  }
  const token = Buffer.from(`${username}:${password}`, "utf-8").toString("base64");
  res.json({ ok: true, token });
}

export async function getAdminStats(_req, res) {
  try {
    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM __SCHEMA__.mbti_sessions`);
    const distQ = await query(
      `SELECT mbti_result, COUNT(*)::int AS n
         FROM __SCHEMA__.mbti_sessions
        GROUP BY mbti_result
        ORDER BY n DESC`,
    );
    const recentQ = await query(
      `SELECT id, user_name, user_profile_id, mbti_result, created_at
         FROM __SCHEMA__.mbti_sessions
        ORDER BY created_at DESC
        LIMIT 10`,
    );
    res.json({
      total: totalQ.rows[0]?.n ?? 0,
      distribution: distQ.rows,
      recent: recentQ.rows,
    });
  } catch (err) {
    console.error("[Admin] stats error:", err?.message || err);
    res.status(500).json({ error: "Loi tai thong ke" });
  }
}

export async function getAdminSessions(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  try {
    const rowsQ = await query(
      `SELECT s.id, s.user_name, s.user_profile_id, s.mbti_result, s.created_at,
              c.provider AS ai_provider,
              c.created_at AS ai_created_at
         FROM __SCHEMA__.mbti_sessions s
         LEFT JOIN LATERAL (
           SELECT provider, created_at
             FROM __SCHEMA__.ai_consultations
            WHERE session_id = s.id
            ORDER BY created_at DESC
            LIMIT 1
         ) c ON true
        ORDER BY s.created_at DESC
        LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    const totalQ = await query(`SELECT COUNT(*)::int AS n FROM __SCHEMA__.mbti_sessions`);
    res.json({ rows: rowsQ.rows, total: totalQ.rows[0]?.n ?? 0, limit, offset });
  } catch (err) {
    console.error("[Admin] sessions error:", err?.message || err);
    res.status(500).json({ error: "Loi tai danh sach session" });
  }
}

export async function getAdminSessionDetail(req, res) {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "id khong hop le" });
  try {
    const sessionQ = await query(
      `SELECT id, user_name, user_profile_id, mbti_result, created_at
         FROM __SCHEMA__.mbti_sessions
        WHERE id = $1`,
      [id],
    );
    if (!sessionQ.rows[0]) return res.status(404).json({ error: "Khong tim thay session" });
    const answersQ = await query(
      `SELECT question_number, answer_value
         FROM __SCHEMA__.mbti_answers
        WHERE session_id = $1
        ORDER BY question_number ASC`,
      [id],
    );
    const aiQ = await query(
      `SELECT provider, consultation, sections, object_name, created_at
         FROM __SCHEMA__.ai_consultations
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [id],
    );
    res.json({
      session: sessionQ.rows[0],
      answers: answersQ.rows,
      ai_consultation: aiQ.rows[0] || null,
    });
  } catch (err) {
    console.error("[Admin] session detail error:", err?.message || err);
    res.status(500).json({ error: "Loi tai chi tiet session" });
  }
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function getAdminExport(_req, res) {
  try {
    const rowsQ = await query(
      `SELECT s.id, s.user_name, s.user_profile_id, s.mbti_result, s.created_at,
              a.question_number, a.answer_value,
              c.provider AS ai_provider, c.consultation, c.sections, c.object_name
         FROM __SCHEMA__.mbti_sessions s
         LEFT JOIN __SCHEMA__.mbti_answers a ON a.session_id = s.id
         LEFT JOIN LATERAL (
           SELECT provider, consultation, sections, object_name
             FROM __SCHEMA__.ai_consultations
            WHERE session_id = s.id
            ORDER BY created_at DESC
            LIMIT 1
         ) c ON true
        ORDER BY s.created_at DESC, s.id ASC, a.question_number ASC`,
    );

    const header = [
      "session_id",
      "user_name",
      "user_profile_id",
      "mbti_result",
      "created_at",
      "question_number",
      "answer_value",
      "ai_provider",
      "ai_object_name",
      "ai_sections",
      "ai_consultation",
    ];
    const lines = ["﻿" + header.join(",")];
    for (const r of rowsQ.rows) {
      lines.push(
        [
          r.id,
          csvEscape(r.user_name),
          csvEscape(r.user_profile_id),
          r.mbti_result,
          r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
          r.question_number ?? "",
          r.answer_value ?? "",
          csvEscape(r.ai_provider),
          csvEscape(r.object_name),
          csvEscape(r.sections ? JSON.stringify(r.sections) : ""),
          csvEscape(r.consultation),
        ].join(","),
      );
    }
    const csv = lines.join("\r\n");
    const filename = `mbti-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("[Admin] export error:", err?.message || err);
    res.status(500).json({ error: "Loi xuat du lieu" });
  }
}
