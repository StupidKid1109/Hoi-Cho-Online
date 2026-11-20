// Nhạc nền của game: phát ở sảnh, phòng chờ, các gian; vào quán cà phê thì tắt (quán có nhạc riêng).
// Nguồn là file nhạc quản trị viên tải lên và chọn ở /admin (mục "Nhạc nền game"). Phát ẩn, không hiện gì trên màn hình.
import { API_BASE } from "./config.js";
import { level, onChange } from "./sound.js";

let state = null, place = "none", audio = null, blocked = false, order = [], idx = 0;

const list = () => (state && (state.files && state.files.length ? state.files : state.file ? [state.file] : [])) || [];
const wanted = () => !!(state && state.on && list().length && place !== "cafe" && place !== "none" && level("bgm") > 0); // người chơi tắt nhạc nền thì dừng hẳn
/** Thứ tự phát: theo danh sách, hoặc trộn bài. */
function makeOrder() {
  order = list().slice();
  if (state && state.shuffle) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  idx = 0;
}

/** Trình duyệt chặn tự phát có tiếng (hay gặp trên điện thoại): phát không tiếng, chạm màn hình lần đầu là có tiếng. */
function onBlocked() {
  if (blocked) return; blocked = true;
  if (audio) { audio.muted = true; audio.play().catch(() => {}); }
  const un = () => { document.removeEventListener("pointerdown", un, true); document.removeEventListener("keydown", un, true); blocked = false; apply(); };
  document.addEventListener("pointerdown", un, true); document.addEventListener("keydown", un, true);
}

function apply() {
  if (!wanted()) { if (audio) audio.pause(); return; }
  if (!audio) {
    audio = new Audio(); audio.preload = "auto"; window.__bgm = audio;
    audio.addEventListener("ended", () => { idx = (idx + 1) % Math.max(1, order.length); if (idx === 0 && state && state.shuffle) makeOrder(); apply(); }); // hết bài: sang bài sau
  }
  if (!order.length || !order.includes(order[idx])) makeOrder();
  audio.loop = order.length === 1;
  const src = API_BASE + "/api/bgm/file/" + encodeURIComponent(order[idx]); // thư viện nhạc nền riêng
  if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
  audio.volume = Math.max(0, Math.min(1, (state.volume ?? 0.5) * level("bgm"))); audio.muted = blocked; // âm lượng quản trị viên × âm lượng người chơi
  const p = audio.play(); if (p && p.catch) p.catch(e => { if (e && e.name === "NotAllowedError") onBlocked(); });
}

onChange(() => apply()); // người chơi kéo thanh âm lượng / tắt nhạc nền
/** Cài đặt nhạc nền từ máy chủ ({on, files, shuffle, volume}). */
export function setState(s) {
  if (!s) return;
  const key = x => [x.on, x.volume, x.shuffle, (x.files || [x.file]).join("|")].join("/");
  const same = state && key(state) === key(s);
  const listChanged = !state || (state.files || [state.file]).join("|") !== (s.files || [s.file]).join("|") || state.shuffle !== s.shuffle;
  state = s; if (listChanged) makeOrder(); if (!same) apply();
}
/** Đang ở đâu: "fair" (sảnh), "game" (phòng chờ, các gian), "cafe" (quán: tắt nhạc nền), "none". */
export function setPlace(p) { if (p === place) return; place = p; apply(); }
