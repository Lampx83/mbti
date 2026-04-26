/**
 * HTTP Basic Auth cho các route admin.
 * So với username/password trong env (mặc định admin/admin123).
 */
import { ADMIN_USERNAME, ADMIN_PASSWORD } from "../env.js";

function parseBasic(header) {
  if (typeof header !== "string") return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "basic" || !value) return null;
  try {
    const decoded = Buffer.from(value, "base64").toString("utf-8");
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
  const creds = parseBasic(req.headers.authorization);
  if (!creds || !checkAdminCredentials(creds.username, creds.password)) {
    res.set("WWW-Authenticate", 'Basic realm="MBTI Admin"');
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}
