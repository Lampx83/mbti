/**
 * HTTP Basic Auth cho các route admin.
 * So với username/password trong env (mặc định admin/admin123).
 */
import { ADMIN_USERNAME, ADMIN_PASSWORD } from "../env.js";

function parseBasic(header) {
  if (typeof header !== "string") return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !value) return null;
  return parseBasicToken(value);
}

function parseBasicToken(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const decoded = Buffer.from(value.trim(), "base64").toString("utf-8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { username: decoded.slice(0, idx), password: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

export function checkAdminCredentials(username, password) {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function requireAdmin(req, res, next) {
  // Preferred: standard HTTP Basic via Authorization header.
  // Fallbacks: some proxies (Portal) may strip `Authorization`, so we also allow:
  // - Header `x-mbti-admin-token: <base64(username:password)>`
  // - Query  `?token=<base64(username:password)>`
  const authHeader = req.headers.authorization;
  const tokenHeader = req.headers["x-mbti-admin-token"];
  const tokenQuery = req.query?.token;

  const creds =
    parseBasic(authHeader) ||
    parseBasicToken(Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader) ||
    parseBasicToken(Array.isArray(tokenQuery) ? tokenQuery[0] : tokenQuery);
  if (!creds || !checkAdminCredentials(creds.username, creds.password)) {
    res.set("WWW-Authenticate", 'Basic realm="MBTI Admin"');
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
