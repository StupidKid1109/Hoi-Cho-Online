// Gian 3: Đường về an toàn. Mô phỏng tất định dùng chung với máy chủ; máy chủ chạy lại để chấm điểm.
// File này giữ vòng mô phỏng bước cố định và việc ghi thao tác (inputs) gửi máy chủ.
// Phần vẽ tách riêng: runner3d.js (Three.js) hoặc runnerCss.js (CSS 3D, khi không có WebGL).
import { $, msg, beep } from "../ui.js";
import { post } from "../api.js";
import { vibrate } from "../platform.js";
import { hasWebGL } from "../gfx/webgl.js";
import { createSim, step, act, score, speed, ROAD, OBSTACLES, QUIZ, MISSIONS, missionText, missionProgress, FPS, DT, ACT } from "../../../shared/runnerSim.js";
import { signURL } from "./signs.js";
import * as cssView from "./runnerCss.js";

export const pre = ["🛵", "Đường về an toàn", [["👆", "Vuốt hoặc chạm trái, phải để đổi làn"], ["⬆️", "Vuốt lên (máy tính: phím Space) để nhảy qua rào thấp: két bia, rào thi công"], ["⬇️", "Vuốt xuống (máy tính: S hoặc ↓) để cúi qua biển treo: cấm ngược chiều, cờ đua"], ["🚦", "Cột đèn đỏ, điện thoại: phải đổi làn"], ["⛑️", "Nhặt mũ bảo hiểm để được bảo vệ 1 lần · có 3 mạng"], ["🚦", "Câu hỏi luật giữa đường: chạy vào làn có đáp án đúng khi tới cổng (đúng +100, đúng liên tiếp thêm thưởng, sai −50)"], ["🎯", "3 nhiệm vụ trong ngày, mỗi nhiệm vụ xong trong một lượt +200 điểm"], ["♾️", "Đường không có điểm kết thúc: phố phường, qua cầu, đường làng, phố đêm… càng xa càng nhanh, chạy tới khi hết mạng"]]];
/** Cảnh đường chạy theo quãng đường (lặp lại mỗi 2.800 m). Chỉ để vẽ, không ảnh hưởng luật mô phỏng. */
export const THEMES = [["pho", "🏙️ Phố phường", 0], ["cau", "🌉 Qua cầu", 700], ["que", "🌾 Đường làng", 1400], ["dem", "🌃 Phố đêm", 2100]];
export const THEME_LOOP = 2800;
export function themeAt(dist) { const d = dist % THEME_LOOP; let t = THEMES[0]; for (const x of THEMES) if (d >= x[2]) t = x; return t[0]; }
const BADGES = [500, 1000, 2000, 3000, 5000, 8000];
const LANE_NAME = ["⬅ Trái", "⬆ Giữa", "➡ Phải"];
let g = null, view3d = null, tried3d = false;

/** Chọn phần vẽ: Three.js nếu được, không thì CSS 3D. */
async function pickView() {
  if (!hasWebGL()) return cssView;
  if (!tried3d) {
    tried3d = true;
    try { view3d = await import("./runner3d.js"); await view3d.preload(); }
    catch (e) { view3d = null; console.warn("Không nạp được đồ họa Three.js cho Gian 3, dùng bản CSS 3D:", e); }
  }
  return view3d || cssView;
}

export async function start(ctx) {
  let view = await pickView();
  const r = await post("/api/runs", { game: "g3" });
  g = { ctx, run: r.runId, sim: createSim(r.seed, r.missions || []), inputs: [], pending: [], acc: 0, last: null, px: ROAD.LANES[1], tilt: 0, running: true, raf: 0, ending: false, view, theme: "pho", badge: 0, misKey: "" };
  overlay();
  try { view.init(g); }
  catch (e) {
    if (view === cssView) throw e;
    console.warn("Không dựng được cảnh WebGL cho Gian 3, dùng bản CSS 3D:", e);
    view3d = null; view = g.view = cssView; view.init(g);
  }
  if (!r.counted) ctx.toast("Ngoài thời gian đợt thưởng: lượt này để luyện tập, không tính điểm");
  hud(); g.raf = requestAnimationFrame(loop);
}
/** Chỉ để chụp thử / kiểm tra giao diện. */
if (typeof window !== "undefined") window.__g3 = () => g;
export function stop() { if (g) { g.running = false; cancelAnimationFrame(g.raf); g.view.stop(); } }
/** Thao tác: -1 / 1 đổi làn, 2 nhảy, -2 cúi (ACT). Được ghi theo số khung hình để máy chủ chạy lại đúng như vậy. */
export function move(d) { if (!g || !g.running || g.sim.over) return; g.pending.push(d); }
export const jump = () => move(ACT.JUMP);
export const running = () => !!(g && g.running && !g.sim.over);
export const duck = () => move(ACT.DUCK);

/** Lớp chữ trên đường chạy: thẻ câu hỏi, nhiệm vụ, tên đoạn đường. */
function overlay() {
  const road = $("road");
  for (const [id, cls] of [["g3q", "g3q"], ["g3mis", "g3mis"], ["g3zone", "g3zone"]]) { let el = $(id); if (!el) { el = document.createElement("div"); el.id = id; el.className = cls; road.appendChild(el); } el.innerHTML = ""; el.classList.remove("on", "ok", "no"); }
}
function renderMissions() {
  const s = g.sim; if (!s.mis.length) return;
  const rows = s.mis.map(m => { const p = Math.min(m.n, missionProgress(s, m)); return [m, p]; });
  const key = rows.map(([m, p]) => p + (m.done ? "d" : "")).join(","); if (key === g.misKey) return; g.misKey = key;
  $("g3mis").innerHTML = '<b>🎯 Nhiệm vụ hôm nay</b>' + rows.map(([m, p]) => '<div class="' + (m.done ? "done" : "") + '"><i>' + (m.done ? "✅" : MISSIONS[m.k].icon) + "</i><span>" + missionText(m) + "</span><em>" + (m.done ? "+200" : p + "/" + m.n) + "</em></div>").join("");
}
function zone(text) { const el = $("g3zone"); el.textContent = text; el.classList.remove("on"); void el.offsetWidth; el.classList.add("on"); }
function showQuiz(ev) {
  const Q = QUIZ[ev.q], el = $("g3q");
  el.className = "g3q on"; g.qSeq = (g.qSeq || 0) + 1;
  el.innerHTML = '<div class="qh"><img alt="" src="' + signURL(Q.sign) + '"><b>' + Q.q + "</b></div>" +
    '<div class="qa">' + [0, 1, 2].map(l => '<div data-l="' + l + '"><small>' + LANE_NAME[l] + "</small>" + Q.a[ev.order[l]] + "</div>").join("") + "</div>";
  beep("ok");
}
function answered(ev) {
  const Q = QUIZ[ev.q], el = $("g3q");
  el.classList.add(ev.ok ? "ok" : "no");
  el.querySelectorAll(".qa > div").forEach(d => { const l = +d.dataset.l; d.classList.toggle("right", l === ev.right); d.classList.toggle("mine", l === ev.lane && !ev.ok); });
  if (ev.ok) { msg($("g3msg"), "ok", "<b>✅ Chính xác! +" + (100 + 50 * Math.min(ev.streak - 1, 4)) + "</b>" + (ev.streak > 1 ? "<br>Đúng liên tiếp " + ev.streak + " câu" : ""), 1500); beep("coin"); }
  else { msg($("g3msg"), "no", "<b>❌ Chưa đúng −50</b><br>" + Q.tip, 2600); beep("bad"); vibrate(60); }
  const shown = g.qSeq; setTimeout(() => { if (g && g.qSeq === shown) el.classList.remove("on"); }, 1700);
}
function hud() { const s = g.sim; $("g3sc").textContent = score(s).toLocaleString("vi-VN"); $("g3m").textContent = Math.floor(s.dist) + " m" + (s.shield ? " · ⛑️" : ""); $("g3hp").textContent = "❤️".repeat(Math.max(0, s.lives)) + "🤍".repeat(3 - Math.max(0, s.lives)); }

function handle(ev) {
  if (ev.type === "quiz") return showQuiz(ev);
  if (ev.type === "answer") return answered(ev);
  if (ev.type === "mission") { msg($("g3msg"), "ok", "<b>🎯 Xong nhiệm vụ! +200</b><br>" + missionText(ev.m), 1600); beep("coin"); g.misKey = ""; return; }
  const o = ev.obj;
  if (ev.type === "spawn") { g.view.spawn(o); return; }
  g.view.remove(o, ev.type);
  if (ev.type === "hit") { const r = $("road"); r.classList.remove("hit"); void r.offsetWidth; r.classList.add("hit"); msg($("g3msg"), "no", "<b>" + OBSTACLES[o.ob][0] + " " + OBSTACLES[o.ob][1] + "</b><br>" + OBSTACLES[o.ob][2], 1800); beep("bad"); vibrate(90); }
  else if (ev.type === "shield") { msg($("g3msg"), "ok", "<b>⛑️ Mũ bảo hiểm đã bảo vệ bạn!</b><br>" + OBSTACLES[o.ob][2], 1800); beep("ok"); }
  else if (ev.type === "helmet") { msg($("g3msg"), "ok", "<b>⛑️ Đã đội mũ bảo hiểm</b><br>Được bảo vệ 1 lần va chạm", 1400); beep("ok"); }
  else if (ev.type === "coin" || ev.type === "star") beep("coin");
}
function loop(ts) {
  if (!g || !g.running) return;
  const dt = g.last == null ? 0 : Math.min(.1, (ts - g.last) / 1000); g.last = ts; g.acc += dt;
  const s = g.sim;
  while (g.acc >= DT && !s.over) {
    g.acc -= DT;
    while (g.pending.length) { const d = g.pending.shift(); if (act(s, d)) { g.inputs.push([s.frame, d]); if (d === ACT.LEFT || d === ACT.RIGHT) g.tilt = d * 18; } }
    step(s); s.events.forEach(handle); s.events.length = 0;
  }
  const mv = speed(s) * dt;
  const th = themeAt(s.dist); if (th !== g.theme) { g.theme = th; zone(THEMES.find(t => t[0] === th)[1]); }
  while (g.badge < BADGES.length && s.dist >= BADGES[g.badge]) { msg($("g3msg"), "ok", "<b>🏅 Huy hiệu " + BADGES[g.badge].toLocaleString("vi-VN") + " m</b>", 1400); g.badge++; }
  renderMissions();
  const tx = ROAD.LANES[s.lane]; g.px += (tx - g.px) * Math.min(1, dt * 14); g.tilt += (0 - g.tilt) * Math.min(1, dt * 6);
  g.view.frame(g, dt, mv);
  hud();
  if (s.over) return end();
  g.raf = requestAnimationFrame(loop);
}
async function end() {
  if (g.ending) return; g.ending = true; g.running = false; cancelAnimationFrame(g.raf);
  g.view.stop();
  try {
    const r = await post("/api/runs/" + g.run + "/finish", { inputs: g.inputs, frames: g.sim.frame });
    const tips = r.tips.map(i => OBSTACLES[i]), wrong = (r.qWrong || []).map(i => QUIZ[i]).filter(Boolean), mis = r.missions || [];
    const badge = BADGES.filter(b => r.stats.dist >= b).pop();
    let review = "";
    if (mis.length) review += '<div class="lbl">🎯 Nhiệm vụ hôm nay</div><ul class="rev g3mrev">' + mis.map(m => '<li class="' + (m.done ? "ok" : "") + '"><b>' + (m.done ? "✅ " : "⬜ ") + missionText(m) + "</b>" + (m.done ? "+200 điểm" : "Chưa xong, thử lại lượt sau nhé") + "</li>").join("") + "</ul>";
    if (badge) review += '<div class="g3badge">🏅 Huy hiệu <b>' + badge.toLocaleString("vi-VN") + " m</b></div>";
    if (wrong.length) review += '<div class="lbl">Câu luật cần nhớ</div><ul class="rev">' + wrong.map(q => "<li><b>" + q.q + " → " + q.a[0] + "</b>" + q.tip + "</li>").join("") + "</ul>";
    if (tips.length) review += '<div class="lbl">Ghi nhớ khi tham gia giao thông</div><ul class="rev">' + tips.map(d => "<li><b>" + d[0] + " " + d[1] + "</b>" + d[2] + "</li>").join("") + "</ul>";
    setTimeout(() => g.ctx.result("g3", r, [[r.stats.dist + " m", "Quãng đường"], [(r.stats.qOk || 0) + "/" + (r.stats.qN || 0), "Câu luật đúng"], [r.stats.coins, "Xu"]], review), 400);
  } catch (e) { g.ctx.toast(e.message); g.ctx.leave(); }
}
export { FPS };
