#!/usr/bin/env node
/**
 * Đóng gói ứng dụng đầy đủ (frontend + backend) thành một thư mục/zip để triển khai.
 * Chạy: npm run build && node scripts/pack-full.mjs
 * Kết quả: dist/mbti-career-neu-full.zip (hoặc thư mục dist/deploy/)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const distDir = path.join(root, "dist");
const deployDir = path.join(distDir, "deploy");
const zipName = "mbti-career-neu-full.zip";

const FILES = [
  "server.js",
  "package.json",
  "package-lock.json",
  ".env.example",
];
const MANIFEST_SRC = path.join(root, "package", "manifest.json");

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const srcPath = path.join(src, name);
    const destPath = path.join(dest, name);
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.error("Chưa có bản build frontend. Chạy: npm run build");
    process.exit(1);
  }

  fs.mkdirSync(deployDir, { recursive: true });

  for (const file of FILES) {
    const src = path.join(root, file);
    if (fs.existsSync(src)) {
      copyFile(src, path.join(deployDir, file));
      console.log("  +", file);
    }
  }
  if (fs.existsSync(MANIFEST_SRC)) {
    copyFile(MANIFEST_SRC, path.join(deployDir, "manifest.json"));
    console.log("  + manifest.json");
  }

  const buildDir = path.join(root, "dist");
  const deployDist = path.join(deployDir, "dist");
  fs.mkdirSync(deployDist, { recursive: true });
  for (const name of fs.readdirSync(buildDir)) {
    if (name === "deploy" || name.endsWith(".zip")) continue;
    const src = path.join(buildDir, name);
    const dest = path.join(deployDist, name);
    if (fs.statSync(src).isDirectory()) {
      copyDir(src, dest);
    } else {
      copyFile(src, dest);
    }
  }
  console.log("  + dist/ (frontend build)");

  const readme = `# Triển khai MBTI-Career-NEU

## Cách chạy

1. Đổi tên \`.env.example\` thành \`.env\` và điền MinIO, OpenAI API key.
2. Cài đặt: \`npm install --omit=dev\`
3. Chạy: \`node server.js\`

Ứng dụng chạy tại http://localhost:4000 (cả giao diện và API).

## Yêu cầu

- Node.js 18+
- MinIO có bucket syllabus, folder courses-processed/personality với 16 file "Mô tả XX.docx"
- OpenAI API key
`;
  fs.writeFileSync(path.join(deployDir, "DEPLOY.md"), readme, "utf8");
  console.log("  + DEPLOY.md");

  // Tạo zip nếu có adm-zip
  try {
    const AdmZip = (await import("adm-zip")).default;
    const zip = new AdmZip();
    for (const name of fs.readdirSync(deployDir)) {
      const full = path.join(deployDir, name);
      if (fs.statSync(full).isDirectory()) {
        zip.addLocalFolder(full, name);
      } else {
        zip.addLocalFile(full, "", name);
      }
    }
    zip.writeZip(path.join(distDir, zipName));
    console.log("\nĐã tạo:", path.join(distDir, zipName));
  } catch {
    console.log("\nThư mục đóng gói:", deployDir);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
