#!/usr/bin/env node
/**
 * Đóng gói MBTI-Career-NEU thành zip để đưa lên AI Portal.
 * Chạy: npm run pack  → dist/mbti-career-neu.zip
 * Chạy: npm run pack:basepath  → dist/mbti-career-neu-basepath.zip
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const buildDir = path.join(root, process.env.PACK_SOURCE || "dist");
const baseName = process.env.PACK_BASEPATH ? "mbti-career-neu-basepath" : "mbti-career-neu";
const outDir = path.join(root, process.env.PACK_OUTPUT_DIR || "dist");
const outZip = path.join(outDir, `${baseName}.zip`);

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

async function main() {
  const manifestPath = path.join(root, "package", "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    console.error("Thiếu package/manifest.json");
    process.exit(1);
  }
  const indexPath = path.join(buildDir, "index.html");
  if (!fs.existsSync(indexPath)) {
    console.error("Chưa có thư mục build. Chạy: npm run build");
    process.exit(1);
  }

  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip();

  zip.addLocalFile(manifestPath, "", "manifest.json");
  addDirToZip(zip, buildDir, "public");

  fs.mkdirSync(outDir, { recursive: true });
  zip.writeZip(outZip);
  console.log("Đã tạo:", outZip);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
