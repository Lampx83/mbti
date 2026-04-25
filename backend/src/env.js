/**
 * Cấu hình biến môi trường cho MBTI backend.
 * Standalone: đọc backend/.env.
 * Embedded (Portal): đọc {appDir}/.env và OVERRIDE Portal env (MINIO_ENDPOINT của Portal != MBTI).
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// override: true → giá trị trong .env của MBTI thắng env Portal đã set (vd MINIO_*)
dotenv.config({ path: path.resolve(__dirname, "..", ".env"), override: true });
dotenv.config();

export function getEnv(key, defaultValue = "") {
  const v = typeof process.env[key] === "string" ? process.env[key].trim() : "";
  return v !== "" ? v : defaultValue;
}

export const RUN_MODE = getEnv("RUN_MODE", "standalone");
export const PORT = Number(getEnv("PORT", "4000"));
export const DB_SCHEMA = getEnv("DB_SCHEMA", "mbti_career");

export const ADMIN_USERNAME = getEnv("ADMIN_USERNAME", "admin");
export const ADMIN_PASSWORD = getEnv("ADMIN_PASSWORD", "admin123");

/**
 * Standalone: DATABASE_URL hoặc build từ POSTGRES_*.
 * Embedded (AI Portal): Portal set PORTAL_DATABASE_URL và app dùng schema riêng (mbti_career).
 */
export const DATABASE_URL =
  getEnv("DATABASE_URL") ||
  getEnv("PORTAL_DATABASE_URL") ||
  (() => {
    const host = getEnv("POSTGRES_HOST", "localhost");
    const port = getEnv("POSTGRES_PORT", "5432");
    const user = getEnv("POSTGRES_USER", "postgres");
    const password = getEnv("POSTGRES_PASSWORD", "postgres");
    const db = getEnv("POSTGRES_DB", "mbti_career");
    const enc = encodeURIComponent;
    return `postgresql://${enc(user)}:${enc(password)}@${host}:${port}/${enc(db)}`;
  })();

export const MINIO_ENDPOINT = getEnv("MINIO_ENDPOINT");
export const MINIO_PORT = Number(getEnv("MINIO_PORT", "8008"));
export const MINIO_ACCESS_KEY = getEnv("MINIO_ACCESS_KEY");
export const MINIO_SECRET_KEY = getEnv("MINIO_SECRET_KEY");
export const MINIO_BUCKET = getEnv("MINIO_BUCKET", "syllabus");
export const MINIO_USE_SSL = getEnv("MINIO_USE_SSL").toLowerCase() === "true";

export const AI_PROVIDER = getEnv("AI_PROVIDER", "auto").toLowerCase();
export const OPENAI_API_KEY = getEnv("OPENAI_API_KEY");
export const OPENAI_MODEL = getEnv("OPENAI_MODEL", "gpt-4o-mini");
export const OLLAMA_BASE_URL = getEnv("OLLAMA_BASE_URL").replace(/\/$/, "");
export const OLLAMA_MODEL = getEnv("OLLAMA_MODEL", "qwen3:8b");
