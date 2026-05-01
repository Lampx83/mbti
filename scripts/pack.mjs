#!/usr/bin/env node
/**
 * Đóng gói MBTI Career NEU thành ZIP cho AI Portal.
 *
 * Cấu trúc ZIP:
 *   manifest.json
 *   package.json          (từ backend/package.json — Portal sẽ npm install để có pg/express/...)
 *   public/               (frontend build)
 *   dist/                 (backend mã nguồn — Portal chạy node dist/embed.js qua main field)
 *   schema/schema.sql     (giữ nguyên, có __SCHEMA__ placeholder để ensure-db tự thay)
 *   schema/portal-embedded.sql  (đã thay __SCHEMA__ = mbti_career — Portal có thể chạy 1 lần)
 *
 * Chạy:
 *   npm run pack            → dist/mbti-career-neu.zip
 *   npm run pack:basepath   → dist/mbti-career-neu-basepath.zip (frontend build kèm /tuyen-sinh/embed/...)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const isBasepathPack = process.argv.includes("--basepath") || process.env.PACK_BASEPATH === "1" || process.env.PACK_BASEPATH === "true";

const frontendDir = path.join(root, isBasepathPack ? "dist-base" : "dist-public");
const backendDir = path.join(root, "backend");
const backendDistDir = path.join(backendDir, "dist");
const outDir = process.env.PACK_OUT_DIR || path.join(root, "dist");
const baseName = isBasepathPack ? "mbti-career-neu-basepath" : "mbti-career-neu";
const outZip = path.join(outDir, baseName + ".zip");

const EMBEDDED_SCHEMA_NAME = "mbti_career";

function addDirToZip(zip, localDir, zipPrefix = "") {
  if (!fs.existsSync(localDir)) return;
  const items = fs.readdirSync(localDir);
  for (const item of items) {
    const full = path.join(localDir, item);
    const rel = zipPrefix ? path.join(zipPrefix, item) : item;
    if (fs.statSync(full).isDirectory()) {
      addDirToZip(zip, full, rel);
    } else if (!rel.endsWith(".zip") && !rel.endsWith(".DS_Store")) {
      const zipDir = path.dirname(rel);
      zip.addLocalFile(full, zipDir ? zipDir + "/" : "", path.basename(rel));
    }
  }
}

function ensureFrontendBuild() {
  console.log("→ Building frontend...");
  if (!fs.existsSync(path.join(root, "node_modules"))) {
    execSync("npm install", { cwd: root, stdio: "inherit" });
  }
  const outDirName = isBasepathPack ? "dist-base" : "dist-public";
  const env = { ...process.env, BUILD_OUT_DIR: outDirName };
  const cmd = isBasepathPack ? "npm run build:basepath" : "npm run build";
  execSync(cmd, { cwd: root, stdio: "inherit", env });
  if (!fs.existsSync(path.join(root, outDirName, "index.html"))) {
    console.error(`Build frontend thất bại — thiếu ${outDirName}/index.html`);
    process.exit(1);
  }
}

function ensureBackendBuild() {
  console.log("→ Building backend...");
  if (!fs.existsSync(path.join(backendDir, "node_modules"))) {
    execSync("npm install", { cwd: backendDir, stdio: "inherit" });
  }
  execSync("npm run build", { cwd: backendDir, stdio: "inherit" });
  if (!fs.existsSync(path.join(backendDistDir, "embed.js"))) {
    console.error("Build backend thất bại — thiếu backend/dist/embed.js");
    process.exit(1);
  }
}

async function main() {
  const manifestPath = path.join(root, "package", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("Thiếu package/manifest.json");
    process.exit(1);
  }
  const backendPackagePath = path.join(backendDir, "package.json");
  if (!fs.existsSync(backendPackagePath)) {
    console.error("Thiếu backend/package.json");
    process.exit(1);
  }

  ensureFrontendBuild();
  ensureBackendBuild();

  // Schema cho Portal: file portal-embedded.sql (thay __SCHEMA__ = mbti_career) để Portal tự chạy khi cài
  const schemaSqlPath = path.join(backendDir, "schema", "schema.sql");
  let portalEmbeddedSql = "";
  if (fs.existsSync(schemaSqlPath)) {
    portalEmbeddedSql = fs
      .readFileSync(schemaSqlPath, "utf-8")
      .replace(/__SCHEMA__/g, EMBEDDED_SCHEMA_NAME);
  } else {
    console.warn("⚠️  Thiếu backend/schema/schema.sql — app sẽ không tạo schema khi cài Portal.");
  }

  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip();

  zip.addLocalFile(manifestPath, "", "manifest.json");
  zip.addLocalFile(backendPackagePath, "", "package.json");
  addDirToZip(zip, frontendDir, "public");
  addDirToZip(zip, backendDistDir, "dist");

  // Đóng gói backend/.env vào root của ZIP (sẽ extract thành /app/data/apps/mbti-career-neu/.env).
  // env.js dùng dotenv.config({ override: true }) nên giá trị MinIO/AI ở đây THẮNG env Portal.
  // Bí mật (password, API key) → chỉ tồn tại trong ZIP của bạn, không lên git (.env đã gitignored).
  const backendEnvPath = path.join(backendDir, ".env");
  if (fs.existsSync(backendEnvPath)) {
    zip.addLocalFile(backendEnvPath, "", ".env");
    console.log("→ Đã include backend/.env (override env Portal)");
  } else {
    console.warn("⚠️  Thiếu backend/.env — backend MBTI sẽ dùng env mặc định của Portal (MinIO/AI có thể không đúng).");
    console.warn("    Tạo backend/.env theo mẫu backend/.env.example trước khi pack.");
  }

  if (portalEmbeddedSql) {
    zip.addFile("schema/portal-embedded.sql", Buffer.from(portalEmbeddedSql, "utf-8"));
  }
  const schemaDir = path.join(backendDir, "schema");
  if (fs.existsSync(schemaDir)) {
    addDirToZip(zip, schemaDir, "schema");
  }

  fs.mkdirSync(outDir, { recursive: true });
  zip.writeZip(outZip);
  console.log("✓ Đã tạo:", outZip);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
