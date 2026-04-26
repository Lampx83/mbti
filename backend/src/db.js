/**
 * Pool PostgreSQL chung cho cả standalone và embedded.
 * Mọi câu lệnh SQL dùng placeholder __SCHEMA__ sẽ được thay bằng tên schema hiện tại.
 */
import pg from "pg";
import { DATABASE_URL, DB_SCHEMA } from "./env.js";

const { Pool } = pg;
const SAFE_SCHEMA_REGEX = /^[a-zA-Z0-9_]+$/;

function getSchemaSafe() {
  const s = typeof DB_SCHEMA === "string" ? DB_SCHEMA.trim() : "";
  return SAFE_SCHEMA_REGEX.test(s) ? s : "mbti_career";
}

let poolInstance = null;

function getPool() {
  if (!poolInstance) {
    if (!DATABASE_URL) {
      throw new Error("DATABASE_URL or PORTAL_DATABASE_URL is required for MBTI backend");
    }
    poolInstance = new Pool({
      connectionString: DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });
    poolInstance.on("error", (err) => {
      console.error("[mbti-db] Pool error:", err.message);
    });
  }
  return poolInstance;
}

export function getSchema() {
  return getSchemaSafe();
}

export function resetPool() {
  if (poolInstance) {
    poolInstance.end().catch(() => {});
    poolInstance = null;
  }
}

const STATEMENT_TIMEOUT_MS = 30_000;

export async function query(text, params) {
  const schema = getSchemaSafe();
  const client = await getPool().connect();
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    const normalized = text.replace(/__SCHEMA__/g, `"${schema}"`);
    return await client.query(normalized, params);
  } finally {
    client.release();
  }
}

export async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    await client.query("BEGIN");
    try {
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}

export function withSchema(sql) {
  return sql.replace(/__SCHEMA__/g, `"${getSchemaSafe()}"`);
}
