// Lớp kết nối với Zalo. Trong Zalo Mini App dùng zmp-sdk; mở trên trình duyệt thường thì dùng chế độ chạy thử.
let sdk = null;

export async function initPlatform() {
  try { sdk = await import("zmp-sdk/apis"); } catch (e) { sdk = null; }
  return !!sdk;
}
export const inZalo = () => !!sdk;

/** Thông tin gửi lên máy chủ để đăng nhập. */
export async function loginPayload() {
  if (sdk) {
    try {
      const token = await sdk.getAccessToken({});
      if (token && token !== "DEFAULT ACCESS TOKEN") return { zaloAccessToken: token };
    } catch (e) { /* không lấy được token: chuyển sang chạy thử */ }
  }
  let id = null;
  try { id = localStorage.getItem("hc_dev_id"); } catch (e) { /* bỏ qua */ }
  if (!id) { id = "may-" + Math.random().toString(36).slice(2, 10); try { localStorage.setItem("hc_dev_id", id); } catch (e) { /* bỏ qua */ } }
  return { devId: id };
}

/** Chia sẻ lời thách đấu. Trong Zalo mở bảng chia sẻ, ngoài Zalo thì sao chép vào bộ nhớ tạm. */
export async function share(title, text) {
  if (sdk) {
    try { await sdk.openShareSheet({ type: "zmp_deep_link", data: { title, description: text } }); return "shared"; } catch (e) { /* tiếp tục bên dưới */ }
  }
  try { await navigator.clipboard.writeText(text); return "copied"; } catch (e) { return "failed"; }
}

export function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* bỏ qua */ } }
