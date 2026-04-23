import { useState, useCallback, useEffect, useRef, type CSSProperties } from "react";
import { MBTI_QUESTIONS, MBTI_TYPE_INFO } from "./mbti-data";
import type { MBTIQuestion } from "./mbti-data";
import { computeMBTI, computeMBTIScores, type AnswerRecord } from "./mbti-score";

type Step = "intro" | "quiz" | "result";
type SectionValue = string | string[];

const totalQuestions = MBTI_QUESTIONS.length;
// Split API bases:
// - VITE_AI_API_BASE: AI consultation (OpenAI/MinIO). Defaults to legacy VITE_API_BASE, then empty (=same-origin).
// - VITE_LOG_API_BASE: MBTI logging API (PostgreSQL). Defaults to empty (=same-origin).
const AI_API_BASE = (import.meta.env.VITE_AI_API_BASE ?? import.meta.env.VITE_API_BASE ?? "")
  .trim()
  .replace(/\/$/, "");
const LOG_API_BASE = (import.meta.env.VITE_LOG_API_BASE ?? "").trim().replace(/\/$/, "");
const BULLET_SECTION_KEYS = new Set(["diem_manh", "diem_yeu", "moi_truong"]);
const QUIZ_SCALE_OPTIONS = [
  { value: 1, size: 38, color: "#8b5cf6", glow: "rgba(139, 92, 246, 0.24)", label: "Hoàn toàn không đồng ý" },
  { value: 2, size: 32, color: "#a78bfa", glow: "rgba(167, 139, 250, 0.24)", label: "Rất không đồng ý" },
  { value: 3, size: 26, color: "#c4b5fd", glow: "rgba(196, 181, 253, 0.22)", label: "Không đồng ý" },
  { value: 4, size: 20, color: "#94a3b8", glow: "rgba(148, 163, 184, 0.2)", label: "Trung lập" },
  { value: 5, size: 26, color: "#6ee7b7", glow: "rgba(110, 231, 183, 0.2)", label: "Đồng ý" },
  { value: 6, size: 32, color: "#10b981", glow: "rgba(16, 185, 129, 0.22)", label: "Rất đồng ý" },
  { value: 7, size: 38, color: "#059669", glow: "rgba(5, 150, 105, 0.24)", label: "Hoàn toàn đồng ý" },
] as const;

export default function App() {
  const [step, setStep] = useState<Step>("intro");
  const [answers, setAnswers] = useState<AnswerRecord>({});
  const [quizNotice, setQuizNotice] = useState<string | null>(null);
  const [showMissingState, setShowMissingState] = useState(false);
  const [userName, setUserName] = useState("");
  const [userProfileId, setUserProfileId] = useState("");

  const answeredCount = Object.keys(answers).length;
  const progress = totalQuestions > 0 ? (answeredCount / totalQuestions) * 100 : 0;

  useEffect(() => {
    if (answeredCount === totalQuestions) {
      setQuizNotice(null);
    }
  }, [answeredCount]);

  const scrollToQuestion = useCallback((questionId: string) => {
    const questionNode = document.getElementById(`question-${questionId}`);
    questionNode?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const handleAnswer = useCallback((questionId: string, rating: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: rating }));
    setQuizNotice(null);
  }, []);

  const viewResult = useCallback(() => {
    const missingIds = MBTI_QUESTIONS.filter((question) => answers[question.id] === undefined).map(
      (question) => question.id,
    );

    if (missingIds.length > 0) {
      setShowMissingState(true);
      setQuizNotice(`Bạn còn ${missingIds.length} câu chưa trả lời. Hãy hoàn thành đầy đủ trước khi xem kết quả.`);
      scrollToQuestion(missingIds[0]);
      return;
    }

    setQuizNotice(null);
    setShowMissingState(false);
    setStep("result");
  }, [answers, scrollToQuestion]);

  const handleStart = useCallback(() => {
    if (!userName.trim() || !userProfileId.trim()) {
      setQuizNotice("Vui lòng nhập đầy đủ Tên và Mã hồ sơ trước khi bắt đầu làm bài.");
      return;
    }
    setStep("quiz");
    setAnswers({});
    setQuizNotice(null);
    setShowMissingState(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [userName, userProfileId]);

  const handleRetry = useCallback(() => {
    setStep("intro");
    setAnswers({});
    setQuizNotice(null);
    setShowMissingState(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  // NOTE: DB save is handled in Result step (POST /api/mbti/sessions)

  // DEV ONLY: random-fill all answers for quick testing
  const handleRandomFill = useCallback(() => {
    const random: AnswerRecord = {};
    for (const q of MBTI_QUESTIONS) {
      random[q.id] = Math.floor(Math.random() * 7) + 1;
    }
    setAnswers(random);
    setQuizNotice(null);
    setShowMissingState(false);
  }, []);

  const resultType = step === "result" ? computeMBTI(answers) : null;
  const resultInfo = resultType ? MBTI_TYPE_INFO[resultType] : null;
  const mainClassName =
    step === "quiz" ? "mx-auto max-w-5xl px-4 py-8 sm:px-6" : "mx-auto max-w-4xl px-4 py-8 sm:px-6";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <main className={mainClassName}>
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-800">Trắc nghiệm MBTI hướng nghiệp</h1>
          <p className="mt-1 text-sm text-slate-600 sm:text-base">Tra cứu nhóm tính cách và gợi ý nghề nghiệp tại NEU</p>
        </header>
        {step === "intro" && (
          <Intro
            onStart={handleStart}
            notice={quizNotice}
            userName={userName}
            userProfileId={userProfileId}
            onChangeUserName={setUserName}
            onChangeUserProfileId={setUserProfileId}
          />
        )}

        {step === "quiz" && (
          <Quiz
            questions={MBTI_QUESTIONS}
            answers={answers}
            answeredCount={answeredCount}
            progress={progress}
            notice={quizNotice}
            showMissingState={showMissingState}
            onAnswer={handleAnswer}
            onViewResult={viewResult}
            onRandomFill={handleRandomFill}
          />
        )}

        {step === "result" && resultInfo && resultType && (
          <Result
            info={resultInfo}
            mbtiType={resultType}
            answers={answers}
            userName={userName}
            userProfileId={userProfileId}
            onRetry={handleRetry}
          />
        )}
      </main>

      <footer className="pb-8 text-center text-sm text-slate-500">
        Công cụ tham khảo, không thay thế tư vấn chuyên nghiệp. © NEU
      </footer>
    </div>
  );
}

function Intro({
  onStart,
  notice,
  userName,
  userProfileId,
  onChangeUserName,
  onChangeUserProfileId,
}: {
  onStart: () => void;
  notice: string | null;
  userName: string;
  userProfileId: string;
  onChangeUserName: (value: string) => void;
  onChangeUserProfileId: (value: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="space-y-6">
        <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-700">
          MBTI Career Match
        </div>

        <div className="space-y-4">
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-slate-900">
            Khám phá tính cách và nhóm nghề phù hợp với bạn tại NEU.
          </h2>
          <p className="max-w-2xl text-base leading-7 text-slate-700">
            Bài trắc nghiệm gồm <strong className="font-semibold text-slate-900">{totalQuestions} câu hỏi</strong>,
            hiển thị trên cùng một trang để bạn dễ quan sát, trả lời linh hoạt và rà soát lại trước khi xem kết quả.
          </p>
        </div>

        <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Cách làm</p>
            <p className="mt-2 leading-6">Chọn mức độ đồng ý cho từng câu theo thang 7 mức</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Trải nghiệm</p>
            <p className="mt-2 leading-6">Hãy trả lời đầy đủ 20 câu để được nhận tư vấn</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Kết quả</p>
            <p className="mt-2 leading-6">Hệ thống phân tích 4 chiều MBTI và gợi ý môi trường học tập, nghề nghiệp phù hợp.</p>
          </div>
        </div>

        <ul className="space-y-2 text-sm leading-6 text-slate-700">
          <li>Chọn câu trả lời gần nhất với cách bạn thường suy nghĩ hoặc hành động.</li>
          <li>Không có đáp án đúng hoặc sai, nên hãy trả lời trung thực và nhất quán.</li>
          <li>Bạn chỉ xem được kết quả khi đã hoàn thành đầy đủ toàn bộ câu hỏi.</li>
        </ul>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Thông tin hồ sơ</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Nhập tên</span>
              <input
                value={userName}
                onChange={(e) => onChangeUserName(e.target.value)}
                placeholder="Ví dụ: Nguyễn Văn A"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-200 focus:ring-2"
              />
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium text-slate-700">Nhập mã hồ sơ</span>
              <input
                value={userProfileId}
                onChange={(e) => onChangeUserProfileId(e.target.value)}
                placeholder="Ví dụ: HS00123"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-indigo-200 focus:ring-2"
              />
            </label>
          </div>
          {notice && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
              {notice}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onStart}
          className="inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-5 py-3 text-base font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white sm:w-auto"
        >
          Bắt đầu làm bài
        </button>
      </div>
    </section>
  );
}

function Quiz({
  questions,
  answers,
  answeredCount,
  progress,
  notice,
  showMissingState,
  onAnswer,
  onViewResult,
  onRandomFill,
}: {
  questions: MBTIQuestion[];
  answers: AnswerRecord;
  answeredCount: number;
  progress: number;
  notice: string | null;
  showMissingState: boolean;
  onAnswer: (questionId: string, rating: number) => void;
  onViewResult: () => void;
  onRandomFill: () => void;
}) {
  const remainingCount = questions.length - answeredCount;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Danh sách câu hỏi</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Hoàn thành toàn bộ câu hỏi trên một trang</h2>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Chọn đáp án trực tiếp trên từng dòng câu hỏi. Hệ thống không tự chuyển câu và chỉ cho xem kết quả khi bạn đã trả lời đủ.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[280px]">
            <SummaryStat label="Đã trả lời" value={`${answeredCount}/${questions.length}`} tone="emerald" />
            <SummaryStat label="Còn lại" value={`${remainingCount}`} tone="amber" />
          </div>
        </div>

        {/* ⚠️ DEV ONLY – XÓA TRƯỚC KHI DEPLOY: nút random fill để test nhanh */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-orange-300 bg-orange-50 px-4 py-3">
          <span className="text-xs font-semibold text-orange-600">🧪 Chế độ thử nghiệm</span>
          <button
            type="button"
            onClick={onRandomFill}
            className="ml-auto rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
          >
            Random 20 câu
          </button>
        </div>
        {/* ⚠️ DEV ONLY – XÓA TRƯỚC KHI DEPLOY: nút random fill để test nhanh */}

        <div className="mt-5">
          <div className="flex items-center justify-between text-sm font-medium text-slate-600">
            <span>Tiến độ hoàn thành</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#0f766e_0%,#14b8a6_35%,#6366f1_100%)] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {notice && (
          <p className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
            {notice}
          </p>
        )}
      </section>

      <div className="space-y-4">
        {questions.map((question, index) => {
          const currentAnswer = answers[question.id];
          const isMissing = showMissingState && currentAnswer === undefined;

          return (
            <article
              key={question.id}
              id={`question-${question.id}`}
              className={`rounded-xl border bg-white p-5 shadow-sm transition sm:p-6 ${
                isMissing
                  ? "border-amber-300 shadow-[0_12px_40px_rgba(245,158,11,0.12)]"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white">
                      Câu {index + 1}
                    </span>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium ${
                        currentAnswer === undefined ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {currentAnswer === undefined ? "Chưa trả lời" : "Đã trả lời"}
                    </span>
                  </div>
                  <p className="max-w-3xl text-lg font-semibold leading-8 text-slate-900">{question.text}</p>
                </div>
              </div>

              <div className="mt-5 rounded-lg bg-slate-50 px-4 py-4 ring-1 ring-slate-200 sm:px-5" style={{ overflow: "visible" }}>
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] sm:text-xs">
                  <span className="text-violet-700">Không đồng ý</span>
                  <span className="text-emerald-700">Đồng ý</span>
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Mức độ đồng ý cho câu ${index + 1}`}
                  className={`likert-scale likert-scale-card mt-4 ${currentAnswer !== undefined ? "is-completed" : ""}`}
                >
                  {QUIZ_SCALE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onAnswer(question.id, option.value)}
                      role="radio"
                      aria-checked={currentAnswer === option.value}
                      aria-label={`${option.label} cho câu ${index + 1}`}
                      title={option.label}
                      className={`likert-option ${currentAnswer === option.value ? "is-selected" : ""}`}
                      style={
                        {
                          width: option.size,
                          height: option.size,
                          "--likert-color": option.color,
                          "--likert-glow": option.glow,
                        } as CSSProperties
                      }
                    />
                  ))}
                </div>
              </div>

              {isMissing && <p className="mt-3 text-sm font-medium text-amber-700">Câu này chưa được trả lời.</p>}
            </article>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-lg font-semibold">Sẵn sàng xem kết quả?</p>
            <p className="text-sm text-slate-600">
              {remainingCount === 0
                ? "Bạn đã hoàn thành toàn bộ câu hỏi. Có thể xem kết quả ngay."
                : `Bạn còn ${remainingCount} câu chưa trả lời. Nút xem kết quả sẽ đưa bạn tới câu còn thiếu.`}
            </p>
          </div>

          <button
            type="button"
            onClick={onViewResult}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white"
          >
            Xem kết quả
          </button>
        </div>
      </section>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber";
}) {
  const toneClassName =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-100"
      : "bg-amber-50 text-amber-800 ring-amber-100";

  return (
    <div className={`rounded-lg px-4 py-4 ring-1 ${toneClassName}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em]">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function normalizeForMatch(input: string) {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// ─── Client-side fallback section extractor ───────────────────────────────────
// When the API fails to parse certain sections (e.g. diem_manh, diem_yeu),
// this function tries to extract them from the raw consultation text.

const FALLBACK_HEADING_MAP: Record<string, string[]> = {
  diem_manh: ["ĐIỂM MẠNH", "DIEM MANH", "ƯU ĐIỂM", "UU DIEM", "Điểm mạnh", "Ưu điểm"],
  diem_yeu: ["ĐIỂM YẾU", "DIEM YEU", "HẠN CHẾ", "HAN CHE", "NHƯỢC ĐIỂM", "NHUOC DIEM", "Điểm yếu", "Hạn chế"],
  moi_truong: ["MÔI TRƯỜNG", "MOI TRUONG", "MÔI TRƯỜNG LÀM VIỆC", "Môi trường"],
};

function normalizeHeading(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toUpperCase()
    .trim();
}

function extractFallbackSections(rawText: string, keys: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = rawText.split(/\r?\n/);

  // Build all heading variants to watch for
  const allHeadings: { key: string; normalized: string }[] = [];
  for (const key of keys) {
    const variants = FALLBACK_HEADING_MAP[key] ?? [];
    for (const v of variants) {
      allHeadings.push({ key, normalized: normalizeHeading(v) });
    }
  }

  // Also add all known section headings so we know when a section ends
  const ALL_SECTION_HEADINGS = [
    "TEN TINH CACH", "KHAI NIEM", "PHAN TICH CAC CHIEU TINH CACH",
    "DIEM MANH", "UU DIEM", "DIEM YEU", "HAN CHE", "NHUOC DIEM",
    "MOI TRUONG", "MOI TRUONG LAM VIEC",
    "NGANH NGHE TUONG UNG", "DANH MUC NGANH VA NGHE NGHIEP TUONG UNG",
  ];

  let currentKey: string | null = null;
  const buffers: Record<string, string[]> = {};

  for (const line of lines) {
    const norm = normalizeHeading(line);

    // Check if this line is a heading for one of the keys we want
    const matchedWanted = allHeadings.find((h) => norm === h.normalized || norm.startsWith(h.normalized));
    if (matchedWanted) {
      currentKey = matchedWanted.key;
      buffers[currentKey] = buffers[currentKey] ?? [];
      continue;
    }

    // Check if this line is any other known section heading → stop collecting
    const isOtherHeading = ALL_SECTION_HEADINGS.some(
      (h) => norm === h || norm.startsWith(h + " "),
    );
    if (isOtherHeading && currentKey) {
      currentKey = null;
      continue;
    }

    if (currentKey) {
      buffers[currentKey] = buffers[currentKey] ?? [];
      buffers[currentKey].push(line);
    }
  }

  for (const key of keys) {
    const content = (buffers[key] ?? []).join("\n").trim();
    if (content) result[key] = content;
  }

  return result;
}

// ─── Octagon Diagram ──────────────────────────────────────────────────────────

/**
 * scoreToPct: raw score → 0..1 percentage for each pole.
 * Uses a "soft max" so typical scores look visually significant on the radar.
 * SOFT_MAX = 60% of true max (15) → a score of 9 already fills 100% visually.
 */
const TRUE_MAX = 15;
const SOFT_MAX = TRUE_MAX * 0.8; // score ≥ SOFT_MAX → 100% on chart

function scoreToPct(score: number): {
  pct: number;          // 0..1 boosted percentage (for radar radius)
  rawPct: number;       // 0..1 true percentage (for legend display)
  dominant: "left" | "right" | "neutral";
} {
  if (score === 0) return { pct: 0, rawPct: 0, dominant: "neutral" };
  const sign = score > 0 ? 1 : -1;
  const abs = Math.abs(score);
  const rawPct = Math.min(abs / TRUE_MAX, 1);
  const pct = Math.min(abs / SOFT_MAX, 1);
  return {
    pct,
    rawPct,
    dominant: sign > 0 ? "left" : "right",
  };
}

// ─── Static fallback: điểm mạnh / điểm yếu cho cả 16 type ──────────────────────
// Dùng khi API không trả về hoặc text extraction thất bại.
const STATIC_DIEM_MANH: Record<string, string[]> = {
  INTJ: ["Tư duy chiến lược và dài hạn", "Độc lập, tự chủ cao", "Quyết đoán và có mục tiêu rõ ràng", "Khả năng phân tích sâu và logic", "Luôn cải thiện bản thân"],
  INTP: ["Tư duy phân tích xuất sắc", "Sáng tạo trong giải quyết vấn đề", "Khách quan và trung thực", "Ham học hỏi, tò mò trí tuệ", "Khả năng tư duy trừu tượng tốt"],
  ENTJ: ["Lãnh đạo tự nhiên, quyết đoán", "Tư duy chiến lược và tầm nhìn xa", "Tổ chức và thực thi hiệu quả", "Tự tin và truyền cảm hứng", "Luôn hướng đến kết quả"],
  ENTP: ["Sáng tạo và đổi mới liên tục", "Tranh luận giỏi, tư duy nhanh nhạy", "Thích ứng linh hoạt", "Nhìn thấy cơ hội ở mọi nơi", "Giao tiếp thuyết phục"],
  INFJ: ["Đồng cảm sâu sắc với người khác", "Tầm nhìn xa và trực giác mạnh", "Kiên định với giá trị cá nhân", "Sáng tạo và có chiều sâu", "Tận tâm và đáng tin cậy"],
  INFP: ["Đồng cảm và lắng nghe chân thành", "Sáng tạo và giàu trí tưởng tượng", "Trung thành với giá trị cốt lõi", "Nhiệt tình với ý nghĩa và mục đích", "Linh hoạt và cởi mở"],
  ENFJ: ["Lãnh đạo bằng sự đồng cảm", "Truyền cảm hứng và kết nối tốt", "Tổ chức và lập kế hoạch hiệu quả", "Tận tâm, trách nhiệm cao", "Nhạy cảm với nhu cầu người khác"],
  ENFP: ["Nhiệt huyết và truyền cảm hứng mạnh mẽ", "Sáng tạo và giàu ý tưởng", "Kết nối và giao tiếp xuất sắc", "Linh hoạt, thích nghi tốt", "Đồng cảm và quan tâm đến mọi người"],
  ISTJ: ["Đáng tin cậy và có trách nhiệm cao", "Chi tiết, cẩn thận và chính xác", "Kiên trì và bền bỉ", "Tôn trọng cam kết và quy trình", "Ổn định và nhất quán"],
  ISFJ: ["Chu đáo, ân cần và tận tâm", "Trung thành và đáng tin cậy", "Kiên nhẫn và lắng nghe tốt", "Thực tế, chú trọng chi tiết", "Hỗ trợ người khác hết lòng"],
  ESTJ: ["Tổ chức và quản lý hiệu quả", "Quyết đoán và rõ ràng trong quyết định", "Trách nhiệm và đáng tin cậy", "Thực tế và hướng kết quả", "Lãnh đạo nhóm tốt"],
  ESFJ: ["Hòa đồng và xây dựng mối quan hệ tốt", "Tận tâm, chu đáo với mọi người", "Hợp tác và hỗ trợ nhóm", "Thực tế và có trách nhiệm", "Trung thành và đáng tin"],
  ISTP: ["Phân tích thực tế và giải quyết vấn đề nhanh", "Bình tĩnh dưới áp lực", "Kỹ năng kỹ thuật và tay nghề cao", "Linh hoạt và thích ứng tốt", "Quan sát sắc bén"],
  ISFP: ["Sáng tạo và có thẩm mỹ tốt", "Đồng cảm và quan tâm chân thành", "Linh hoạt và không áp đặt", "Trung thành với giá trị cá nhân", "Thực tế và khéo tay"],
  ESTP: ["Hành động nhanh và quyết đoán", "Thực tế, giải quyết vấn đề tức thì", "Giao tiếp tự tin và thuyết phục", "Linh hoạt và thích nghi cực tốt", "Năng động và đầy năng lượng"],
  ESFP: ["Nhiệt tình và tạo không khí vui vẻ", "Giao tiếp tự nhiên và hòa đồng", "Thực tế và hành động ngay", "Quan tâm và hỗ trợ người xung quanh", "Linh hoạt, không cứng nhắc"],
};

const STATIC_DIEM_YEU: Record<string, string[]> = {
  INTJ: ["Có thể quá cứng nhắc và khó thỏa hiệp", "Ít quan tâm đến cảm xúc người khác", "Đôi khi quá tự tin vào phán đoán của mình", "Khó giao tiếp cảm xúc tự nhiên", "Thiếu kiên nhẫn với những người chậm hiểu"],
  INTP: ["Dễ trì hoãn và thiếu quyết đoán", "Bỏ qua cảm xúc của người khác", "Khó hoàn thành dự án vì luôn muốn hoàn thiện thêm", "Giao tiếp xã hội đôi khi lúng túng", "Thiếu tổ chức trong cuộc sống thực tế"],
  ENTJ: ["Đôi khi quá kiểm soát và áp đặt", "Ít chú ý đến cảm xúc người khác", "Thiếu kiên nhẫn với tốc độ chậm", "Có thể bị coi là lạnh lùng hoặc độc đoán", "Khó chấp nhận ý kiến trái chiều"],
  ENTP: ["Dễ bỏ dở dự án giữa chừng", "Tranh luận quá mức, gây căng thẳng", "Thiếu kiên nhẫn với quy trình lặp lại", "Đôi khi thiếu nhạy cảm với cảm xúc người khác", "Khó tập trung vào một mục tiêu dài hạn"],
  INFJ: ["Dễ kiệt sức khi giúp đỡ quá nhiều", "Quá hoàn hảo chủ nghĩa", "Khó mở lòng và dễ bị tổn thương", "Đôi khi quá lý tưởng hóa", "Tránh né xung đột dù cần thiết"],
  INFP: ["Dễ bị tổn thương khi bị chỉ trích", "Đôi khi quá lý tưởng, xa rời thực tế", "Khó quyết định dứt khoát", "Tránh xung đột và đối đầu", "Dễ trì hoãn công việc"],
  ENFJ: ["Dễ bỏ qua nhu cầu bản thân vì người khác", "Quá nhạy cảm với lời chỉ trích", "Đôi khi kiểm soát quá mức", "Khó từ chối người khác", "Dễ căng thẳng khi có xung đột"],
  ENFP: ["Khó tập trung lâu dài vào một việc", "Dễ bị phân tâm bởi ý tưởng mới", "Thiếu kỷ luật trong việc hoàn thành nhiệm vụ", "Đôi khi quá cảm tính trong quyết định", "Khó tuân theo quy trình cứng nhắc"],
  ISTJ: ["Cứng nhắc, khó thay đổi theo hoàn cảnh mới", "Đôi khi quá bảo thủ", "Ít linh hoạt với ý tưởng sáng tạo", "Khó bày tỏ cảm xúc", "Có thể quá khắt khe với bản thân và người khác"],
  ISFJ: ["Dễ bị lợi dụng vì quá tốt bụng", "Khó nói không và đặt ranh giới", "Tránh né xung đột và thay đổi", "Đôi khi quá tự ti, không nhận ra giá trị bản thân", "Khó thích nghi với thay đổi đột ngột"],
  ESTJ: ["Đôi khi quá cứng nhắc với quy tắc", "Ít linh hoạt với cách làm mới", "Khó lắng nghe cảm xúc người khác", "Có thể bị coi là áp đặt", "Thiếu kiên nhẫn với sự mơ hồ"],
  ESFJ: ["Dễ bị ảnh hưởng bởi ý kiến người khác", "Tránh xung đột đến mức cần thiết", "Quá cần sự chấp thuận từ bên ngoài", "Đôi khi thiếu quyết đoán", "Khó thích nghi với thay đổi lớn"],
  ISTP: ["Khó giao tiếp cảm xúc với người khác", "Đôi khi quá lạnh lùng và xa cách", "Thiếu kiên nhẫn với lý thuyết dài dòng", "Khó cam kết lâu dài", "Dễ bỏ qua cảm xúc người xung quanh"],
  ISFP: ["Dễ bị tổn thương và quá nhạy cảm", "Tránh xung đột dù cần thiết", "Khó lập kế hoạch dài hạn", "Đôi khi thiếu quyết đoán", "Khó bày tỏ nhu cầu bản thân"],
  ESTP: ["Dễ chán với công việc lặp lại", "Đôi khi thiếu suy nghĩ dài hạn", "Có thể bị coi là liều lĩnh", "Khó kiên nhẫn với chi tiết và lý thuyết", "Đôi khi thiếu nhạy cảm với cảm xúc người khác"],
  ESFP: ["Dễ tránh né vấn đề nghiêm túc", "Khó tập trung dài hạn", "Đôi khi quá bốc đồng", "Thiếu kỷ luật với kế hoạch", "Dễ bị ảnh hưởng bởi môi trường xung quanh"],
};

// ── Radar (octagon) ─────────────────────────────────────────────────────────

/**
 * 8-axis radar chart.
 * Each pair of opposite axes = one MBTI dimension.
 * The filled polygon is built from the dominant tip of each axis
 * (or centre if neutral).
 *
 * Axes layout (vertex index, clockwise from top):
 *   0=top      → E
 *   1=top-right → N (opposite of S at 5=bot-left)
 *   2=right    → F (opposite of T at 6=left)
 *   3=bot-right → P (opposite of J at 7=top-left)
 *   4=bottom   → I
 *   5=bot-left → S
 *   6=left     → T
 *   7=top-left → J
 */
const RADAR_AXES: {
  vertexIdx: number;
  letter: string;
  label: string;
  scoreKey: "EI" | "SN" | "TF" | "JP";
  positiveDir: boolean; // true = positive raw score → this vertex
}[] = [
  { vertexIdx: 0, letter: "E", label: "Hướng ngoại", scoreKey: "EI", positiveDir: true  },
  { vertexIdx: 1, letter: "N", label: "Trực giác",   scoreKey: "SN", positiveDir: false },
  { vertexIdx: 2, letter: "F", label: "Cảm xúc",     scoreKey: "TF", positiveDir: false },
  { vertexIdx: 3, letter: "P", label: "Linh hoạt",   scoreKey: "JP", positiveDir: false },
  { vertexIdx: 4, letter: "I", label: "Hướng nội",   scoreKey: "EI", positiveDir: false },
  { vertexIdx: 5, letter: "S", label: "Thực tế",     scoreKey: "SN", positiveDir: true  },
  { vertexIdx: 6, letter: "T", label: "Lý trí",      scoreKey: "TF", positiveDir: true  },
  { vertexIdx: 7, letter: "J", label: "Nguyên tắc",  scoreKey: "JP", positiveDir: true  },
];


function OctagonDiagram({ scores }: { scores: Record<string, number> }) {
  const [animPct, setAnimPct] = useState(0);

  // Stable key: serialize scores once so the effect only fires when values actually change
  const scoresKey = Object.entries(scores).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}:${v}`).join(",");

  useEffect(() => {
    // Reset then animate 0 → 1 — runs exactly once per unique score set
    setAnimPct(0);
    const startTime = performance.now();
    const duration = 900;
    let id: number;
    const tick = (now: number) => {
      const t = Math.min((now - startTime) / duration, 1);
      setAnimPct(1 - Math.pow(1 - t, 3)); // ease-out cubic
      if (t < 1) { id = requestAnimationFrame(tick); }
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoresKey]);

  const SIZE   = 300;
  const cx     = SIZE / 2;
  const cy     = SIZE / 2;
  const R      = SIZE / 2 - 50; // radius of outer ring (leaves room for labels)

  // dataScale: zoom the polygon when scores are weak, so the shape fills the grid.
  // Grid rings, spokes, labels are always drawn at R — only polygon points are scaled.
  const maxRawPct = Math.max(
    ...Object.values(scores).map((s) => Math.min(Math.abs(s ?? 0) / (15 * 0.8), 1)),
    0.01,
  );
  const dataScale = Math.min(1 / maxRawPct, 2.5);

  function deg2rad(d: number) { return (d * Math.PI) / 180; }
  function axisPoint(angleDeg: number, r: number) {
    return {
      x: cx + r * Math.cos(deg2rad(angleDeg)),
      y: cy + r * Math.sin(deg2rad(angleDeg)),
    };
  }

  // Compute 8 data points — one per axis end.
  // For each dimension we have a pos-end and a neg-end.
  // The point on the dominant side gets the full radius; the opposite end always stays at centre.
  // This ensures the polygon always has 8 vertices and is fully closed.
  const axisOrder = [
    { key: "EI" as const, angleDeg: 270, isPos: true  },  // E  (top)
    { key: "SN" as const, angleDeg: 315, isPos: false },  // N  (top-right)
    { key: "TF" as const, angleDeg: 0,   isPos: false },  // F  (right)
    { key: "JP" as const, angleDeg: 45,  isPos: false },  // P  (bot-right)
    { key: "EI" as const, angleDeg: 90,  isPos: false },  // I  (bottom)
    { key: "SN" as const, angleDeg: 135, isPos: true  },  // S  (bot-left)
    { key: "TF" as const, angleDeg: 180, isPos: true  },  // T  (left)
    { key: "JP" as const, angleDeg: 225, isPos: true  },  // J  (top-left)
  ];

  // dataPoints: active poles get their radius; inactive are flagged but excluded from drawing.
  const dataPoints = axisOrder.map(({ key, angleDeg, isPos }) => {
    const raw = scores[key] ?? 0;
    const { pct, dominant } = scoreToPct(raw);
    const effectivePct = pct * animPct * dataScale;
    const isActive = (isPos && dominant === "left") || (!isPos && dominant === "right");
    const r = isActive ? Math.min(effectivePct * R, R) : 0;
    return { ...axisPoint(angleDeg, r), isActive };
  });

  // Build the radar polygon path.
  //
  // Rule: the 8 axes are evenly spaced around a circle. Each MBTI dimension
  // occupies 2 opposite positions (e.g. E at index 0, I at index 4).
  // Because of this, when active points surround the centre they always span
  // indices that "wrap around" more than half the circle.
  //
  // Simple reliable test:
  //   • Find all "gaps" (runs of inactive indices between active ones, going CW).
  //   • If the LONGEST single gap ≥ 4 consecutive inactive slots, the active
  //     points are all bunched on one side → centre is outside → route through it.
  //   • Otherwise the active points spread around enough to enclose the centre.
  //
  // This avoids ray-casting edge cases (points on axes, collinear vertices, etc.)
  const quadPoly = (() => {
    const n = dataPoints.length; // always 8
    const isActive = dataPoints.map((p) => p.isActive);

    const activeCount = isActive.filter(Boolean).length;
    if (activeCount === 0) return "";

    // Find the length of the longest contiguous run of INACTIVE indices (circular)
    let maxGap = 0;
    let curGap = 0;
    // Check twice around to handle wrap-around gaps
    for (let step = 0; step < n * 2; step++) {
      if (!isActive[step % n]) {
        curGap++;
        if (curGap > maxGap) maxGap = curGap;
      } else {
        curGap = 0;
      }
    }
    // Cap at n to avoid double-counting full-inactive case
    maxGap = Math.min(maxGap, n);

    // If longest gap ≥ 4 (half the circle), centre is outside the active arc
    const centreOutside = maxGap >= 4;

    if (!centreOutside) {
      // Active points surround the centre → simple closed polygon, no centre vertex
      return dataPoints
        .filter((p) => p.isActive)
        .map((p) => `${p.x},${p.y}`)
        .join(" ");
    }

    // Centre is outside → split active points into contiguous runs,
    // bridging each gap by routing through the centre point.
    const firstActive = isActive.findIndex(Boolean);
    if (firstActive === -1) return "";

    const segments: string[][] = [];
    let run: string[] = [];

    for (let step = 0; step < n; step++) {
      const idx = (firstActive + step) % n;
      if (isActive[idx]) {
        run.push(`${dataPoints[idx].x},${dataPoints[idx].y}`);
      } else {
        if (run.length > 0) { segments.push(run); run = []; }
      }
    }
    if (run.length > 0) segments.push(run);

    if (segments.length === 0) return "";
    if (segments.length === 1) {
      // One contiguous arc on one side — close via centre
      return `${segments[0].join(" ")} ${cx},${cy}`;
    }
    // Multiple arcs — place ONE centre vertex between adjacent arcs only.
    // No trailing centre: SVG polygon auto-closes last→first, which is correct.
    return segments.map((s) => s.join(" ")).join(` ${cx},${cy} `);
  })();

  // Grid rings (full 8-point octagon for visual reference)
  const OCT_N = 8;
  const octPts = (scale: number) =>
    Array.from({ length: OCT_N }, (_, i) => {
      const a = (Math.PI / 4) * i - Math.PI / 2;
      return `${cx + scale * R * Math.cos(a)},${cy + scale * R * Math.sin(a)}`;
    }).join(" ");

  // Label positions (outside outer ring)
  const LABEL_SCALE = 1.28;

  return (
    <div className="flex flex-col items-center gap-5">
      {/* ── Radar SVG ── */}
      <svg
        width={SIZE} height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        style={{ overflow: "visible" }}
        aria-label="Biểu đồ radar MBTI"
      >
        {/* Grid rings: 33%, 66% dashed + 100% solid outer frame */}
        {[0.33, 0.66].map((s) => (
          <polygon key={s} points={octPts(s)}
            fill="none"
            stroke="#e2e8f0"
            strokeWidth={0.8}
            strokeDasharray="4 3"
          />
        ))}
        <polygon points={octPts(1.0)}
          fill="none"
          stroke="#cbd5e1"
          strokeWidth={1.5}
        />

        {/* Outer ring vertex dots */}
        {Array.from({ length: OCT_N }, (_, i) => {
          const a = (Math.PI / 4) * i - Math.PI / 2;
          return (
            <circle key={i}
              cx={cx + R * Math.cos(a)} cy={cy + R * Math.sin(a)}
              r="3" fill="white" stroke="#cbd5e1" strokeWidth="1.5"
            />
          );
        })}

        {/* 8 axis spokes */}
        {Array.from({ length: OCT_N }, (_, i) => {
          const a = (Math.PI / 4) * i - Math.PI / 2;
          return (
            <line key={i}
              x1={cx} y1={cy}
              x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)}
              stroke="#e2e8f0" strokeWidth="1"
            />
          );
        })}



        {/* Radar polygon — active tips only, routed through centre when needed */}
        {quadPoly && (
          <polygon
            points={quadPoly}
            fill="rgba(99,102,241,0.15)"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        )}

        {/* Data point dots — only on active (non-centre) tips */}
        {dataPoints.filter((p) => p.isActive).map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4"
            fill="#6366f1" stroke="white" strokeWidth="1.5"
          />
        ))}

        {/* Axis labels (both ends of all 4 axes) */}
        {axisOrder.map(({ key, angleDeg, isPos }) => {
          const raw = scores[key] ?? 0;
          const { dominant } = scoreToPct(raw);
          // Find matching axis info from RADAR_AXES
          const axisInfo = RADAR_AXES.find((a) => a.scoreKey === key && a.positiveDir === isPos);
          if (!axisInfo) return null;
          const { letter, label } = axisInfo;
          const active = isPos ? dominant === "left" : dominant === "right";
          const lp = axisPoint(angleDeg, R * LABEL_SCALE);
          const anchor = lp.x < cx - 8 ? "end" : lp.x > cx + 8 ? "start" : "middle";
          return (
            <g key={`${key}-${letter}`}>
              <text x={lp.x} y={lp.y - 5} textAnchor={anchor}
                fontSize="11" fontWeight={active ? "700" : "400"}
                fill={active ? "#6366f1" : "#94a3b8"}>
                {letter}
              </text>
              <text x={lp.x} y={lp.y + 8} textAnchor={anchor}
                fontSize="9" fill={active ? "#475569" : "#94a3b8"}>
                {label}
              </text>
            </g>
          );
        })}
      </svg>

    </div>
  );
}


// ─── Section helpers ───────────────────────────────────────────────────────────

function sectionHasContent(value: unknown) {
  if (Array.isArray(value)) {
    return value.some((item) => typeof item === "string" && item.trim());
  }
  return typeof value === "string" && value.trim();
}

function toLines(value: SectionValue): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return value
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toBullets(value: SectionValue): string[] {
  const lines = toLines(value);
  if (lines.length > 1) return lines;

  const text = lines[0] ?? "";
  const bySymbols = text
    .split(/(?:\s*•\s*|\s*-\s*|\s*;\s*|\s*\u2022\s*)/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (bySymbols.length > 1) return bySymbols;

  const byCaps = text
    .split(/(?<=\p{Ll}[\.\)]?)\s+(?=\p{Lu})/gu)
    .map((item) => item.trim())
    .filter(Boolean);
  if (byCaps.length > 1) return byCaps;

  return text ? [text] : [];
}

function capitalizeAfterColon(str: string): string {
  return str.replace(/:\s+([a-z\u00C0-\u024F\u1E00-\u1EFF])/g, (_, c) => `: ${c.toUpperCase()}`);
}

function formatDimensionLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "";

  const formattedMatch = trimmed.match(/^([A-Za-z]+)\s*[-\u2013\u2014]\s*\(([^)]+)\)\s*:\s*(.+)$/);
  if (formattedMatch) {
    const [, dim, vn, rest] = formattedMatch;
    return capitalizeAfterColon(`${dim} \u2013 (${vn.trim()}): ${capitalizeFirst(rest.trim())}`);
  }

  const match = trimmed.match(/^([A-Za-z]+)\s*[-\u2013\u2014]\s*(.+)$/);
  if (!match) return trimmed;

  const [, dim, restRaw] = match;
  const rest = restRaw.trim();
  if (!rest) return trimmed;

  if (rest.startsWith("(")) return `${dim} \u2013 ${rest}`;

  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length < 2) return trimmed;

  const first = words[0];
  const firstNorm = normalizeForMatch(first);
  const stopStarts = new Set([
    "ho", "cac", "nhung", "nguoi",
    "istj", "intj", "intp", "entj", "entp",
    "infj", "infp", "enfj", "enfp",
    "istp", "isfp", "estj", "estp",
    "esfj", "esfp", "isfj",
  ]);
  if (stopStarts.has(firstNorm) || /^[A-Z]{4}$/.test(first)) return trimmed;

  const vn = `${words[0]} ${words[1]}`.trim();
  const description = words.slice(2).join(" ").trim();
  if (!description) return trimmed;

  return capitalizeAfterColon(`${dim} \u2013 (${vn}): ${capitalizeFirst(description)}`);
}

// Detect a bare dimension header line like "Introversion / Extraversion (I/E)"
// — no Vietnamese description following the abbreviation pair.
function isDimHeader(line: string): boolean {
  // Matches patterns: "Extraversion / Introversion (E/I)" or "Sensing/Intuition (S/N)" etc.
  return /^(Introversion|Extraversion|Sensing|Intuition|Thinking|Feeling|Judging|Perceiving)(\s*[/\/]\s*(Introversion|Extraversion|Sensing|Intuition|Thinking|Feeling|Judging|Perceiving))?\s*\([A-Z]\/[A-Z]\)\s*$/i.test(line.trim());
}

function renderDimensionAnalysis(value: SectionValue) {
  let lines = toLines(value);
  if (lines.length <= 1) {
    lines = toBullets(value);
  }

  // Merge bare dimension headers with the description line that follows them
  const merged: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (isDimHeader(line) && i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (next) {
        merged.push(`${line}: ${next}`);
        i++; // skip the description line we just consumed
        continue;
      }
    }
    merged.push(line);
  }

  const normalized = merged.map(formatDimensionLine).filter(Boolean);

  if (!normalized.length) return null;
  return (
    <ul className="list-disc space-y-2 pl-5 leading-relaxed text-slate-700">
      {normalized.map((item, idx) => (
        <li key={`dim-${idx}`}>{item}</li>
      ))}
    </ul>
  );
}

// ── Icon map cho lĩnh vực ────────────────────────────────────────────────────
const SECTOR_ICONS: Record<string, string> = {
  "tài chính": "💰", "finance": "💰", "ngân hàng": "🏦",
  "kế toán": "📊", "kinh doanh": "💼", "quản trị": "🏢",
  "marketing": "📣", "truyền thông": "📢", "báo chí": "📰",
  "công nghệ": "💻", "cntt": "💻", "it": "💻", "kỹ thuật": "⚙️",
  "giáo dục": "🎓", "đào tạo": "🎓",
  "y tế": "🏥", "sức khỏe": "💊",
  "luật": "⚖️", "pháp lý": "⚖️",
  "nghệ thuật": "🎨", "thiết kế": "🎨",
  "du lịch": "✈️", "khách sạn": "🏨",
  "xây dựng": "🏗️", "kiến trúc": "🏛️",
  "nông nghiệp": "🌱", "môi trường": "🌿",
  "khoa học": "🔬", "nghiên cứu": "🔭",
  "nhân sự": "👥", "hr": "👥",
  "sản xuất": "🏭", "logistics": "📦",
  "tâm lý": "🧠", "xã hội": "🤝",
};

function getSectorIcon(title: string): string {
  const lower = title.toLowerCase();
  for (const [key, icon] of Object.entries(SECTOR_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "📋";
}

function parseNganhNgheData(value: SectionValue) {
  type NganhBlock = { name: string; nghe: string[] };
  type LinhVucBlock = { title: string; nganh: NganhBlock[] };

  const rawLines = toLines(value);
  const sectors: LinhVucBlock[] = [];
  let curSector: LinhVucBlock | null = null;

  // Mirror backend isGroupHeader logic (no diacritics)
  const stripDia = (s: string) =>
    s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

  const isGroupHeader = (line: string) => {
    const lower = stripDia(line);
    return (
      lower.startsWith("nhom nganh") ||
      lower.startsWith("linh vuc") ||
      lower.startsWith("khoi nganh") ||
      lower.startsWith("nhom linh vuc") ||
      // also catch "## Lĩnh vực: ..." from AI providers that skip cleanNganhNghe
      /^##\s+/i.test(line)
    );
  };

  const extractGroupTitle = (line: string) =>
    line
      .replace(/^##\s+/i, "")
      // strip "Lĩnh vực:", "Nhóm ngành:", "Khối ngành:" prefix (with or without diacritics)
      .replace(/^(L[iĩ]nh\s+v[uư]c|Nh[oó]m\s+ng[aà]nh|Kh[oô]i\s+ng[aà]nh|Nh[oó]m\s+l[iĩ]nh\s+v[uư]c)\s*[:：]?\s*/iu, "")
      .trim();

  const flushSector = () => {
    if (curSector) { sectors.push(curSector); curSector = null; }
  };

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;

    // ── Group header (sector) ────────────────────────────────────────────────
    if (isGroupHeader(line)) {
      flushSector();
      curSector = { title: extractGroupTitle(line), nganh: [] };
      continue;
    }

    // ── "Ngành (code): Nghề1, Nghề2, ..." — main backend format ─────────────
    // Also handles "### Ngành: ..." from AI providers
    if (line.includes(":")) {
      // Strip "### Ngành:" prefix if present
      const cleanLine = line.replace(/^###\s+Ng[aà]nh\s*[:：]\s*/i, "");
      const colonIdx = cleanLine.indexOf(":");
      const left = cleanLine.slice(0, colonIdx)
        .replace(/\s*\([^)]*\)\s*/g, "") // strip mã ngành in parens
        .trim();
      const right = cleanLine.slice(colonIdx + 1).trim();

      // If left looks like it's still a group header (e.g. from AI format), treat as sector
      if (isGroupHeader(left)) {
        flushSector();
        curSector = { title: extractGroupTitle(left), nganh: [] };
        if (right) {
          // Unlikely but handle gracefully
          curSector.nganh.push({ name: "", nghe: right.split(/[,;]+/).map(j => j.trim()).filter(Boolean) });
        }
        continue;
      }

      if (!curSector) curSector = { title: "", nganh: [] };
      const nghe = right ? right.split(/[,;]+/).map(j => j.trim()).filter(Boolean) : [];
      curSector.nganh.push({ name: left, nghe });
      continue;
    }

    // ── Bullet "- Nghề" (AI provider format) ────────────────────────────────
    const bulletMatch = line.match(/^[-–•]\s+(.+)/);
    if (bulletMatch) {
      if (!curSector) curSector = { title: "", nganh: [] };
      // Attach to last nganh, or create anonymous one
      if (!curSector.nganh.length) curSector.nganh.push({ name: "", nghe: [] });
      curSector.nganh[curSector.nganh.length - 1].nghe.push(bulletMatch[1].trim());
      continue;
    }

    // ── "### Ngành: Tên" without jobs (AI format) ───────────────────────────
    const nganhOnlyMatch = line.match(/^###\s+Ng[aà]nh\s*[:：]\s*(.+)/i);
    if (nganhOnlyMatch) {
      if (!curSector) curSector = { title: "", nganh: [] };
      const name = nganhOnlyMatch[1].replace(/\s*\([^)]*\)\s*/g, "").trim();
      curSector.nganh.push({ name, nghe: [] });
      continue;
    }

    // ── Plain line with no colon/bullet — treat as sector if nothing open ───
    if (!curSector) {
      curSector = { title: line, nganh: [] };
    } else if (curSector.nganh.length === 0) {
      // Might be an inline job list for an unnamed major
      curSector.nganh.push({
        name: "",
        nghe: line.split(/[,;]+/).map(j => j.trim()).filter(Boolean),
      });
    }
  }
  flushSector();
  return { sectors, rawLines };
}

function SectorBlock({ sector, si }: { sector: { title: string; nganh: { name: string; nghe: string[] }[] }; si: number }) {
  const [expanded, setExpanded] = useState(false);
  const icon = getSectorIcon(sector.title);

  // Only show nganh entries that actually have content
  const validNganh = sector.nganh.filter((n) => n.nghe.length > 0 || n.name);
  const previewNganh = validNganh.slice(0, 3).map(n => n.name).filter(Boolean);
  const previewNghe = validNganh.flatMap(n => n.nghe).slice(0, 5);
  const totalNghe = validNganh.flatMap(n => n.nghe).length;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <h5 className="font-semibold text-amber-900 flex-1">{sector.title || `Lĩnh vực ${si + 1}`}</h5>
      </div>

      {/* Summary (always visible) */}
      <div className="px-4 pb-3 space-y-2">
        {previewNganh.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">🎓 Ngành tiêu biểu (NEU):</p>
            <ul className="space-y-0.5">
              {previewNganh.map((n, i) => (
                <li key={i} className="text-sm text-amber-900 flex items-start gap-1">
                  <span className="mt-1 text-amber-400">•</span> {n}
                </li>
              ))}
              {sector.nganh.length > 3 && (
                <li className="text-xs text-amber-500 italic">+{sector.nganh.length - 3} ngành khác…</li>
              )}
            </ul>
          </div>
        )}
        {previewNghe.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">💼 Nghề phổ biến:</p>
            <ul className="space-y-0.5">
              {previewNghe.map((j, i) => (
                <li key={i} className="text-sm text-amber-900 flex items-start gap-1">
                  <span className="mt-1 text-amber-400">•</span> {j}
                </li>
              ))}
              {totalNghe > 5 && (
                <li className="text-xs text-amber-500 italic">+{totalNghe - 5} nghề khác…</li>
              )}
            </ul>
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-50"
        >
          {expanded ? "▲ Thu gọn" : "▼ Xem chi tiết"}
        </button>
      </div>

      {/* Full tree (collapsed by default) */}
      {expanded && (
        <div className="border-t border-amber-200 bg-white px-4 py-4 space-y-3">
          <p className="text-sm font-bold text-slate-800">{sector.title || `Lĩnh vực ${si + 1}`}</p>
          {validNganh.map((nganh, ni) => (
            <div key={`detail-${si}-${ni}`} className="pl-2 border-l-2 border-indigo-200">
              {nganh.name && (
                <p className="text-sm font-semibold text-slate-700 mb-1">{nganh.name}</p>
              )}
              <ul className="space-y-0.5">
                {nganh.nghe.map((job, ji) => (
                  <li key={ji} className="text-sm text-slate-600 flex items-start gap-1.5">
                    <span className="text-slate-400 shrink-0">├──</span> {job}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function renderNganhNghe(value: SectionValue) {
  const { sectors, rawLines } = parseNganhNgheData(value);

  // Drop sectors that have no nganh entries with actual content
  const nonEmpty = sectors.filter(
    (s) => s.nganh.length > 0 && s.nganh.some((n) => n.nghe.length > 0 || n.name)
  );

  if (!nonEmpty.length) {
    return (
      <div className="space-y-1 leading-relaxed text-slate-700">
        {rawLines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {nonEmpty.map((sector, si) => (
        <SectorBlock key={`sector-${si}`} sector={sector} si={si} />
      ))}
    </div>
  );
}

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function renderSectionContent(key: string, value: SectionValue, mbtiType?: string, _nameVi?: string) {
  if (key === "phan_tich_cac_chieu_tinh_cach") {
    return renderDimensionAnalysis(value);
  }
  if (key === "nganh_nghe_tuong_ung") {
    return renderNganhNghe(value);
  }
  if (key === "khai_niem") {
    const raw = Array.isArray(value) ? value.join("\n") : value;
    // Normalize: always start with "XXXX là nhóm tính cách..."
    // Backend may have stripped the prefix already, leaving "là nhóm..." bare.
    let body = raw.replace(/^[A-Z]{4}\s*[–\-:]\s*/u, "").trim();
    if (mbtiType) {
      if (/^là\s/i.test(body)) {
        // "là nhóm..." → prepend type code
        body = `${mbtiType} ${body}`;
      } else if (!/^[A-Z]{4}/u.test(body)) {
        // No type prefix at all → add full lead-in
        body = `${mbtiType} là nhóm tính cách ${body.replace(/^là\s+(nhóm\s+tính\s+cách\s+)?/i, "")}`;
      }
    }
    return (
      <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
        {body}
      </p>
    );
  }
  if (BULLET_SECTION_KEYS.has(key)) {
    const bullets = toBullets(value);
    return (
      <ul className="list-disc space-y-1 pl-5 leading-relaxed text-slate-700">
        {bullets.map((item, idx) => (
          <li key={`${key}-${idx}`}>{capitalizeFirst(item)}</li>
        ))}
      </ul>
    );
  }
  return (
    <p className="whitespace-pre-wrap leading-relaxed text-slate-700">
      {Array.isArray(value) ? value.join("\n") : value}
    </p>
  );
}

function getResultSectionTone(key: string) {
  if (key === "diem_manh" || key === "nganh_nghe_tuong_ung" || key === "moi_truong") {
    return {
      card: "border-amber-200 bg-amber-50/60",
      title: "text-amber-900",
    };
  }
  return {
    card: "border-indigo-100 bg-indigo-50/50",
    title: "text-indigo-900",
  };
}

function Result({
  info: { type, nameVi, traits },
  mbtiType,
  answers,
  userName,
  userProfileId,
  onRetry,
}: {
  info: import("./mbti-data").MBTITypeInfo;
  mbtiType: string;
  answers: AnswerRecord;
  userName: string;
  userProfileId: string;
  onRetry: () => void;
}) {
  const dimensionScores = computeMBTIScores(answers);
  const [consultationLoading, setConsultationLoading] = useState(true);
  const [consultationText, setConsultationText] = useState<string | null>(null);
  const [consultationSections, setConsultationSections] = useState<Record<string, SectionValue> | null>(null);
  const [consultationError, setConsultationError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const autoSaveOnceRef = useRef(false);

  useEffect(() => {
    setConsultationLoading(true);
    setConsultationError(null);
    setConsultationText(null);
    setConsultationSections(null);
    fetch(`${AI_API_BASE}/api/ai-consultation?mbtiType=${encodeURIComponent(mbtiType)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Chưa có dữ liệu tư vấn cho tính cách này." : "Tải tư vấn thất bại.");
        }
        return res.json();
      })
      .then((data) => {
        const rawText: string = data.consultation ?? "";
        const sections = data.sections && typeof data.sections === "object" ? data.sections : null;

        // Build normalized entries, keeping all SECTION_DEFS keys even if API missed them
        let normalizedEntries = sections
          ? Object.entries(sections).filter(([, value]) => sectionHasContent(value))
          : [];

        // Client-side fallback: if some expected keys are missing, try to extract from raw text
        if (rawText) {
          const expectedKeys = ["diem_manh", "diem_yeu", "moi_truong"];
          const presentKeys = new Set(normalizedEntries.map(([k]) => k));
          const missingKeys = expectedKeys.filter((k) => !presentKeys.has(k));
          if (missingKeys.length > 0) {
            const fallback = extractFallbackSections(rawText, missingKeys);
            for (const [k, v] of Object.entries(fallback)) {
              if (sectionHasContent(v)) normalizedEntries.push([k, v]);
            }
          }
        }

        // Last-resort static fallback: guarantee diem_manh & diem_yeu always present
        const presentAfterFallback = new Set(normalizedEntries.map(([k]) => k));
        const type = mbtiType as keyof typeof STATIC_DIEM_MANH;
        if (!presentAfterFallback.has("diem_manh") && STATIC_DIEM_MANH[type]) {
          normalizedEntries.push(["diem_manh", STATIC_DIEM_MANH[type]]);
        }
        if (!presentAfterFallback.has("diem_yeu") && STATIC_DIEM_YEU[type]) {
          normalizedEntries.push(["diem_yeu", STATIC_DIEM_YEU[type]]);
        }

        if (normalizedEntries.length) {
          setConsultationSections(Object.fromEntries(normalizedEntries) as Record<string, SectionValue>);
        }
        setConsultationText(rawText);
      })
      .catch((err) => {
        setConsultationError(err.message || "Không tải được lời tư vấn.");
      })
      .finally(() => {
        setConsultationLoading(false);
      });
  }, [mbtiType]);

  const handleSaveSession = useCallback(async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(null);

    const trimmedName = userName.trim();
    const trimmedProfile = userProfileId.trim();
    if (!trimmedName) {
      setSaveLoading(false);
      setSaveError("Vui lòng nhập tên.");
      return;
    }
    if (!trimmedProfile) {
      setSaveLoading(false);
      setSaveError("Vui lòng nhập mã hồ sơ.");
      return;
    }

    const answersPayload = MBTI_QUESTIONS.map((q, idx) => ({
      question_number: idx + 1,
      answer_value: answers[q.id],
    }));

    if (answersPayload.some((a) => typeof a.answer_value !== "number")) {
      setSaveLoading(false);
      setSaveError("Thiếu câu trả lời. Vui lòng làm lại bài trắc nghiệm.");
      return;
    }

    try {
      const resp = await fetch(`${LOG_API_BASE}/api/mbti/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_name: trimmedName,
          user_profile_id: trimmedProfile,
          mbti_result: mbtiType,
          answers: answersPayload,
        }),
      });

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        let msg = "Lưu kết quả thất bại.";
        try {
          const data = text ? JSON.parse(text) : null;
          msg = data?.error || msg;
        } catch {
          // ignore JSON parse error
        }
        throw new Error(`${msg} (HTTP ${resp.status})`);
      }

      await resp.json().catch(() => null);
      setSaveSuccess("Đã lưu kết quả vào cơ sở dữ liệu.");
    } catch (e: any) {
      setSaveError(e?.message || "Lưu kết quả thất bại.");
    } finally {
      setSaveLoading(false);
    }
  }, [answers, mbtiType, userName, userProfileId]);

  // Auto-save once when arriving at Result (avoid StrictMode double-call)
  useEffect(() => {
    if (autoSaveOnceRef.current) return;
    if (!userName.trim() || !userProfileId.trim()) return;
    autoSaveOnceRef.current = true;
    void handleSaveSession();
  }, [handleSaveSession, userName, userProfileId]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg bg-indigo-100 px-4 py-2 text-2xl font-bold text-indigo-800">{type}</span>
          <h2 className="text-xl font-semibold text-slate-800">{nameVi}</h2>
        </div>
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-700">Điểm nhấn kết quả</p>
          <p className="mt-1 text-sm text-amber-900">
            Nhóm <strong>{type}</strong> nổi bật ở đặc trưng <strong>{traits[0]}</strong>. Ưu tiên đọc kỹ mục{" "}
            <strong>Điểm mạnh</strong> và <strong>Ngành, nghề tương ứng</strong> để chọn hướng phù hợp.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {traits.map((trait) => (
            <span key={trait} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {trait}
            </span>
          ))}
        </div>
      </div>

      {/* Lưu kết quả vào DB */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800">Lưu kết quả vào hồ sơ</h3>
        <p className="mt-1 text-sm text-slate-600">
          Hệ thống sẽ lưu lần làm bài này theo hồ sơ: <strong className="font-semibold text-slate-900">{userName.trim() || "—"}</strong>{" "}
          (<strong className="font-semibold text-slate-900">{userProfileId.trim() || "—"}</strong>).
        </p>

        {saveLoading && (
          <p className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800">
            Đang lưu kết quả...
          </p>
        )}
        {saveError && (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800">
            {saveError}
          </p>
        )}
        {saveSuccess && (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
            {saveSuccess}
          </p>
        )}

        {saveError && (
          <button
            type="button"
            onClick={handleSaveSession}
            disabled={saveLoading}
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-white sm:w-auto"
          >
            {saveLoading ? "Đang lưu..." : "Thử lưu lại"}
          </button>
        )}
      </div>

      {/* Octagon Diagram */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-1 font-semibold text-slate-800">Biểu đồ 4 chiều tính cách</h3>
        <p className="mb-4 text-xs text-slate-500">
          Thanh bar thể hiện mức độ nghiêng về phía nào trên mỗi trục. Càng dài = càng rõ rệt.
        </p>
        <OctagonDiagram scores={dimensionScores} />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="font-semibold text-slate-800">Tư vấn AI theo hồ sơ MBTI</h3>
        {consultationLoading && (
          <div className="mt-3 flex items-center gap-2 text-indigo-600">
            <svg
              className="h-5 w-5 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Đang tải lời tư vấn...</span>
          </div>
        )}
        {!consultationLoading && consultationError && (
          <p className="mt-3 text-sm text-amber-700">{consultationError}</p>
        )}
        {!consultationLoading && consultationSections && (
          <div className="mt-4 space-y-4">
            {[
              { key: "ten_tinh_cach", label: "TÊN TÍNH CÁCH" },
              { key: "khai_niem", label: "KHÁI NIỆM" },
              { key: "phan_tich_cac_chieu_tinh_cach", label: "PHÂN TÍCH CÁC CHIỀU TÍNH CÁCH" },
              { key: "diem_manh", label: "ĐIỂM MẠNH" },
              { key: "diem_yeu", label: "ĐIỂM YẾU" },
              { key: "moi_truong", label: "MÔI TRƯỜNG" },
              { key: "nganh_nghe_tuong_ung", label: "NGÀNH, NGHỀ TƯƠNG ỨNG" },
            ]
              .filter((item) => consultationSections[item.key])
              .map((item) => {
                const tone = getResultSectionTone(item.key);
                return (
                <section key={item.key} className={`space-y-2 rounded-lg border px-4 py-3 ${tone.card}`}>
                  <h4 className={`text-sm font-semibold ${tone.title}`}>{item.label}</h4>
                  {renderSectionContent(item.key, consultationSections[item.key] as SectionValue, type, nameVi)}
                </section>
                );
              })}
          </div>
        )}
        {!consultationLoading && !consultationSections && consultationText && (
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-slate-700">{consultationText}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Làm lại bài trắc nghiệm
      </button>
    </div>
  );
}