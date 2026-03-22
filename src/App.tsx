import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { MBTI_QUESTIONS, MBTI_TYPE_INFO } from "./mbti-data";
import type { MBTIQuestion } from "./mbti-data";
import { computeMBTI, type AnswerRecord } from "./mbti-score";

type Step = "intro" | "quiz" | "result";
type SectionValue = string | string[];

const totalQuestions = MBTI_QUESTIONS.length;
const API_BASE = (import.meta.env.VITE_API_BASE ?? "https://mbti-career-neu.vercel.app").replace(/\/$/, "");
const BULLET_SECTION_KEYS = new Set(["diem_manh", "diem_yeu", "moi_truong"]);
const QUIZ_SCALE_OPTIONS = [
  { value: 7, size: 38, color: "#059669", glow: "rgba(5, 150, 105, 0.24)", label: "Hoàn toàn đồng ý" },
  { value: 6, size: 32, color: "#10b981", glow: "rgba(16, 185, 129, 0.22)", label: "Rất đồng ý" },
  { value: 5, size: 26, color: "#6ee7b7", glow: "rgba(110, 231, 183, 0.2)", label: "Đồng ý" },
  { value: 4, size: 20, color: "#94a3b8", glow: "rgba(148, 163, 184, 0.2)", label: "Trung lập" },
  { value: 3, size: 26, color: "#c4b5fd", glow: "rgba(196, 181, 253, 0.22)", label: "Không đồng ý" },
  { value: 2, size: 32, color: "#a78bfa", glow: "rgba(167, 139, 250, 0.24)", label: "Rất không đồng ý" },
  { value: 1, size: 38, color: "#8b5cf6", glow: "rgba(139, 92, 246, 0.24)", label: "Hoàn toàn không đồng ý" },
] as const;

export default function App() {
  const [step, setStep] = useState<Step>("intro");
  const [answers, setAnswers] = useState<AnswerRecord>({});
  const [quizNotice, setQuizNotice] = useState<string | null>(null);
  const [showMissingState, setShowMissingState] = useState(false);

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
    setStep("quiz");
    setAnswers({});
    setQuizNotice(null);
    setShowMissingState(false);
  }, []);

  const handleRetry = useCallback(() => {
    setStep("intro");
    setAnswers({});
    setQuizNotice(null);
    setShowMissingState(false);
  }, []);

  const resultType = step === "result" ? computeMBTI(answers) : null;
  const resultInfo = resultType ? MBTI_TYPE_INFO[resultType] : null;
  const mainClassName =
    step === "quiz" ? "mx-auto max-w-5xl px-4 py-8 sm:px-6" : "mx-auto max-w-3xl px-4 py-8 sm:px-6";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(226,232,240,0.95)_45%,_rgba(241,245,249,1)_100%)] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">Tư vấn hướng nghiệp</h1>
          <p className="text-sm text-slate-600">Đại học Kinh tế Quốc dân (NEU)</p>
        </div>
      </header>

      <main className={mainClassName}>
        {step === "intro" && <Intro onStart={handleStart} />}

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
          />
        )}

        {step === "result" && resultInfo && resultType && (
          <Result info={resultInfo} mbtiType={resultType} onRetry={handleRetry} />
        )}
      </main>

      <footer className="mt-12 border-t border-slate-200 py-5 text-center text-sm text-slate-600">
        Công cụ tham khảo, không thay thế tư vấn chuyên nghiệp. © NEU
      </footer>
    </div>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden rounded-[2rem] bg-white px-6 py-8 text-slate-900 shadow-[0_24px_80px_rgba(15,23,42,0.08)] ring-1 ring-slate-200 sm:px-8 sm:py-10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.12),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(14,165,233,0.08),_transparent_30%)]" />
      <div className="relative space-y-6">
        <div className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-indigo-700">
          MBTI Career Match
        </div>

        <div className="space-y-4">
          <h2 className="max-w-2xl text-3xl font-semibold leading-tight text-slate-900 sm:text-4xl">
            Khám phá tính cách và nhóm nghề phù hợp với bạn tại NEU.
          </h2>
          <p className="max-w-2xl text-base leading-7 text-slate-700 sm:text-lg">
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

        <button
          type="button"
          onClick={onStart}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white sm:w-auto"
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
}: {
  questions: MBTIQuestion[];
  answers: AnswerRecord;
  answeredCount: number;
  progress: number;
  notice: string | null;
  showMissingState: boolean;
  onAnswer: (questionId: string, rating: number) => void;
  onViewResult: () => void;
}) {
  const remainingCount = questions.length - answeredCount;

  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] bg-white/95 p-5 shadow-sm ring-1 ring-slate-200/80 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Danh sách câu hỏi</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Hoàn thành toàn bộ câu hỏi trên một trang</h2>
            <p className="text-sm leading-6 text-slate-600 sm:text-base">
              Chọn đáp án trực tiếp trên từng dòng câu hỏi. Hệ thống không tự chuyển câu và chỉ cho xem kết quả khi bạn đã trả lời đủ.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:min-w-[300px]">
            <SummaryStat label="Đã trả lời" value={`${answeredCount}/${questions.length}`} tone="emerald" />
            <SummaryStat label="Còn lại" value={`${remainingCount}`} tone="amber" />
          </div>
        </div>

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
              className={`rounded-[1.5rem] border bg-white p-5 shadow-sm transition sm:p-6 ${
                isMissing
                  ? "border-amber-300 shadow-[0_12px_40px_rgba(245,158,11,0.12)]"
                  : "border-slate-200/80"
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

              <div className="mt-5 rounded-[1.25rem] bg-slate-50 px-4 py-4 ring-1 ring-slate-200/80 sm:px-5">
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.16em] sm:text-xs">
                  <span className="text-emerald-700">Đồng ý</span>
                  <span className="text-violet-700">Không đồng ý</span>
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

      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 text-slate-900 shadow-[0_24px_70px_rgba(15,23,42,0.08)] sm:p-6">
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
            className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 focus:ring-offset-white"
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
    <div className={`rounded-2xl px-4 py-4 ring-1 ${toneClassName}`}>
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

function formatDimensionLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed) return "";

  const formattedMatch = trimmed.match(/^([A-Za-z]+)\s*[-–—]\s*\(([^)]+)\)\s*:\s*(.+)$/);
  if (formattedMatch) {
    const [, dim, vn, rest] = formattedMatch;
    return `${dim} – (${vn.trim()}): ${rest.trim()}`;
  }

  const match = trimmed.match(/^([A-Za-z]+)\s*[-–—]\s*(.+)$/);
  if (!match) return trimmed;

  const [, dim, restRaw] = match;
  const rest = restRaw.trim();
  if (!rest) return trimmed;

  if (rest.startsWith("(")) return `${dim} – ${rest}`;

  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length < 2) return trimmed;

  const first = words[0];
  const firstNorm = normalizeForMatch(first);
  const stopStarts = new Set([
    "ho",
    "cac",
    "nhung",
    "nguoi",
    "istj",
    "intj",
    "intp",
    "entj",
    "entp",
    "infj",
    "infp",
    "enfj",
    "enfp",
    "istp",
    "isfp",
    "estj",
    "estp",
    "esfj",
    "esfp",
    "isfj",
  ]);
  if (stopStarts.has(firstNorm) || /^[A-Z]{4}$/.test(first)) return trimmed;

  const vn = `${words[0]} ${words[1]}`.trim();
  const description = words.slice(2).join(" ").trim();
  if (!description) return trimmed;

  return `${dim} – (${vn}): ${description}`;
}

function renderDimensionAnalysis(value: SectionValue) {
  let lines = toLines(value);
  if (lines.length <= 1) {
    lines = toBullets(value);
  }
  const normalized = lines.map(formatDimensionLine).filter(Boolean);

  if (!normalized.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 leading-relaxed text-slate-700">
      {normalized.map((item, idx) => (
        <li key={`dim-${idx}`}>{item}</li>
      ))}
    </ul>
  );
}

function renderNganhNghe(value: SectionValue) {
  const stripBulletPrefix = (line: string) => line.replace(/^[-–•]\s+/, "").trim();
  const lines = toLines(value).map(stripBulletPrefix).filter(Boolean);
  if (!lines.length) return null;

  const normalizedLines = lines.map(normalizeForMatch);
  const hasOldHeading =
    normalizedLines.some((line) => line === "nganh tai neu") &&
    normalizedLines.some((line) => line === "nghe nghiep tuong ung");
  const hasInlineJobs = lines.some((line) => /Nghề\s+nghiệp\s+tương\s+ứng\s*[:\-]/i.test(line));
  if (hasOldHeading && !hasInlineJobs) {
    return (
      <div className="space-y-1">
        {lines.map((line, idx) => {
          const normalized = normalizeForMatch(line);
          const isHeading =
            normalized.startsWith("nganh tai neu") ||
            normalized.startsWith("nghe nghiep tuong ung") ||
            normalized.startsWith("nganh, nghe tuong ung");
          return (
            <p key={`${idx}-${line}`} className="leading-relaxed text-slate-700">
              {isHeading ? <strong>{line}</strong> : line}
            </p>
          );
        })}
      </div>
    );
  }

  const isGroupHeaderLine = (line: string) => {
    const normalized = normalizeForMatch(line);
    return (
      normalized.startsWith("nhom nganh") ||
      normalized.startsWith("linh vuc") ||
      normalized.startsWith("khoi nganh") ||
      normalized.startsWith("nhom linh vuc")
    );
  };
  const jobsHeaderRe = /Nghề\s+nghiệp\s+tương\s+ứng\s*[:\-]?\s*/i;
  const codeRe = /\(([\d][\w_.]*(?:_[\w.]+)*)\)/;
  const splitJobs = (text: string) =>
    text
      .split(/[,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);

  type NganhItem = { major: string; jobs: string[] };
  type NganhGroup = { title?: string; items: NganhItem[] };

  const groups: NganhGroup[] = [];
  let currentGroup: NganhGroup = { title: undefined, items: [] };
  let currentItem: NganhItem | null = null;
  let lastWasJobs = false;

  const flushItem = () => {
    if (currentItem && (currentItem.major || currentItem.jobs.length)) {
      currentGroup.items.push(currentItem);
    }
    currentItem = null;
    lastWasJobs = false;
  };
  const flushGroup = () => {
    flushItem();
    if (currentGroup.title || currentGroup.items.length) groups.push(currentGroup);
    currentGroup = { title: undefined, items: [] };
    lastWasJobs = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isGroupHeaderLine(line)) {
      flushGroup();
      currentGroup.title = line;
      continue;
    }

    if (jobsHeaderRe.test(line)) {
      const jobsText = line.replace(jobsHeaderRe, "").trim();
      if (!currentItem) currentItem = { major: "", jobs: [] };
      if (jobsText) currentItem.jobs.push(...splitJobs(jobsText));
      lastWasJobs = true;
      continue;
    }

    if (codeRe.test(line) && line.includes(":")) {
      const [majorPart, jobsPartRaw] = line.split(/:(.+)/).map((part) => part.trim());
      const jobsPart = jobsPartRaw ? jobsPartRaw.trim() : "";
      flushItem();
      currentItem = { major: majorPart || line, jobs: jobsPart ? splitJobs(jobsPart) : [] };
      lastWasJobs = false;
      continue;
    }

    const isMajor = codeRe.test(line);
    if (isMajor) {
      flushItem();
      currentItem = { major: line, jobs: [] };
      lastWasJobs = false;
      continue;
    }

    if (currentItem && lastWasJobs) {
      currentItem.jobs.push(...splitJobs(line));
      continue;
    }

    if (currentItem && !currentItem.jobs.length) {
      currentItem.major = `${currentItem.major} ${line}`.trim();
      continue;
    }

    flushItem();
    currentItem = { major: line, jobs: [] };
    lastWasJobs = false;
  }
  flushGroup();

  if (!groups.length) {
    return (
      <div className="space-y-1">
        {lines.map((line, idx) => (
          <p key={`${idx}-${line}`} className="leading-relaxed text-slate-700">
            {line}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group, idx) => (
        <div key={`group-${idx}`} className="space-y-2">
          {group.title && <p className="font-semibold text-slate-800">{group.title}</p>}
          <div className="space-y-3">
            {group.items.map((item, itemIdx) => (
              <div
                key={`item-${idx}-${itemIdx}`}
                className="rounded-lg border border-slate-100 bg-slate-50/40 px-3 py-2"
              >
                {item.major && <p className="font-medium text-slate-800">{item.major}</p>}
                {item.jobs.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-700">
                    {item.jobs.map((job, jobIdx) => (
                      <li key={`job-${idx}-${itemIdx}-${jobIdx}`}>{job}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function renderSectionContent(key: string, value: SectionValue) {
  if (key === "phan_tich_cac_chieu_tinh_cach") {
    return renderDimensionAnalysis(value);
  }
  if (key === "nganh_nghe_tuong_ung") {
    return renderNganhNghe(value);
  }
  if (BULLET_SECTION_KEYS.has(key)) {
    const bullets = toBullets(value);
    return (
      <ul className="list-disc space-y-1 pl-5 leading-relaxed text-slate-700">
        {bullets.map((item, idx) => (
          <li key={`${key}-${idx}`}>{item}</li>
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

function Result({
  info: { type, nameVi, traits },
  mbtiType,
  onRetry,
}: {
  info: import("./mbti-data").MBTITypeInfo;
  mbtiType: string;
  onRetry: () => void;
}) {
  const [consultationLoading, setConsultationLoading] = useState(true);
  const [consultationText, setConsultationText] = useState<string | null>(null);
  const [consultationSections, setConsultationSections] = useState<Record<string, SectionValue> | null>(null);
  const [consultationError, setConsultationError] = useState<string | null>(null);

  useEffect(() => {
    setConsultationLoading(true);
    setConsultationError(null);
    setConsultationText(null);
    setConsultationSections(null);
    fetch(`${API_BASE}/api/ai-consultation?mbtiType=${encodeURIComponent(mbtiType)}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(res.status === 404 ? "Chưa có dữ liệu tư vấn cho tính cách này." : "Tải tư vấn thất bại.");
        }
        return res.json();
      })
      .then((data) => {
        const sections = data.sections && typeof data.sections === "object" ? data.sections : null;
        const normalizedEntries = sections
          ? Object.entries(sections).filter(([, value]) => sectionHasContent(value))
          : [];
        if (normalizedEntries.length) {
          setConsultationSections(Object.fromEntries(normalizedEntries) as Record<string, SectionValue>);
        }
        setConsultationText(data.consultation ?? "");
      })
      .catch((err) => {
        setConsultationError(err.message || "Không tải được lời tư vấn.");
      })
      .finally(() => {
        setConsultationLoading(false);
      });
  }, [mbtiType]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/60">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-xl bg-indigo-100 px-4 py-2 text-2xl font-bold text-indigo-800">{type}</span>
          <h2 className="text-xl font-semibold text-slate-800">{nameVi}</h2>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {traits.map((trait) => (
            <span key={trait} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-600">
              {trait}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/60">
        <h3 className="font-semibold text-slate-800">Tư vấn AI</h3>
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
              .map((item) => (
                <section key={item.key} className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-700">{item.label}</h4>
                  {renderSectionContent(item.key, consultationSections[item.key] as SectionValue)}
                </section>
              ))}
          </div>
        )}
        {!consultationLoading && !consultationSections && consultationText && (
          <p className="mt-3 whitespace-pre-wrap leading-relaxed text-slate-700">{consultationText}</p>
        )}
      </div>

      <button
        type="button"
        onClick={onRetry}
        className="w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        Làm lại bài trắc nghiệm
      </button>
    </div>
  );
}
