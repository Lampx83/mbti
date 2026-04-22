import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as Minio from "minio";
import mammoth from "mammoth";
import OpenAI from "openai";
import pool from "./src/db.js";

dotenv.config();

const app = express();


app.use(cors());
app.use(express.json());

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

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
  if (normalized.length === 0) return null;
  return normalized;
}


const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT || "203.113.132.48";
const MINIO_PORT = parseInt(process.env.MINIO_PORT || "8008", 10);
const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY || "course2";
const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY || "course2-s3-uiauia";
const MINIO_BUCKET = process.env.MINIO_BUCKET || "syllabus";
const MINIO_USE_SSL = process.env.MINIO_USE_SSL === "true";

const minioClient = new Minio.Client({
  endPoint: MINIO_ENDPOINT,
  port: MINIO_PORT,
  useSSL: MINIO_USE_SSL,
  accessKey: MINIO_ACCESS_KEY,
  secretKey: MINIO_SECRET_KEY,
});

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || "")
  .trim()
  .replace(/\/$/, "");
const OLLAMA_MODEL = (process.env.OLLAMA_MODEL || "").trim() || "gpt-oss:20b";

function resolveAIProvider() {
  const pref = String(process.env.AI_PROVIDER || "auto").trim().toLowerCase();
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


function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function isNotFoundError(err) {
  const code = err?.code || err?.Code || err?.name || "";
  const msg = String(err?.message || "").toLowerCase();
  return (
    code === "NoSuchKey" ||
    code === "NotFound" ||
    msg.includes("not found") ||
    msg.includes("the specified key does not exist")
  );
}

function listObjects(prefix) {
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minioClient.listObjectsV2(MINIO_BUCKET, prefix, true);
    stream.on("data", (obj) => objects.push(obj));
    stream.on("error", reject);
    stream.on("end", () => resolve(objects));
  });
}

function pickPersonalityObject(objects, mbtiType) {
  const desired = mbtiType.toUpperCase();
  let looseMatch = null;
  for (const obj of objects) {
    const name = obj?.name;
    if (!name) continue;
    const fileName = name.slice(name.lastIndexOf("/") + 1);
    if (!/\.(docx|doc)$/i.test(fileName)) continue;
    const base = fileName.replace(/\.(docx|doc)$/i, "").trim();
    if (base === desired) return name;
    if (base.toUpperCase() === desired) looseMatch = looseMatch || name;
    const compact = base.replace(/[\s_-]+/g, "").toUpperCase();
    if (compact === desired) looseMatch = looseMatch || name;
  }
  return looseMatch;
}

async function fetchPersonalityDoc(mbtiType) {
  const baseName = `courses-processed/personality/${mbtiType}.docx`;
  const objectNameCandidates = Array.from(
    new Set([baseName, baseName.normalize("NFC"), baseName.normalize("NFD")]),
  );

  let lastErr = null;
  for (const objectName of objectNameCandidates) {
    try {
      const dataStream = await minioClient.getObject(MINIO_BUCKET, objectName);
      const buffer = await streamToBuffer(dataStream);
      return { objectName, buffer };
    } catch (err) {
      lastErr = err;
      if (!isNotFoundError(err)) throw err;
    }
  }

  const objects = await listObjects("courses-processed/personality/");
  const matchedName = pickPersonalityObject(objects, mbtiType);
  if (matchedName) {
    const dataStream = await minioClient.getObject(MINIO_BUCKET, matchedName);
    const buffer = await streamToBuffer(dataStream);
    return { objectName: matchedName, buffer };
  }

  throw lastErr || new Error("NoSuchKey");
}

const SECTION_DEFS = [
  { key: "ten_tinh_cach", labels: ["TÊN TÍNH CÁCH", "TEN TINH CACH"] },
  { key: "khai_niem", labels: ["KHÁI NIỆM", "KHAI NIEM"] },
  {
    key: "phan_tich_cac_chieu_tinh_cach",
    labels: [
      "PHÂN TÍCH CÁC CHIỀU TÍNH CÁCH", "PHAN TICH CAC CHIEU TINH CACH",
      "CẤU TRÚC TÍNH CÁCH", "CAU TRUC TINH CACH",
      "Ý NGHĨA CÁC CHIỀU TÍNH CÁCH", "Y NGHIA CAC CHIEU TINH CACH",
    ],
  },
  { key: "diem_manh", labels: [
    "ĐIỂM MẠNH", "DIEM MANH", "ƯU ĐIỂM", "UU DIEM",
    "ĐIỂM MẠNH NỔI BẬT", "DIEM MANH NOI BAT",
    "3. ĐIỂM MẠNH", "3 DIEM MANH",
  ] },
  { key: "diem_yeu", labels: [
    "ĐIỂM YẾU", "DIEM YEU", "HẠN CHẾ", "HAN CHE",
    "NHƯỢC ĐIỂM", "NHUOC DIEM", "ĐIỂM HẠN CHẾ", "DIEM HAN CHE",
    "4. HẠN CHẾ", "4 HAN CHE",
  ] },
  { key: "moi_truong", labels: [
    "MÔI TRƯỜNG", "MOI TRUONG",
    "MÔI TRƯỜNG LÀM VIỆC PHÙ HỢP", "MOI TRUONG LAM VIEC PHU HOP",
    "MÔI TRƯỜNG PHÙ HỢP", "MOI TRUONG PHU HOP",
    "5. MÔI TRƯỜNG", "5 MOI TRUONG",
  ] },
  {
    key: "nganh_nghe_tuong_ung",
    labels: [
      "NGÀNH, NGHỀ TƯƠNG ỨNG", "NGANH, NGHE TUONG UNG",
      "DANH MỤC NGÀNH VÀ NGHỀ NGHIỆP TƯƠNG ỨNG", "DANH MUC NGANH VA NGHE NGHIEP TUONG UNG",
    ],
  },
];

const LABEL_TO_KEY = (() => {
  const map = new Map();
  for (const def of SECTION_DEFS) {
    for (const label of def.labels) {
      map.set(normalizeHeading(label), def.key);
    }
  }
  return map;
})();

function normalizeHeading(input) {
  if (!input) return "";


  let s = input.trim();
  s = s
    .replace(/^(\d+\.)+\s+/, "")          // "1. " / "1.2. "
    .replace(/^(\d+\.)+\d+\s+/, "")       // "1.2.3 "
    .replace(/^\(\d+\)\s+/, "")            // "(1) "
    .replace(/^[IVXLCDM]+\.\s+/i, "")      // "I. " "II. " — requires trailing dot+space
    .replace(/^\d+[)\]]\s+/, "")           // "1) "
    .replace(/^[-\u2013\u2022]\s+/, "");   // "- " "• "

  // Replace đ/Đ explicitly — NFD does not decompose these
  s = s.replace(/[\u0111]/g, "d").replace(/[\u0110]/g, "D");

  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function getRemainderAfterHeading(line, labelNorm) {
  const separatorMatch = line.match(/[:\-–—]/u);
  if (separatorMatch) {
    const remainder = line.split(/[:\-–—]/).slice(1).join(":").trim();
    if (remainder) return remainder;
  }

  const rawTokens = line.trim().split(/\s+/);
  const labelTokens = labelNorm.split(" ");
  if (!rawTokens.length || !labelTokens.length) return "";

  const filtered = rawTokens
    .map((token, index) => ({ token, index, norm: normalizeHeading(token) }))
    .filter((item) => item.norm);

  for (let i = 0; i <= filtered.length - labelTokens.length; i += 1) {
    let match = true;
    for (let j = 0; j < labelTokens.length; j += 1) {
      if (filtered[i + j].norm !== labelTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      const lastIndex = filtered[i + labelTokens.length - 1].index;
      return rawTokens.slice(lastIndex + 1).join(" ").trim();
    }
  }

  return "";
}

function extractSectionsByHeadings(text) {
  const sections = {};
  let currentKey = null;
  let buffer = [];
  const lines = text.replace(/\r/g, "").split("\n");

  const flush = () => {
    if (!currentKey) return;
    const content = buffer.join("\n").trim();
    if (content) sections[currentKey] = content;
    buffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentKey) buffer.push("");
      continue;
    }
    const normalized = normalizeHeading(line);
    let matchedKey = null;
    let matchedLabel = null;
    for (const [labelNorm, key] of LABEL_TO_KEY.entries()) {
      if (normalized === labelNorm || normalized.startsWith(`${labelNorm} `)) {
        matchedKey = key;
        matchedLabel = labelNorm;
        break;
      }
    }

    if (matchedKey) {
      flush();
      currentKey = matchedKey;
      const remainder = getRemainderAfterHeading(rawLine, matchedLabel);
      if (remainder) buffer.push(remainder);
      continue;
    }

    if (currentKey) buffer.push(rawLine);
  }

  flush();
  return sections;
}

/**
 * Strip leading bullets/numbering from a single line.
 * Removes patterns like: 1. / 1) / (1) / - / • / 6.1.2.3
 */
function stripLeadingNumber(line) {
  return line
    .replace(/^\s*(\d+\.)+\d*\s+/g, "")
    .replace(/^\s*\d+[\.)\]\s]+/g, "")
    .replace(/^\s*\(\d+\)\s+/g, "")
    .replace(/^\s*[IVXLCDM]+\.\s+/gi, "")
    .replace(/^\s*[-–•]\s+/g, "");
}

/**
 * Clean generic section text: remove leading numbers/bullets from every line,
 * collapse multiple blank lines, trim.
 */
function cleanSectionText(text) {
  if (!text) return text;
  return text
    .split("\n")
    .map(stripLeadingNumber)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripLeadingTokensByNorm(text, normTokens) {
  const raw = String(text || "").trim();
  if (!raw) return raw;

  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length < normTokens.length) return raw;

  for (let i = 0; i < normTokens.length; i += 1) {
    if (normalizeHeading(tokens[i]) !== normTokens[i]) return raw;
  }

  return tokens.slice(normTokens.length).join(" ").trim();
}

function cleanBulletListText(text, mbtiType) {
  if (!text) return text;

  const rawLines = String(text)
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  const items = [];
  for (const rawLine of rawLines) {
    const stripped = stripLeadingNumber(rawLine).trim();
    if (!stripped) continue;

    const isNewItem = stripped !== rawLine;
    if (!items.length) {
      items.push(stripped);
      continue;
    }

    if (isNewItem) {
      items.push(stripped);
      continue;
    }

    // likely a wrapped continuation line
    items[items.length - 1] = `${items[items.length - 1]} ${stripped}`.trim();
  }

  const mbti = String(mbtiType || "").trim().toUpperCase();
  const cleanedItems = items
    .map((item) => {
      let s = String(item || "").replace(/\s+/g, " ").trim();
      if (!s) return "";

      // Drop stray heading fragments sometimes returned by LLMs
      s = stripLeadingTokensByNorm(s, ["MOI", "TRUONG", "LAM", "VIEC", "PHU", "HOP"]);
      s = stripLeadingTokensByNorm(s, ["LAM", "VIEC", "PHU", "HOP"]);

      // Sometimes the model repeats MBTI code at the start of a bullet
      if (mbti) {
        const tokens = s.split(/\s+/);
        if (normalizeHeading(tokens[0]) === mbti) {
          s = tokens.slice(1).join(" ").trim();
        }
      }

      // Viết hoa chữ cái đầu mỗi ý
      if (s.length > 0) {
        s = s.charAt(0).toUpperCase() + s.slice(1);
      }

      return s;
    })
    .filter((item) => {
      const norm = normalizeHeading(item);
      return norm && norm !== "LAM VIEC PHU HOP" && norm !== "MOI TRUONG LAM VIEC PHU HOP";
    });

  return cleanedItems.join("\n").trim();
}

function cleanKhaiNiemText(text) {
  let s = cleanSectionText(text);
  if (!s) return s;

  const head = s.slice(0, 140);
  const dimHint =
    /(Extraversion|Introversion|Sensing|Intuition|Thinking|Feeling|Judging|Perceiving|I\/E|E\/I|S\/N|N\/S|T\/F|F\/T|J\/P|P\/J)/i;

  if (dimHint.test(head)) {
    const closeParenIdx = head.indexOf(")");
    if (closeParenIdx !== -1) {
      s = s.slice(closeParenIdx + 1).trim();
    } else {
      // handle cases like: "Sensing : Thinking : Judging) ..." (missing opening parenthesis)
      s = s.replace(/^[A-Za-z\s\/:,-]{0,80}\)\s*/u, "");
      // or "Extraversion / Sensing / Thinking / Judging: ..." (no parens)
      s = s.replace(/^[A-Za-z\s\/,-]{0,80}:\s+/u, "");
    }
  }

  s = s.replace(/^\)\s*/u, "").trim();

  // Strip MBTI type code lặp đầu khai_niem: "INFJ – INFJ là..." -> "Là..."
  // hoặc solo prefix "INFJ – " (frontend tự thêm prefix riêng)
  s = s.replace(/^([A-Z]{4})\s*[-–—]\s*\1\b\s*/u, '').trim();
  s = s.replace(/^[A-Z]{4}\s*[-–—]\s*/u, '').trim();

  return s;
}

/**
 * Parse the raw nganh_nghe_tuong_ung block into "Tên ngành: Nghề1, Nghề2" format.
 * Group headers (Lĩnh vực / Nhóm ngành) are preserved as section titles.
 */
function cleanNganhNghe(text) {
  if (!text) return text;

  const ngheHeaderRe = /Ngh[eề]\s+nghi[eệ]p\s+t[uư][oơ]ng\s+[uứ]ng\s*[:\-]?\s*/i;
  const codeRe = /\(([\d][\w_.]*(?:_[\w.]+)*)\)/;

  // Use raw Vietnamese text check instead of normalizeHeading (which strips "L" as Roman numeral)
  const isGroupHeader = (line) => {
    const lower = line
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .trim();
    return (
      lower.startsWith("nhom nganh") ||
      lower.startsWith("linh vuc") ||
      lower.startsWith("khoi nganh") ||
      lower.startsWith("nhom linh vuc")
    );
  };

  // Giữ nguyên mã ngành — ví dụ: "Quản trị kinh doanh (7340101)"
  const keepCode = (line) => line.trim();

  const rawLines = text
    .split("\n")
    .map(stripLeadingNumber)
    .map((l) => l.trim())
    .filter(Boolean);


  const lines = [];
  let prevLineIsJobs = false; // true when previous line was jobs content

  for (const line of rawLines) {
    const isNewMajor = codeRe.test(line);
    const isNghe = ngheHeaderRe.test(line);
    const isGroup = isGroupHeader(line);

    if (prevLineIsJobs && !isNewMajor && !isNghe && !isGroup) {
      // Continuation of jobs from previous line — merge
      lines[lines.length - 1] = lines[lines.length - 1].trimEnd() + " " + line;
      // prevLineIsJobs stays true
    } else {
      lines.push(line);
      prevLineIsJobs = isNghe; // only jobs lines start with "Nghề nghiệp tương ứng"
    }
  }

  // Step 2: Parse into structured items
  const items = [];
  let currentMajor = null;
  let currentJobs = [];

  const flushMajor = () => {
    if (currentMajor !== null) {
      // Only emit if there are jobs — otherwise it's a stray header/title line
      if (currentJobs.length > 0) {
        const jobStr = currentJobs.join(", ");
        items.push({ type: "item", title: keepCode(currentMajor), jobs: jobStr });
      }
      currentMajor = null;
      currentJobs = [];
    }
  };

  for (const line of lines) {
    if (!line.trim()) continue;

    if (isGroupHeader(line)) {
      flushMajor();
      items.push({ type: "group", title: line });
      continue;
    }

    const ngheMatch = line.match(ngheHeaderRe);
    if (ngheMatch) {
      const splitIdx = line.search(ngheHeaderRe);
      const majorPart = line.slice(0, splitIdx).trim();
      const jobsPart = line.slice(splitIdx + ngheMatch[0].length).trim();
      if (majorPart) {
        flushMajor();
        currentMajor = majorPart;
      }
      if (jobsPart) {
        jobsPart.split(/,/).map((j) => j.trim()).filter(Boolean).forEach((j) => currentJobs.push(j));
      }
      continue;
    }

    const hasCode = codeRe.test(line);
    if (hasCode) {
      flushMajor();
      currentMajor = line;
      continue;
    }

    // Plain continuation: append to current jobs
    if (currentMajor !== null) {
      line.split(/,/).map((j) => j.trim()).filter(Boolean).forEach((j) => currentJobs.push(j));
    } else {
      flushMajor();
      currentMajor = line;
    }
  }
  flushMajor();

  // Step 3: Render to "Tên ngành: Nghề1, Nghề2" lines
  const output = [];
  for (const item of items) {
    if (item.type === "group") {
      output.push(`\n${item.title}`);
    } else {
      const line = item.jobs ? `${item.title}: ${item.jobs}` : item.title;
      output.push(line);
    }
  }

  return output.join("\n").trim();
}

function normalizeSections(sections, mbtiType) {
  if (!sections || typeof sections !== "object") return null;
  const normalized = {};
  for (const def of SECTION_DEFS) {
    const value = sections[def.key];
    if (typeof value === "string" && value.trim()) {
      if (def.key === "nganh_nghe_tuong_ung") {
        const cleaned = cleanNganhNghe(value);
        if (cleaned) normalized[def.key] = cleaned;
      } else if (def.key === "khai_niem") {
        const cleaned = cleanKhaiNiemText(value);
        if (cleaned) normalized[def.key] = cleaned;
      } else if (def.key === "diem_manh" || def.key === "diem_yeu" || def.key === "moi_truong") {
        const cleaned = cleanBulletListText(value, mbtiType) || cleanSectionText(value);
        if (cleaned) normalized[def.key] = cleaned;
      } else {
        const cleaned = cleanSectionText(value);
        if (cleaned) normalized[def.key] = cleaned;
      }
    }
  }
  return Object.keys(normalized).length ? normalized : null;
}

async function extractSectionsWithOpenAI(text, mbtiType) {
  if (!openaiClient) return null;
  try {
    const response = await openaiClient.responses.create({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content:
            "Bạn là trợ lý trích xuất và định dạng thông tin MBTI. Chỉ trả về JSON hợp lệ theo schema được yêu cầu. Nếu không tìm thấy mục nào, để chuỗi rỗng.",
        },
        {
          role: "user",
          content:
            `Hãy trích xuất và định dạng các mục sau từ tài liệu về MBTI ${mbtiType}. Tuân thủ nghiêm ngặt các yêu cầu định dạng bên dưới.\n\n` +

            "## YÊU CẦU ĐỊNH DẠNG TỪNG MỤC\n\n" +

            `**ten_tinh_cach**: Chỉ lấy đúng mã loại tính cách (ví dụ: "${mbtiType}"). Không lấy tên mô tả, không lấy số thứ tự, không lấy gì khác.\n\n` +

            "**khai_niem**: Lấy đúng phần khái niệm/mô tả tổng quan về tính cách này. Bỏ tiêu đề mục, bỏ số thứ tự đầu dòng nếu có.\n\n" +

            "**phan_tich_cac_chieu_tinh_cach**: Lấy phần phân tích các chiều/cấu trúc tính cách. " +
            "Bỏ hoàn toàn các tiêu đề mục và số thứ tự đầu dòng (ví dụ: '1.', '2.', 'I.', 'II.' ...). " +
            "Mỗi chiều tính cách trình bày trên một dòng, BẮT BUỘC bắt đầu bằng dấu '- ' (gạch ngang cách). " +
            "Ví dụ: '- E (Hướng ngoại): mô tả...'\n\n" +

            "**diem_manh**: Lấy phần điểm mạnh (là mục số 3. trong tài liệu). " +
            "Bỏ tiêu đề mục và tất cả số thứ tự đầu dòng. " +
            "Mỗi điểm mạnh trình bày trên một dòng, BẮT BUỘC bắt đầu bằng dấu '- ' (gạch ngang cách). Viết hoa chữ cái đầu tiên của mỗi ý.\n\n" +

            "**diem_yeu**: Lấy phần hạn chế (là mục số 4. trong tài liệu). " +
            "Bỏ tiêu đề mục và tất cả số thứ tự đầu dòng. " +
            "Mỗi hạn chế trình bày trên một dòng, BẮT BUỘC bắt đầu bằng dấu '- ' (gạch ngang cách). Viết hoa chữ cái đầu tiên của mỗi ý.\n\n" +

            "**moi_truong**: Lấy phần môi trường làm việc phù hợp (thường là mục số 5 trong tài liệu). " +
            "Bỏ tiêu đề mục và tất cả số thứ tự đầu dòng. " +
            "Mỗi ý trình bày trên một dòng, BẮT BUỘC bắt đầu bằng dấu '- ' (gạch ngang cách). Viết hoa chữ cái đầu tiên của mỗi ý.\n\n" +

            "**nganh_nghe_tuong_ung**: Lấy toàn bộ danh mục ngành nghề trong tài liệu theo cấu trúc 3 tầng.\n" +
            "TẦNG 1 – Lĩnh vực: bắt đầu bằng '## Lĩnh vực: Tên lĩnh vực'\n" +
            "TẦNG 2 – Ngành: bắt đầu bằng '### Ngành: Tên ngành' (bỏ hết mã số trong ngoặc)\n" +
            "TẦNG 3 – Nghề nghiệp: mỗi nghề trên 1 dòng bắt đầu bằng '- '\n" +
            "Ví dụ:\n" +
            "## Lĩnh vực: Kinh doanh và quản lý\n" +
            "### Ngành: Quản trị kinh doanh\n" +
            "- Trưởng phòng kinh doanh\n" +
            "- Key Account Manager\n" +
            "KHÔNG ghi mã ngành (7340101...). KHÔNG dùng 'Nghề nghiệp tương ứng:' riêng dòng.\n\n" +

            "## TÀI LIỆU\n" +
            text,
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

    const outputText = response.output_text || "";
    const parsed = JSON.parse(outputText);
    return normalizeSections(parsed, mbtiType);
  } catch (err) {
    console.error("[AI Extract] Loi:", err.message);
    return null;
  }
}

async function extractSectionsWithOllama(text, mbtiType) {
  if (!OLLAMA_BASE_URL) return null;
  if (typeof fetch !== "function") {
    throw new Error("Node.js fetch khong san sang. Can Node 18+.");
  }

  const systemPrompt =
    "Ban la bo may trich xuat du lieu. NHIEM VU: tra ve DUY NHAT 1 JSON object hop le (khong markdown, khong giai thich). " +
    "JSON phai co dung 7 khoa sau (snake_case), moi gia tri la string: " +
    "ten_tinh_cach, khai_niem, phan_tich_cac_chieu_tinh_cach, diem_manh, diem_yeu, moi_truong, nganh_nghe_tuong_ung. " +
    "Neu khong tim thay muc nao, tra ve chuoi rong. Khong duoc them khoa khac.\n\n" +
    "YEU CAU DINH DANG:\n" +
    "- ten_tinh_cach: chi tra ve dung ma MBTI (vi du: \"ESTJ\").\n" +
    "- khai_niem: 1 doan van tieng Viet mo ta tong quan. KHONG duoc bat dau bang danh sach (Extraversion/Sensing/Thinking/Judging) hay ky tu ngoac cua danh sach do.\n" +
    "- phan_tich_cac_chieu_tinh_cach: moi chieu tren 1 dong, bat dau bang '- '.\n" +
    "- diem_manh, diem_yeu, moi_truong: moi y tren 1 dong, bat dau bang '- '. KHONG duoc chen tieu de nhu 'Lam viec phu hop'.\n" +
    "- nganh_nghe_tuong_ung: cu phap 3 tang: '## Linh vuc: Ten' -> '### Nganh: Ten' -> '- Nghe nghiep'. Bo ma so nganh. Moi nghe tren 1 dong bat dau bang '- '.";

  const userPrompt =
    `Loai MBTI: ${mbtiType}\n` +
    "Hay trich xuat cac muc tu van tu van ban duoi day va tra ve JSON.\n\n" +
    "VAN BAN:\n" +
    text;

  const chatUrl = `${OLLAMA_BASE_URL}/api/chat`;
  const generateUrl = `${OLLAMA_BASE_URL}/api/generate`;

  const tryChat = async () => {
    const resp = await fetch(chatUrl, {
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
      const err = new Error(`Ollama /api/chat loi ${resp.status}: ${body.slice(0, 200)}`);
      err.status = resp.status;
      throw err;
    }

    const data = await resp.json();
    const content = data?.message?.content ?? "";
    return content;
  };

  const tryGenerate = async () => {
    const resp = await fetch(generateUrl, {
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
      throw new Error(`Ollama /api/generate loi ${resp.status}: ${body.slice(0, 200)}`);
    }

    const data = await resp.json();
    const content = data?.response ?? "";
    return content;
  };

  try {
    let content = "";
    try {
      content = await tryChat();
    } catch (err) {
      const status = err?.status;
      if (status === 404 || status === 405) {
        content = await tryGenerate();
      } else {
        // fallback if /api/chat blocked by proxy but still have /api/generate
        try {
          content = await tryGenerate();
        } catch (fallbackErr) {
          throw err;
        }
      }
    }

    const jsonCandidate = extractJsonCandidate(content);
    const parsed = JSON.parse(jsonCandidate);
    return normalizeSections(parsed, mbtiType);
  } catch (err) {
    console.error("[Ollama Extract] Loi:", err.message);
    return null;
  }
}

async function extractSectionsWithAI(text, mbtiType, provider) {
  if (provider === "openai") return extractSectionsWithOpenAI(text, mbtiType);
  if (provider === "ollama") return extractSectionsWithOllama(text, mbtiType);
  return null;
}


app.get("/api/ai-consultation", async (req, res) => {
  try {
    const mbtiType = (req.query.mbtiType || "").toUpperCase();
    if (!MBTI_TYPES.includes(mbtiType)) {
      return res.status(400).json({ error: "mbtiType khong hop le. Can mot trong 16 loai MBTI." });
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

    const text = personalityData.trim();
    if (!text) {
      return res.status(500).json({ error: "Du lieu DOCX trong hoac khong trich xuat duoc van ban." });
    }

    const heuristicSections = normalizeSections(extractSectionsByHeadings(text), mbtiType);
    const useAIParam = String(req.query.useAI || "").toLowerCase();
    const provider = resolveAIProvider();
    const useAI = provider !== "none" && useAIParam !== "false";
    const aiSections = useAI ? await extractSectionsWithAI(text, mbtiType, provider) : null;
    const sections = aiSections || heuristicSections;

    return res.json({
      mbtiType,
      consultation: text,
      sections,
      sections_source: aiSections ? `ai:${provider}` : heuristicSections ? "heuristic" : "none",
      objectName: objectNameUsed,
    });
  } catch (err) {
    console.error("[Consultation] Loi:", err.message);
    return res.status(500).json({
      error: "Loi khi tai tu van tu tai lieu.",
      detail: err.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// MBTI logging to PostgreSQL
// Tables:
//   - mbti_types
//   - mbti_sessions
//   - mbti_answers
// ─────────────────────────────────────────────────────────────────────────────

app.post("/api/mbti/sessions", async (req, res) => {
  const user_name = typeof req.body?.user_name === "string" ? req.body.user_name.trim() : "";
  const user_profile_id = typeof req.body?.user_profile_id === "string" ? req.body.user_profile_id.trim() : "";
  const mbti_result_raw = req.body?.mbti_result;
  const mbti_result = typeof mbti_result_raw === "string" ? mbti_result_raw.trim().toUpperCase() : "";
  const answers = normalizeAnswersInput(req.body?.answers);

  if (!user_name) return res.status(400).json({ error: "user_name bat buoc" });
  if (!user_profile_id) return res.status(400).json({ error: "user_profile_id bat buoc" });
  if (!isValidMbtiCode(mbti_result)) return res.status(400).json({ error: "mbti_result khong hop le" });
  if (!answers) return res.status(400).json({ error: "answers khong hop le" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const sessionIns = await client.query(
      `INSERT INTO mbti_sessions (user_name, user_profile_id, mbti_result)
       VALUES ($1, $2, $3)
       RETURNING id, user_name, user_profile_id, mbti_result, created_at`,
      [user_name, user_profile_id, mbti_result],
    );
    const session = sessionIns.rows[0];

    // Batch insert answers
    const values = [];
    const params = [];
    let p = 1;
    for (const a of answers) {
      // (session_id, question_number, answer_value)
      values.push(`($${p++}, $${p++}, $${p++})`);
      params.push(session.id, a.question_number, a.answer_value);
    }

    await client.query(
      `INSERT INTO mbti_answers (session_id, question_number, answer_value)
       VALUES ${values.join(", ")}`,
      params,
    );

    await client.query("COMMIT");
    return res.status(201).json({ session, answers_saved: answers.length });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("[MBTI] save session error:", err?.message || err);
    return res.status(500).json({ error: "Loi luu ket qua MBTI" });
  } finally {
    client.release();
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok", service: "MBTI-NEU API" }));

export default app;