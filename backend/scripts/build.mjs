#!/usr/bin/env node
/**
 * Backend "build" — copy backend/src/* → backend/dist/*.
 * Code là JS thuần (ESM), không cần biên dịch; build chỉ tổ chức lại layout cho
 * giống SurveyLab (Portal kỳ vọng mã trong dist/).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from)) {
    if (item === ".DS_Store") continue;
    const s = path.join(from, item);
    const d = path.join(to, item);
    const stat = fs.statSync(s);
    if (stat.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

rmrf(distDir);
copyDir(srcDir, distDir);
console.log("[backend-build] copied src → dist");
