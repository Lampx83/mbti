import { useCallback, useEffect, useState } from "react";
import { MBTI_TYPE_INFO } from "./mbti-data";
import { API_BASE } from "./config/env";

const TOKEN_KEY = "mbti_admin_token";

type SessionRow = {
  id: number;
  user_name: string;
  user_profile_id: string;
  mbti_result: string;
  created_at: string;
  ai_provider: string | null;
  ai_created_at: string | null;
};

type StatsResp = {
  total: number;
  distribution: { mbti_result: string; n: number }[];
  recent: { id: number; user_name: string; user_profile_id: string; mbti_result: string; created_at: string }[];
};

type SessionDetail = {
  session: { id: number; user_name: string; user_profile_id: string; mbti_result: string; created_at: string };
  answers: { question_number: number; answer_value: number }[];
  ai_consultation: {
    provider: string;
    consultation: string | null;
    sections: Record<string, string> | null;
    object_name: string | null;
    created_at: string;
  } | null;
};

function authHeader(token: string): HeadersInit {
  return { Authorization: `Basic ${token}` };
}

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("vi-VN", { hour12: false });
  } catch {
    return s;
  }
}

export default function AdminPage({ onExit }: { onExit: () => void }) {
  const [token, setToken] = useState<string>(() => sessionStorage.getItem(TOKEN_KEY) || "");

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
  }, []);

  const handleLoggedIn = useCallback((t: string) => {
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900">Trang quản trị MBTI</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Quay lại trang chính
          </button>
          {token && (
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
            >
              Đăng xuất
            </button>
          )}
        </div>
      </div>

      {!token ? <LoginForm onLoggedIn={handleLoggedIn} /> : <Dashboard token={token} onUnauthorized={handleLogout} />}
    </div>
  );
}

function LoginForm({ onLoggedIn }: { onLoggedIn: (token: string) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setLoading(true);
      try {
        const resp = await fetch(`${API_BASE}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ username, password }),
        });
        if (!resp.ok) {
          const data = await resp.json().catch(() => null);
          throw new Error(data?.error || `Đăng nhập thất bại (HTTP ${resp.status})`);
        }
        const data = await resp.json();
        if (!data?.token) throw new Error("Không nhận được token");
        onLoggedIn(data.token);
      } catch (err: any) {
        setError(err?.message || "Đăng nhập thất bại");
      } finally {
        setLoading(false);
      }
    },
    [username, password, onLoggedIn],
  );

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Tài khoản</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          autoComplete="username"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Mật khẩu</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
          autoComplete="current-password"
          required
        />
      </div>
      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
      )}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-70"
      >
        {loading ? "Đang đăng nhập..." : "Đăng nhập"}
      </button>
    </form>
  );
}

function Dashboard({ token, onUnauthorized }: { token: string; onUnauthorized: () => void }) {
  const [stats, setStats] = useState<StatsResp | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const limit = 25;

  const handle401 = useCallback(
    (resp: Response) => {
      if (resp.status === 401) onUnauthorized();
    },
    [onUnauthorized],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [statsResp, sessResp] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`, { headers: authHeader(token), credentials: "include" }),
        fetch(`${API_BASE}/api/admin/sessions?limit=${limit}&offset=${offset}`, {
          headers: authHeader(token),
          credentials: "include",
        }),
      ]);
      if (statsResp.status === 401 || sessResp.status === 401) {
        handle401(statsResp.status === 401 ? statsResp : sessResp);
        return;
      }
      if (!statsResp.ok) throw new Error("Tải thống kê thất bại");
      if (!sessResp.ok) throw new Error("Tải danh sách session thất bại");
      const statsJson: StatsResp = await statsResp.json();
      const sessJson = await sessResp.json();
      setStats(statsJson);
      setSessions(sessJson.rows || []);
      setTotal(sessJson.total || 0);
    } catch (err: any) {
      setError(err?.message || "Lỗi tải dữ liệu");
    } finally {
      setLoading(false);
    }
  }, [token, offset, handle401]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleDownload = useCallback(async () => {
    try {
      const resp = await fetch(`${API_BASE}/api/admin/export`, {
        headers: authHeader(token),
        credentials: "include",
      });
      if (resp.status === 401) {
        onUnauthorized();
        return;
      }
      if (!resp.ok) throw new Error(`Tải CSV thất bại (HTTP ${resp.status})`);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = resp.headers.get("Content-Disposition") || "";
      const m = /filename="?([^"]+)"?/.exec(cd);
      a.download = m?.[1] || `mbti-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err?.message || "Tải CSV thất bại");
    }
  }, [token, onUnauthorized]);

  if (loading && !stats) return <p className="text-sm text-slate-600">Đang tải dữ liệu quản trị...</p>;
  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</p>
        <button
          type="button"
          onClick={() => void loadAll()}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Thử lại
        </button>
      </div>
    );
  }

  const distMap = new Map((stats?.distribution ?? []).map((d) => [d.mbti_result, d.n]));
  const total16 = Object.keys(MBTI_TYPE_INFO);
  const distArray = total16
    .map((code) => ({ code, n: distMap.get(code) || 0 }))
    .sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...distArray.map((d) => d.n));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Tổng số bài làm" value={String(stats?.total ?? 0)} tone="indigo" />
        <StatCard
          label="Số nhóm MBTI xuất hiện"
          value={String(distArray.filter((d) => d.n > 0).length) + " / 16"}
          tone="emerald"
        />
        <button
          type="button"
          onClick={handleDownload}
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-left transition hover:bg-emerald-100"
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Xuất dữ liệu</p>
          <p className="mt-1 text-base font-semibold text-emerald-900">⬇ Tải CSV toàn bộ</p>
          <p className="mt-1 text-xs text-emerald-700">Sessions + Answers + AI consultation</p>
        </button>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 font-semibold text-slate-900">Phân bố 16 nhóm MBTI</h3>
        <DistributionBars data={distArray} maxN={maxN} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900">
            Danh sách bài làm ({total} tổng cộng)
          </h3>
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - limit))}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              ← Trước
            </button>
            <span className="text-slate-600">
              {Math.min(offset + 1, total)}–{Math.min(offset + sessions.length, total)} / {total}
            </span>
            <button
              type="button"
              disabled={offset + sessions.length >= total}
              onClick={() => setOffset(offset + limit)}
              className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 disabled:opacity-50"
            >
              Sau →
            </button>
          </div>
        </div>
        <SessionsTable rows={sessions} onSelect={(id) => setSelectedId(id)} />
      </section>

      {selectedId !== null && (
        <SessionDetailModal
          token={token}
          sessionId={selectedId}
          onClose={() => setSelectedId(null)}
          onUnauthorized={onUnauthorized}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone: "indigo" | "emerald" }) {
  const cls =
    tone === "indigo"
      ? "border-indigo-200 bg-indigo-50 text-indigo-900"
      : "border-emerald-200 bg-emerald-50 text-emerald-900";
  return (
    <div className={`rounded-xl border px-4 py-4 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function DistributionBars({ data, maxN }: { data: { code: string; n: number }[]; maxN: number }) {
  return (
    <div className="space-y-2">
      {data.map(({ code, n }) => {
        const pct = maxN > 0 ? (n / maxN) * 100 : 0;
        const nameVi = (MBTI_TYPE_INFO as any)[code]?.nameVi ?? "";
        return (
          <div key={code} className="flex items-center gap-3 text-sm">
            <div className="w-32 shrink-0">
              <span className="font-mono font-semibold text-slate-900">{code}</span>
              <span className="ml-2 text-xs text-slate-500">{nameVi}</span>
            </div>
            <div className="flex-1 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-5 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-12 text-right font-mono text-sm font-medium text-slate-700">{n}</div>
          </div>
        );
      })}
    </div>
  );
}

function SessionsTable({ rows, onSelect }: { rows: SessionRow[]; onSelect: (id: number) => void }) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">Chưa có dữ liệu.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
          <tr>
            <th className="px-3 py-2">ID</th>
            <th className="px-3 py-2">Tên</th>
            <th className="px-3 py-2">Mã hồ sơ</th>
            <th className="px-3 py-2">MBTI</th>
            <th className="px-3 py-2">AI Provider</th>
            <th className="px-3 py-2">Thời gian</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-xs text-slate-500">#{r.id}</td>
              <td className="px-3 py-2">{r.user_name}</td>
              <td className="px-3 py-2 font-mono text-xs">{r.user_profile_id}</td>
              <td className="px-3 py-2">
                <span className="rounded bg-indigo-100 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-800">
                  {r.mbti_result}
                </span>
              </td>
              <td className="px-3 py-2 text-xs text-slate-600">{r.ai_provider || "—"}</td>
              <td className="px-3 py-2 text-xs text-slate-600">{formatDate(r.created_at)}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onSelect(r.id)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                >
                  Chi tiết
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SessionDetailModal({
  token,
  sessionId,
  onClose,
  onUnauthorized,
}: {
  token: string;
  sessionId: number;
  onClose: () => void;
  onUnauthorized: () => void;
}) {
  const [data, setData] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${API_BASE}/api/admin/sessions/${sessionId}`, {
      headers: authHeader(token),
      credentials: "include",
    })
      .then(async (resp) => {
        if (resp.status === 401) {
          onUnauthorized();
          throw new Error("Phiên đăng nhập hết hạn");
        }
        if (!resp.ok) throw new Error(`Tải chi tiết thất bại (HTTP ${resp.status})`);
        return resp.json();
      })
      .then((d) => setData(d))
      .catch((e: any) => setError(e?.message || "Lỗi"))
      .finally(() => setLoading(false));
  }, [sessionId, token, onUnauthorized]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 px-4 py-8" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Chi tiết bài làm #{sessionId}</h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-500 hover:text-slate-900">
            ×
          </button>
        </div>
        {loading && <p className="text-sm text-slate-600">Đang tải...</p>}
        {error && <p className="text-sm text-amber-700">{error}</p>}
        {data && (
          <div className="space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Tên" value={data.session.user_name} />
                <Field label="Mã hồ sơ" value={data.session.user_profile_id} />
                <Field label="Kết quả MBTI" value={data.session.mbti_result} />
                <Field label="Thời gian" value={formatDate(data.session.created_at)} />
              </div>
            </div>

            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-900">20 câu trả lời</h4>
              <div className="grid grid-cols-5 gap-2 text-center text-xs sm:grid-cols-10">
                {data.answers.map((a) => (
                  <div key={a.question_number} className="rounded border border-slate-200 bg-white px-2 py-1">
                    <div className="font-mono text-slate-500">Q{a.question_number}</div>
                    <div className="text-base font-bold text-indigo-700">{a.answer_value}</div>
                  </div>
                ))}
              </div>
            </section>

            {data.ai_consultation && (
              <section>
                <h4 className="mb-2 text-sm font-semibold text-slate-900">
                  Lời tư vấn AI ({data.ai_consultation.provider})
                </h4>
                {data.ai_consultation.sections ? (
                  <div className="space-y-2">
                    {Object.entries(data.ai_consultation.sections).map(([k, v]) => (
                      <details key={k} className="rounded border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm font-semibold text-slate-800">{k}</summary>
                        <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{String(v)}</pre>
                      </details>
                    ))}
                  </div>
                ) : (
                  <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    {data.ai_consultation.consultation || "(trống)"}
                  </pre>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-900">{value}</p>
    </div>
  );
}

