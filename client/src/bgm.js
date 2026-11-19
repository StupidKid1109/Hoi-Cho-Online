// Nhạc nền của game: phát ở sảnh, phòng chờ, các gian; vào quán cà phê thì tắt (quán có nhạc riêng).
// Nguồn là file nhạc quản trị viên tải lên và chọn ở /admin (mục "Nhạc nền game"). Phát ẩn, không hiện gì trên màn hình.
import { API_BASE } from "./config.js";

let state = null, place = "none", audio = null, blocked = false;

const wanted = () => !!(state && state.on && state.file && place !== "cafe" && place !== "none");

/** Trình duyệt chặn tự phát có tiếng (hay gặp trên điện thoại): phát không tiếng, chạm màn hình lần đầu là có tiếng. */
function onBlocked() {
  if (blocked) return; blocked = true;
  if (audio) { audio.muted = true; audio.play().catch(() => {}); }
  const un = () => { document.removeEventListener("pointerdown", un, true); document.removeEventListener("keydown", un, true); blocked = false; apply(); };
  document.addEventListener("pointerdown", un, true); document.addEventListener("keydown", un, true);
}

function apply() {
  if (!wanted()) { if (audio) audio.pause(); return; }
  if (!audio) { audio = new Audio(); audio.loop = true; audio.preload = "auto"; window.__bgm = audio; }
  const src = API_BASE + "/api/music/file/" + encodeURIComponent(state.file);
  if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
  audio.volume = Math.max(0, Math.min(1, state.volume ?? 0.5)); audio.muted = blocked;
  const p = audio.play(); if (p && p.catch) p.catch(e => { if (e && e.name === "NotAllowedError") onBlocked(); });
}

/** Cài đặt nhạc nền từ máy chủ ({on, file, title, volume}). */
export function setState(s) {
  if (!s) return;
  const same = state && state.on === s.on && state.file === s.file && state.volume === s.volume;
  state = s; if (!same) apply();
}
/** Đang ở đâu: "fair" (sảnh), "game" (phòng chờ, các gian), "cafe" (quán: tắt nhạc nền), "none". */
export function setPlace(p) { if (p === place) return; place = p; apply(); }
