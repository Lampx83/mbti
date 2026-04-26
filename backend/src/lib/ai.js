/**
 * Bóc tách section bằng OpenAI hoặc Ollama.
 * resolveAIProvider() trả về "openai" | "ollama" | "none".
 */
import OpenAI from "openai";
import { AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OLLAMA_BASE_URL, OLLAMA_MODEL } from "../env.js";
import { normalizeSections } from "./sections.js";

const openaiClient = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

export function resolveAIProvider() {
  const pref = AI_PROVIDER;
  if (pref === "none") return "none";
  if (pref === "ollama") return OLLAMA_BASE_URL ? "ollama" : "none";
  if (pref === "openai") return openaiClient ? "openai" : "none";
  if (pref === "auto") {
    if (OLLAMA_BASE_URL) return "ollama";
    if (openaiClient) return "openai";
    return "none";
  }
  return "none";
}

function extractJsonCandidate(text) {
  const raw = String(text || "").trim();
  if (!raw) return raw;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return raw.slice(firstBrace, lastBrace + 1).trim();
  }
  return raw;
}

const FORMAT_PROMPT_VI =
  "## YÊU CẦU ĐỊNH DẠNG TỪNG MỤC\n\n" +
  "**ten_tinh_cach**: Chỉ lấy đúng mã loại tính cách (vd ESTJ).\n\n" +
  "**khai_niem**: 1 đoạn văn tiếng Việt mô tả tổng quan. KHÔNG bắt đầu bằng danh sách (Extraversion/Sensing/...).\n\n" +
  "**phan_tich_cac_chieu_tinh_cach**: Mỗi chiều 1 dòng, BẮT BUỘC bắt đầu bằng '- '. Ví dụ: '- E (Hướng ngoại): mô tả...'.\n\n" +
  "**diem_manh**, **diem_yeu**, **moi_truong**: Mỗi ý 1 dòng, BẮT BUỘC bắt đầu bằng '- '. Viết hoa chữ cái đầu mỗi ý. Bỏ tiêu đề mục và số thứ tự.\n\n" +
  "**nganh_nghe_tuong_ung**: Cú pháp 3 tầng:\n" +
  "## Lĩnh vực: <Tên>\n### Ngành: <Tên> (bỏ mã trong ngoặc)\n- <Nghề>\n" +
  "TUYỆT ĐỐI KHÔNG dùng 'Nghề nghiệp tương ứng:' trên dòng riêng. Không giữ mã ngành.";

async function extractSectionsWithOpenAI(text, mbtiType) {
  if (!openaiClient) return null;
  try {
    const response = await openaiClient.responses.create({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "Bạn là trợ lý trích xuất MBTI. Chỉ trả về JSON hợp lệ theo schema; nếu không tìm thấy mục nào, để chuỗi rỗng.",
        },
        {
          role: "user",
          content:
            `Trích xuất các mục từ tài liệu MBTI ${mbtiType}. ${FORMAT_PROMPT_VI}\n\n## TÀI LIỆU\n${text}`,
        },
      ],
      format: {
        type: "json_schema",
        name: "mbti_extract",
        strict: true,
        schema: {
          type: "object",
          properties: {
            ten_tinh_cach: { type: "string" },
            khai_niem: { type: "string" },
            phan_tich_cac_chieu_tinh_cach: { type: "string" },
            diem_manh: { type: "string" },
            diem_yeu: { type: "string" },
            moi_truong: { type: "string" },
            nganh_nghe_tuong_ung: { type: "string" },
          },
          required: [
            "ten_tinh_cach",
            "khai_niem",
            "phan_tich_cac_chieu_tinh_cach",
            "diem_manh",
            "diem_yeu",
            "moi_truong",
            "nganh_nghe_tuong_ung",
          ],
          additionalProperties: false,
        },
      },
    });
    const parsed = JSON.parse(response.output_text || "{}");
    return normalizeSections(parsed, mbtiType);
  } catch (err) {
    console.error("[AI OpenAI] Loi:", err.message);
    return null;
  }
}

async function extractSectionsWithOllama(text, mbtiType) {
  if (!OLLAMA_BASE_URL) return null;
  if (typeof fetch !== "function") throw new Error("Node 18+ required for fetch");

  const systemPrompt =
    "Bạn là bộ máy trích xuất dữ liệu. Trả về DUY NHẤT 1 JSON object hợp lệ (không markdown, không giải thích) " +
    "với 7 khoá: ten_tinh_cach, khai_niem, phan_tich_cac_chieu_tinh_cach, diem_manh, diem_yeu, moi_truong, nganh_nghe_tuong_ung. " +
    "Tất cả là string. " +
    FORMAT_PROMPT_VI;
  const userPrompt = `Loại MBTI: ${mbtiType}\n\nVĂN BẢN:\n${text}`;

  const tryChat = async () => {
    const resp = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        options: { temperature: 0 },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      const err = new Error(`Ollama /api/chat ${resp.status}: ${body.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }
    const data = await resp.json();
    return data?.message?.content ?? "";
  };

  const tryGenerate = async () => {
    const resp = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        options: { temperature: 0 },
      }),
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Ollama /api/generate ${resp.status}: ${body.slice(0, 200)}`);
    }
    const data = await resp.json();
    return data?.response ?? "";
  };

  try {
    let content = "";
    try {
      content = await tryChat();
    } catch (err) {
      if (err?.status === 404 || err?.status === 405) content = await tryGenerate();
      else {
        try { content = await tryGenerate(); } catch { throw err; }
      }
    }
    const parsed = JSON.parse(extractJsonCandidate(content));
    return normalizeSections(parsed, mbtiType);
  } catch (err) {
    console.error("[AI Ollama] Loi:", err.message);
    return null;
  }
}

export async function extractSectionsWithAI(text, mbtiType, provider) {
  if (provider === "openai") return extractSectionsWithOpenAI(text, mbtiType);
  if (provider === "ollama") return extractSectionsWithOllama(text, mbtiType);
  return null;
}
