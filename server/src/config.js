// Đọc cấu hình từ biến môi trường và file server/.env (nếu có).
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

export const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT_DIR = join(SERVER_DIR, "..");

const envFile = join(SERVER_DIR, ".env");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const env = (k, d) => (process.env[k] === undefined || process.env[k] === "" ? d : process.env[k]);
const flag = (k, d) => ["1", "true", "yes"].includes(String(env(k, d ? "1" : "0")).toLowerCase());

export const config = {
  port: Number(env("PORT", 8787)),
  host: env("HOST", "0.0.0.0"),
  // Khóa ký phiên đăng nhập. Bắt buộc đặt cố định khi chạy thật, nếu không mỗi lần khởi động lại người chơi phải đăng nhập lại.
  sessionSecret: env("SESSION_SECRET", randomBytes(32).toString("hex")),
  sessionDays: Number(env("SESSION_DAYS", 7)),
  // Cho phép đăng nhập thử bằng mã tự đặt (chạy trên trình duyệt). TẮT khi chạy thật.
  devLogin: flag("DEV_LOGIN", false),
  zaloAppSecret: env("ZALO_APP_SECRET", ""),
  adminKey: env("ADMIN_KEY", ""),
  dbFile: env("DB_FILE", join(SERVER_DIR, "data", "hoicho.db")),
  corsOrigin: env("CORS_ORIGIN", "*"),
  khuCount: Number(env("KHU_COUNT", 8)),
  khuCapacity: Number(env("KHU_CAPACITY", 100)),
  // Đấu phòng Gian 1, Gian 2: số người tối thiểu để bắt đầu, tối đa mỗi phòng, thời gian đếm ngược khi đủ người (ms)
  matchMin: Number(env("MATCH_MIN", 20)),
  matchMax: Number(env("MATCH_MAX", 50)),
  matchCountdown: Number(env("MATCH_COUNTDOWN", 15000)),
  matchSpeed: Number(env("MATCH_SPEED", 1)), // chỉ dùng khi thử tải: < 1 cho ván chạy nhanh hơn
  serveClient: flag("SERVE_CLIENT", true),
  // Đứng sau Caddy/Nginx: lấy IP thật của người chơi từ X-Forwarded-For (không bật thì mọi người chung một IP của máy trung gian)
  trustProxy: flag("TRUST_PROXY", false),
  // Số lần đăng nhập tối đa mỗi phút cho một IP (cả trường, cả phường có thể dùng chung một wifi)
  authPerMin: Number(env("AUTH_PER_MIN", 120))
};
