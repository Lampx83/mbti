/**
 * Bóc tách 7 mục tư vấn từ text DOCX MBTI bằng heuristic heading.
 * Sản phẩm: { ten_tinh_cach, khai_niem, phan_tich_cac_chieu_tinh_cach, diem_manh, diem_yeu, moi_truong, nganh_nghe_tuong_ung }
 */

export const SECTION_DEFS = [
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
  ] },
  { key: "diem_yeu", labels: [
    "ĐIỂM YẾU", "DIEM YEU", "HẠN CHẾ", "HAN CHE",
    "NHƯỢC ĐIỂM", "NHUOC DIEM", "ĐIỂM HẠN CHẾ", "DIEM HAN CHE",
  ] },
  { key: "moi_truong", labels: [
    "MÔI TRƯỜNG", "MOI TRUONG",
    "MÔI TRƯỜNG LÀM VIỆC PHÙ HỢP", "MOI TRUONG LAM VIEC PHU HOP",
    "MÔI TRƯỜNG PHÙ HỢP", "MOI TRUONG PHU HOP",
  ] },
  {
    key: "nganh_nghe_tuong_ung",
    labels: [
      "NGÀNH, NGHỀ TƯƠNG ỨNG", "NGANH, NGHE TUONG UNG",
      "DANH MỤC NGÀNH VÀ NGHỀ NGHIỆP TƯƠNG ỨNG", "DANH MUC NGANH VA NGHE NGHIEP TUONG UNG",
    ],
  },
];

export function normalizeHeading(input) {
  if (!input) return "";
  let s = String(input).trim();
  s = s
    .replace(/^(\d+\.)+\s+/, "")
    .replace(/^(\d+\.)+\d+\s+/, "")
    .replace(/^\(\d+\)\s+/, "")
    .replace(/^[IVXLCDM]+\.\s+/i, "")
    .replace(/^\d+[)\]]\s+/, "")
    .replace(/^[-–•]\s+/, "");
  s = s.replace(/[đ]/g, "d").replace(/[Đ]/g, "D");
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const LABEL_TO_KEY = (() => {
  const map = new Map();
  for (const def of SECTION_DEFS) {
    for (const label of def.labels) {
      map.set(normalizeHeading(label), def.key);
    }
  }
  return map;
})();

function getRemainderAfterHeading(line, labelNorm) {
  const sep = line.match(/[:\-–—]/u);
  if (sep) {
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
      if (filtered[i + j].norm !== labelTokens[j]) { match = false; break; }
    }
    if (match) {
      const lastIndex = filtered[i + labelTokens.length - 1].index;
      return rawTokens.slice(lastIndex + 1).join(" ").trim();
    }
  }
  return "";
}

export function extractSectionsByHeadings(text) {
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

function stripLeadingNumber(line) {
  return line
    .replace(/^\s*(\d+\.)+\d*\s+/g, "")
    .replace(/^\s*\d+[\.)\]\s]+/g, "")
    .replace(/^\s*\(\d+\)\s+/g, "")
    .replace(/^\s*[IVXLCDM]+\.\s+/gi, "")
    .replace(/^\s*[-–•]\s+/g, "");
}

function cleanSectionText(text) {
  if (!text) return text;
  return text.split("\n").map(stripLeadingNumber).join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
  const rawLines = String(text).split("\n").map((l) => String(l || "").trim()).filter(Boolean);
  const items = [];
  for (const rawLine of rawLines) {
    const stripped = stripLeadingNumber(rawLine).trim();
    if (!stripped) continue;
    const isNewItem = stripped !== rawLine;
    if (!items.length) { items.push(stripped); continue; }
    if (isNewItem) { items.push(stripped); continue; }
    items[items.length - 1] = `${items[items.length - 1]} ${stripped}`.trim();
  }
  const mbti = String(mbtiType || "").trim().toUpperCase();
  return items
    .map((item) => {
      let s = String(item || "").replace(/\s+/g, " ").trim();
      if (!s) return "";
      s = stripLeadingTokensByNorm(s, ["MOI", "TRUONG", "LAM", "VIEC", "PHU", "HOP"]);
      s = stripLeadingTokensByNorm(s, ["LAM", "VIEC", "PHU", "HOP"]);
      if (mbti) {
        const tokens = s.split(/\s+/);
        if (normalizeHeading(tokens[0]) === mbti) s = tokens.slice(1).join(" ").trim();
      }
      if (s.length > 0) s = s.charAt(0).toUpperCase() + s.slice(1);
      return s;
    })
    .filter((item) => {
      const norm = normalizeHeading(item);
      return norm && norm !== "LAM VIEC PHU HOP" && norm !== "MOI TRUONG LAM VIEC PHU HOP";
    })
    .join("\n")
    .trim();
}

function cleanKhaiNiemText(text) {
  let s = cleanSectionText(text);
  if (!s) return s;
  const head = s.slice(0, 140);
  const dimHint =
    /(Extraversion|Introversion|Sensing|Intuition|Thinking|Feeling|Judging|Perceiving|I\/E|E\/I|S\/N|N\/S|T\/F|F\/T|J\/P|P\/J)/i;
  if (dimHint.test(head)) {
    const closeParenIdx = head.indexOf(")");
    if (closeParenIdx !== -1) s = s.slice(closeParenIdx + 1).trim();
    else {
      s = s.replace(/^[A-Za-z\s\/:,-]{0,80}\)\s*/u, "");
      s = s.replace(/^[A-Za-z\s\/,-]{0,80}:\s+/u, "");
    }
  }
  s = s.replace(/^\)\s*/u, "").trim();
  s = s.replace(/^([A-Z]{4})\s*[-–—]\s*\1\b\s*/u, "").trim();
  s = s.replace(/^[A-Z]{4}\s*[-–—]\s*/u, "").trim();
  return s;
}

function cleanNganhNghe(text) {
  if (!text) return text;
  const ngheHeaderRe = /Ngh[eề]\s+nghi[eệ]p\s+t[uư][oơ]ng\s+[uứ]ng\s*[:\-]?\s*/i;
  const codeRe = /\(([\d][\w_.]*(?:_[\w.]+)*)\)/;
  const isGroupHeader = (line) => {
    const lower = line.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
    return (
      lower.startsWith("nhom nganh") ||
      lower.startsWith("linh vuc") ||
      lower.startsWith("khoi nganh") ||
      lower.startsWith("nhom linh vuc")
    );
  };
  const rawLines = text.split("\n").map(stripLeadingNumber).map((l) => l.trim()).filter(Boolean);

  const lines = [];
  let prevLineIsJobs = false;
  for (const line of rawLines) {
    const isNewMajor = codeRe.test(line);
    const isNghe = ngheHeaderRe.test(line);
    const isGroup = isGroupHeader(line);
    if (prevLineIsJobs && !isNewMajor && !isNghe && !isGroup) {
      lines[lines.length - 1] = lines[lines.length - 1].trimEnd() + " " + line;
    } else {
      lines.push(line);
      prevLineIsJobs = isNghe;
    }
  }

  const items = [];
  let currentMajor = null;
  let currentJobs = [];
  const flushMajor = () => {
    if (currentMajor !== null) {
      if (currentJobs.length > 0) {
        items.push({ type: "item", title: currentMajor.trim(), jobs: currentJobs.join(", ") });
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
      if (majorPart) { flushMajor(); currentMajor = majorPart; }
      if (jobsPart) jobsPart.split(/,/).map((j) => j.trim()).filter(Boolean).forEach((j) => currentJobs.push(j));
      continue;
    }
    if (codeRe.test(line)) { flushMajor(); currentMajor = line; continue; }
    if (currentMajor !== null) {
      line.split(/,/).map((j) => j.trim()).filter(Boolean).forEach((j) => currentJobs.push(j));
    } else {
      flushMajor();
      currentMajor = line;
    }
  }
  flushMajor();

  const output = [];
  for (const item of items) {
    if (item.type === "group") output.push(`\n${item.title}`);
    else output.push(item.jobs ? `${item.title}: ${item.jobs}` : item.title);
  }
  return output.join("\n").trim();
}

export function normalizeSections(sections, mbtiType) {
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
      } else if (["diem_manh", "diem_yeu", "moi_truong"].includes(def.key)) {
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
