import { AI_BASE } from "../config/env";

export async function getConsultation(mbti: string) {
  return fetch(`${AI_BASE}/api/ai-consultation?mbtiType=${encodeURIComponent(mbti)}`, { /* ... */ });
}