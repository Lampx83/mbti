/**
 * MinIO client + helper tải file DOCX 16 nhóm tính cách.
 */
import * as Minio from "minio";
import {
  MINIO_ENDPOINT,
  MINIO_PORT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_USE_SSL,
} from "../env.js";

let client = null;

export function getMinioClient() {
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) return null;
  if (!client) {
    client = new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    });
  }
  return client;
}

export function getMinioBucket() {
  return MINIO_BUCKET;
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export function isNotFoundError(err) {
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
  const minio = getMinioClient();
  return new Promise((resolve, reject) => {
    const objects = [];
    const stream = minio.listObjectsV2(MINIO_BUCKET, prefix, true);
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

export async function fetchPersonalityDoc(mbtiType) {
  const minio = getMinioClient();
  if (!minio) throw new Error("MinIO chưa cấu hình");

  const baseName = `courses-processed/personality/${mbtiType}.docx`;
  const candidates = Array.from(new Set([baseName, baseName.normalize("NFC"), baseName.normalize("NFD")]));

  let lastErr = null;
  for (const objectName of candidates) {
    try {
      const dataStream = await minio.getObject(MINIO_BUCKET, objectName);
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
    const dataStream = await minio.getObject(MINIO_BUCKET, matchedName);
    const buffer = await streamToBuffer(dataStream);
    return { objectName: matchedName, buffer };
  }

  throw lastErr || new Error("NoSuchKey");
}
