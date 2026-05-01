import { API_BASE } from "../config/env";

export async function saveSession(data: unknown) {
  return fetch(`${API_BASE}/api/mbti/sessions`, { /* ... */ });
}