// Phát hiện WebGL và chọn mức chất lượng đồ họa. File này KHÔNG nạp Three.js,
// để máy không có WebGL (hoặc bản chưa build) vẫn chạy được bản CSS 3D.

const KEY = "hc_gfx";
let probe = null;

/** Máy có WebGL dùng được không (kiểm tra một lần). */
export function hasWebGL() {
  if (probe !== null) return probe;
  try {
    if (new URLSearchParams(location.search).get("gfx") === "css") return (probe = false);
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    probe = !!gl;
    const lose = gl && gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  } catch (e) { probe = false; }
  return probe;
}

/**
 * Mức chất lượng: 0 = thấp (máy yếu), 1 = vừa, 2 = cao.
 * Ưu tiên: ?q=0|1|2 trên địa chỉ, rồi mức đã lưu (do tự hạ khi khung hình thấp), rồi đoán theo cấu hình máy.
 */
export function initialQuality() {
  try { const q = new URLSearchParams(location.search).get("q"); if (q !== null && /^[012]$/.test(q)) return +q; } catch (e) { /* bỏ qua */ }
  try { const s = localStorage.getItem(KEY); if (s !== null && /^[012]$/.test(s)) return +s; } catch (e) { /* bỏ qua */ }
  const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4;
  if (mem <= 2 || cores <= 4) return 0;
  if (mem <= 4 || cores <= 6) return 1;
  return 2;
}
export function saveQuality(q) { try { localStorage.setItem(KEY, String(q)); } catch (e) { /* bỏ qua */ } }
