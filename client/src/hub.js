// Sảnh hội chợ: chọn bản vẽ phù hợp với máy.
// - Có WebGL và đã build bằng Vite: dùng bản Three.js (hub3d.js).
// - Không có WebGL, nạp Three.js lỗi, hoặc chạy thẳng mã nguồn chưa build: dùng bản CSS 3D (hubCss.js).
// Giao diện hàm giữ nguyên như cũ để main.js gọi được với cả hai bản.
import * as css from "./hubCss.js";
import { hasWebGL } from "./gfx/webgl.js";

export const EMOTES = css.EMOTES;
let impl = css;
export let mode = "css";
/** Lý do dùng bản CSS 3D (để báo cho người chơi): "forced" | "nowebgl" | "unbuilt" | "loadfail" | "buildfail" | null */
export let reason = null;

/** Gọi một lần lúc đang tải: thử nạp bản 3D. Trả về "3d" hoặc "css". */
export async function prepareHub() {
  if (!hasWebGL()) { reason = /[?&]gfx=css/.test(location.search) ? "forced" : "nowebgl"; return mode; }
  try {
    const m = await import("./hub3d.js");
    await m.preload();
    impl = m; mode = "3d"; reason = null;
  } catch (e) {
    console.warn("Không nạp được đồ họa Three.js, dùng bản CSS 3D:", e);
    // chạy thẳng mã nguồn chưa build thì không tìm được thư viện "three"
    reason = /specifier|resolve module/i.test(String(e && e.message)) ? "unbuilt" : "loadfail";
  }
  return mode;
}

export function buildHub(ctx) {
  if (impl !== css) {
    try { return impl.buildHub(ctx); }
    catch (e) {
      console.warn("Không dựng được cảnh WebGL, dùng bản CSS 3D:", e);
      impl = css; mode = "css"; reason = "buildfail";
      const vp = document.getElementById("viewport"); vp.classList.remove("gl");
      vp.querySelectorAll(".gl3,.lbl3").forEach(el => el.remove());
    }
  }
  return css.buildHub(ctx);
}
/** Câu báo cho người chơi khi đang dùng đồ họa đơn giản (null nếu đang dùng 3D hoặc tự chọn bản CSS). */
export function fallbackNotice() {
  if (mode === "3d" || !reason || reason === "forced") return null;
  if (reason === "unbuilt") return "Đang dùng đồ họa đơn giản: máy chủ đang chạy mã nguồn chưa build. Cán bộ kỹ thuật chạy \"npm run build\" trong thư mục client để có đồ họa 3D.";
  return "Đang dùng đồ họa đơn giản vì trình duyệt chưa bật WebGL. Thử bật \"Sử dụng tăng tốc phần cứng\" trong Cài đặt của trình duyệt, khởi động lại trình duyệt, hoặc mở bằng Chrome, Edge.";
}
export const startHub = () => impl.startHub();
export const zoomOut = () => impl.zoomOut();
export const goTo = id => impl.goTo(id);
export const addPeer = p => impl.addPeer(p);
export const removePeer = id => impl.removePeer(id);
export const movePeer = (id, x, y) => impl.movePeer(id, x, y);
export const renamePeer = (id, nick) => impl.renamePeer(id, nick);
export const renameSelf = nick => impl.renameSelf(nick);
export const lookPeer = (id, gd, lk) => impl.lookPeer(id, gd, lk);
/** Nhân vật của mình nam/nữ (gọi trước buildHub). */
export const setGender = (g, lk) => { if (impl.setGender) impl.setGender(g, lk); };
export const peerEmote = (id, e) => impl.peerEmote(id, e);
export const peerSay = (id, text) => impl.peerSay(id, text);
export const selfSay = text => impl.selfSay(text);
export const hidePeer = id => impl.hidePeer(id);
export const resetPeers = list => impl.resetPeers(list);
export const peerCount = () => impl.peerCount();
// Chỗ ngồi chỉ có ở bản Three.js; bản CSS 3D bỏ qua (người ngồi vẫn hiện đúng vị trí).
export const peerSit = (id, s) => impl.peerSit && impl.peerSit(id, s);
export const sitRejected = s => impl.sitRejected && impl.sitRejected(s);
// Nút "Vào phòng chờ" trước mỗi gian (bản Three.js): dòng chữ nhỏ báo số người đang chờ.
export const setBoothInfo = (id, text) => impl.setBoothInfo && impl.setBoothInfo(id, text);
export const setCafeMusic = on => impl.setCafeMusic && impl.setCafeMusic(on);
