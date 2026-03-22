/**
 * Express app (API only) for MBTI-Career-NEU
 * This file is used by both local server and Vercel serverless.
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import * as Minio from "minio";
import mammoth from "mammoth";
import OpenAI from "openai";

dotenv.config();

const app = express();

/* ------------------------------- Middleware ------------------------------ */
app.use(cors());
app.use(express.json());

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
];

/* ------------------------------ MinIO Client ----------------------------- */
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

/** Read stream to Buffer (for .docx) */
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
  { key: "diem_manh", labels: ["ĐIỂM MẠNH", "DIEM MANH", "UU DIEM"] },
  { key: "diem_yeu", labels: ["ĐIỂM YẾU", "DIEM YEU", "HẠN CHẾ", "HAN CHE", "NHUOC DIEM"] },
  { key: "moi_truong", labels: ["MÔI TRƯỜNG", "MOI TRUONG", "MOI TRUONG LAM VIEC PHU HOP"] },
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
  return input
    .replace(/^[\s\dIVXLCDM\.\)\-]+/gi, "")
    .replace(/^[\s\d]+(\.[\s\d]+)*\.\s*/g, "")
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

  // Step 1: Pre-process — join wrapped continuation lines.
  // After stripping leading numbers, a continuation line is one that:
  // - does NOT contain a major code like (7340101)
  // - does NOT start with "Nghề nghiệp tương ứng"
  // - is NOT a group header
  // AND the previous line is a "jobs" line (we track state)
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

function normalizeSections(sections) {
  if (!sections || typeof sections !== "object") return null;
  const normalized = {};
  for (const def of SECTION_DEFS) {
    const value = sections[def.key];
    if (typeof value === "string" && value.trim()) {
      if (def.key === "nganh_nghe_tuong_ung") {
        const cleaned = cleanNganhNghe(value);
        if (cleaned) normalized[def.key] = cleaned;
      } else {
        normalized[def.key] = cleanSectionText(value);
      }
    }
  }
  return Object.keys(normalized).length ? normalized : null;
}

async function extractSectionsWithAI(text, mbtiType) {
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
            "Mỗi điểm mạnh trình bày trên một dòng, BẮT BUỘC bắt đầu bằng dấu '- ' (gạch ngang cách).\n\n" +

            "**diem_yeu**: Lấy phần hạn chế (là mục số 4. trong tài liệu). " +
            "Bỏ tiêu đề mục và tất cả số thứ tự đầu dòng. " +
            "Mỗi hạn chế trình bày trên một dòng, BẮT BUỘC bắt đầu bằng dấu '- ' (gạch ngang cách).\n\n" +

            "**moi_truong**: Lấy phần môi trường làm việc phù hợp (thường là mục số 5 trong tài liệu). " +
            "Bỏ tiêu đề mục và tất cả số thứ tự đầu dòng. " +
            "Mỗi ý trình bày trên một dòng, BẮT BUỘC bắt đầu bằng dấu '- ' (gạch ngang cách).\n\n" +

            "**nganh_nghe_tuong_ung**: Lấy toàn bộ danh mục ngành nghề trong tài liệu. " +
            "Nếu tài liệu có tiêu đề nhóm ngành/lĩnh vực (ví dụ: 'Lĩnh vực Kinh doanh', 'Nhóm ngành Kinh tế'), GIỮ nguyên dòng đó như tiêu đề nhóm. " +
            "Với mỗi ngành, xuất ĐÚNG 1 dòng theo format: Tên ngành: Nghề1, Nghề2, Nghề3\n" +
            "Ví dụ: Quản trị kinh doanh: Trưởng phòng kinh doanh, Key Account Manager, Chuyên viên marketing\n" +
            "TUYỆT ĐỐI KHÔNG dùng 'Nghề nghiệp tương ứng:' trên dòng riêng. " +
            "TUYỆT ĐỐI KHÔNG tách thành 2 danh sách riêng. " +
            "Không để số thứ tự (6.1, 6.2.1...) và không giữ mã ngành trong ngoặc.\n\n" +

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
    return normalizeSections(parsed);
  } catch (err) {
    console.error("[AI Extract] Loi:", err.message);
    return null;
  }
}

/**
 * GET /api/ai-consultation?mbtiType=INTJ
 * Fetches MBTI personality document from MinIO and returns extracted text.
 */
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

    const heuristicSections = normalizeSections(extractSectionsByHeadings(text));
    const useAIParam = String(req.query.useAI || "").toLowerCase();
    const useAI = openaiClient && useAIParam !== "false";
    const aiSections = useAI ? await extractSectionsWithAI(text, mbtiType) : null;
    const sections = aiSections || heuristicSections;

    return res.json({
      mbtiType,
      consultation: text,
      sections,
      sections_source: aiSections ? "ai" : heuristicSections ? "heuristic" : "none",
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

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok", service: "MBTI-NEU API" }));

export default app;