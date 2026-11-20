// Âm lượng riêng của người chơi (nhớ trên máy, localStorage "hc_sound"), tách 2 phần:
//  bgm: nhạc nền game (sảnh, phòng chờ, các gian) · cafe: nhạc trong quán cà phê.
// Âm lượng thật = âm lượng quản trị viên đặt × âm lượng người chơi chọn. Nút 🔊 nổi trên màn hình mở bảng chỉnh.
const KEY = "hc_sound";
let s = { bgm: 0.8, cafe: 0.8, bgmOff: false, cafeOff: false };
try { Object.assign(s, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* bỏ qua */ }
const subs = new Set();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* bỏ qua */ } subs.forEach(f => f()); drawBtn(); };

/** Hệ số âm lượng của người chơi cho phần k ("bgm" | "cafe"): 0 khi tắt. */
export const level = k => (s[k + "Off"] ? 0 : Math.max(0, Math.min(1, s[k])));
export const isOff = k => !!s[k + "Off"] || s[k] <= 0;
export function setOff(k, off) { s[k + "Off"] = !!off; if (!off && s[k] <= 0) s[k] = 0.5; save(); }
export function setLevel(k, v) { s[k] = Math.max(0, Math.min(1, v)); if (s[k] > 0) s[k + "Off"] = false; save(); }
/** Gọi f mỗi khi người chơi đổi âm lượng. Trả về hàm hủy. */
export function onChange(f) { subs.add(f); return () => subs.delete(f); }

/* ---------- Nút 🔊 và bảng chỉnh âm lượng ---------- */
let btn = null, panel = null;
function drawBtn() {
  if (!btn) return;
  const allOff = isOff("bgm") && isOff("cafe");
  btn.innerHTML = (allOff ? "🔇" : "🔊") + "<span>Âm thanh</span>";
  if (!panel) return;
  for (const k of ["bgm", "cafe"]) {
    const r = panel.querySelector('[data-k="' + k + '"]');
    r.querySelector("input").value = Math.round((s[k + "Off"] ? 0 : s[k]) * 100);
    r.querySelector(".pct").textContent = isOff(k) ? "Tắt" : Math.round(s[k] * 100) + "%";
    r.querySelector(".tg").textContent = isOff(k) ? "🔇 Bật" : "🔊 Tắt";
    r.classList.toggle("off", isOff(k));
  }
}
export function mountSoundButton() {
  if (btn) return;
  btn = document.createElement("button"); btn.id = "sndBtn"; btn.type = "button"; btn.className = "sndbtn"; btn.setAttribute("aria-label", "Chỉnh âm lượng nhạc");
  panel = document.createElement("div"); panel.className = "sndpanel"; panel.hidden = true;
  panel.innerHTML = '<div class="sh"><b>🔊 Âm lượng</b><button class="x" type="button" aria-label="Đóng">✕</button></div>' +
    [["bgm", "🎶 Nhạc nền game"], ["cafe", "☕ Nhạc quán cà phê"]].map(([k, t]) =>
      '<div class="sr" data-k="' + k + '"><div class="st"><span>' + t + '</span><span class="pct"></span></div><div class="sc"><input type="range" min="0" max="100" step="5" aria-label="' + t + '"><button class="tg" type="button"></button></div></div>').join("") +
    '<div class="sn">Chỉ thay đổi trên máy của bạn</div>';
  document.body.append(btn, panel);
  const stop = e => e.stopPropagation();
  for (const ev of ["pointerdown", "pointerup", "click", "keydown"]) panel.addEventListener(ev, stop);
  btn.addEventListener("pointerdown", stop); btn.addEventListener("pointerup", stop);
  btn.onclick = e => { e.stopPropagation(); panel.hidden = !panel.hidden; };
  panel.querySelector(".x").onclick = () => { panel.hidden = true; };
  panel.querySelectorAll(".sr").forEach(r => {
    const k = r.dataset.k;
    r.querySelector("input").oninput = e => setLevel(k, e.target.value / 100);
    r.querySelector(".tg").onclick = () => setOff(k, !isOff(k));
  });
  document.addEventListener("pointerdown", e => { if (!panel.hidden && !panel.contains(e.target) && e.target !== btn) panel.hidden = true; });
  drawBtn();
}
