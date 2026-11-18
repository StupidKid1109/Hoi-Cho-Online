// Gọi API máy chủ và kết nối thời gian thực.
import { API_BASE } from "./config.js";

let token = null;
export const setToken = t => { token = t; };

export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch(API_BASE + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  } catch (e) { const err = new Error("Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại."); err.status = 0; throw err; }
  let data = {};
  try { data = await res.json(); } catch (e) { /* không có nội dung */ }
  if (!res.ok) { const err = new Error(data.error || "Lỗi máy chủ (" + res.status + ")"); err.status = res.status; throw err; }
  return data;
}
export const post = (path, body) => api(path, { method: "POST", body: body || {} });

/** Kết nối khu hội chợ, tự nối lại khi rớt mạng. */
export function connectKhu(khu, onMessage, onState) {
  let ws = null, stopped = false, retry = 0, timer = null;
  const url = () => (API_BASE || location.origin).replace(/^http/, "ws") + "/ws?khu=" + khu + "&token=" + encodeURIComponent(token);
  function open() {
    if (stopped) return;
    ws = new WebSocket(url());
    ws.onopen = () => { retry = 0; onState && onState(true); };
    ws.onmessage = e => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = e => {
      onState && onState(false);
      if (stopped || e.code === 4001 || e.code === 4002 || e.code === 4003) return;
      timer = setTimeout(open, Math.min(10000, 800 * 2 ** retry++));
    };
  }
  open();
  return {
    send: obj => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    close: () => { stopped = true; clearTimeout(timer); if (ws) ws.close(); }
  };
}
