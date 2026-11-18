// Sảnh hội chợ: chọn bản vẽ phù hợp với máy.
// - Có WebGL và đã build bằng Vite: dùng bản Three.js (hub3d.js).
// - Không có WebGL, nạp Three.js lỗi, hoặc chạy thẳng mã nguồn chưa build: dùng bản CSS 3D (hubCss.js).
// Giao diện hàm giữ nguyên như cũ để main.js gọi được với cả hai bản.
import * as css from "./hubCss.js";
import { hasWebGL } from "./gfx/webgl.js";

export const EMOTES = css.EMOTES;
let impl = css;
export let mode = "css";

/** Gọi một lần lúc đang tải: thử nạp bản 3D. Trả về "3d" hoặc "css". */
export async function prepareHub() {
  if (!hasWebGL()) return mode;
  try {
    const m = await import("./hub3d.js");
    await m.preload();
    impl = m; mode = "3d";
  } catch (e) {
    console.warn("Không nạp được đồ họa Three.js, dùng bản CSS 3D:", e);
  }
  return mode;
}

export function buildHub(ctx) {
  if (impl !== css) {
    try { return impl.buildHub(ctx); }
    catch (e) {
      console.warn("Không dựng được cảnh WebGL, dùng bản CSS 3D:", e);
      impl = css; mode = "css";
      const vp = document.getElementById("viewport"); vp.classList.remove("gl");
      vp.querySelectorAll(".gl3,.lbl3").forEach(el => el.remove());
    }
  }
  return css.buildHub(ctx);
}
export const startHub = () => impl.startHub();
export const zoomOut = () => impl.zoomOut();
export const goTo = id => impl.goTo(id);
export const addPeer = p => impl.addPeer(p);
export const removePeer = id => impl.removePeer(id);
export const movePeer = (id, x, y) => impl.movePeer(id, x, y);
export const renamePeer = (id, nick) => impl.renamePeer(id, nick);
export const peerEmote = (id, e) => impl.peerEmote(id, e);
export const peerSay = (id, text) => impl.peerSay(id, text);
export const selfSay = text => impl.selfSay(text);
export const hidePeer = id => impl.hidePeer(id);
export const resetPeers = list => impl.resetPeers(list);
export const peerCount = () => impl.peerCount();
