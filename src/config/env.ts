function normalizeBase(input: unknown): string {
  const s = typeof input === "string" ? input.trim() : "";
  return s ? s.replace(/\/+$/, "") : "";
}

function derivePortalEmbeddedApiBase(): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  // Heuristic for NEU tuyển sinh Portal pages:
  //   /tuyen-sinh/tools/<appId>
  //   /tuyen-sinh/embed/<appId>/
  // Backend embedded base is mounted at:
  //   /tuyen-sinh/api/apps/<appId>
  if (!origin.includes("neu.edu.vn")) return "";
  if (!pathname.startsWith("/tuyen-sinh/")) return "";
  const appId = "mbti-career-neu";
  return `${origin}/tuyen-sinh/api/apps/${appId}`;
}

declare global {
  interface Window {
    __WRITE_API_BASE__?: string;
  }
}

// Priority (API_BASE):
//  1) VITE_API_BASE (build-time, Vite standard)
//  2) __VITE_API_BASE__ (legacy: injected via vite.define)
//  3) window.__WRITE_API_BASE__ (Portal runtime inject)
//  4) derived Portal embedded base (when running on ai.neu.edu.vn)
//  5) "" (same-origin)
const apiFromVite = normalizeBase((import.meta as any).env?.VITE_API_BASE);
const apiFromDefine = normalizeBase((import.meta as any).env?.__VITE_API_BASE__);
const apiFromPortal = typeof window !== "undefined" ? normalizeBase(window.__WRITE_API_BASE__) : "";
const apiFromDerivedPortal = derivePortalEmbeddedApiBase();

export const API_BASE = apiFromVite || apiFromDefine || apiFromPortal || apiFromDerivedPortal || "";

// Priority (AI_BASE):
//  1) VITE_AI_BASE (build-time)
//  2) __VITE_AI_BASE__ (legacy: injected via vite.define)
//  3) fallback to API_BASE
const aiFromVite = normalizeBase((import.meta as any).env?.VITE_AI_BASE);
const aiFromDefine = normalizeBase((import.meta as any).env?.__VITE_AI_BASE__);

export const AI_BASE = aiFromVite || aiFromDefine || API_BASE;