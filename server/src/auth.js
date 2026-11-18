// Đăng nhập: xác thực người dùng Zalo, cấp phiên đăng nhập ký bằng HMAC.
import { createHmac, timingSafeEqual } from "node:crypto";

const b64 = s => Buffer.from(s).toString("base64url");
const unb64 = s => Buffer.from(s, "base64url").toString();

export function makeAuth(config) {
  const sign = data => createHmac("sha256", config.sessionSecret).update(data).digest("base64url");

  function issue(playerId) {
    const exp = Date.now() + config.sessionDays * 864e5;
    const body = b64(playerId) + "." + exp;
    return body + "." + sign(body);
  }

  function verify(token) {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const body = parts[0] + "." + parts[1], expected = Buffer.from(sign(body)), got = Buffer.from(parts[2]);
    if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null;
    if (Number(parts[1]) < Date.now()) return null;
    return unb64(parts[0]);
  }

  /**
   * Xác thực access token lấy từ zmp-sdk (getAccessToken) bằng cách gọi Zalo Graph API từ máy chủ.
   * LƯU Ý: kiểm tra lại địa chỉ API, tên header và yêu cầu appsecret_proof với tài liệu Zalo hiện hành
   * (https://miniapp.zaloplatforms.com/documents/) trước khi chạy thật.
   */
  async function verifyZalo(accessToken) {
    if (typeof accessToken !== "string" || accessToken.length < 10 || accessToken.length > 2048) return null;
    const headers = { access_token: accessToken };
    if (config.zaloAppSecret) headers.appsecret_proof = createHmac("sha256", config.zaloAppSecret).update(accessToken).digest("hex");
    try {
      const res = await fetch("https://graph.zalo.me/v2.0/me?fields=id", { headers, signal: AbortSignal.timeout(8000) });
      const data = await res.json();
      if (data && data.id && !data.error) return "zalo:" + String(data.id);
    } catch (e) { /* mạng lỗi: coi như không xác thực được */ }
    return null;
  }

  async function identify(body) {
    if (body && body.zaloAccessToken) return verifyZalo(body.zaloAccessToken);
    if (config.devLogin && body && typeof body.devId === "string" && /^[a-z0-9-]{4,40}$/.test(body.devId)) return "dev:" + body.devId;
    return null;
  }

  return { issue, verify, identify };
}
