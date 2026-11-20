// Gian 1: Thật hay giả? – đấu phòng 20–50 người.
// Máy chủ ghép phòng, gửi cùng một tin nhắn cho cả phòng, giữ đáp án, tính giờ và chấm điểm.
import { $, msg, beep, esc } from "../ui.js";
import { lobbyEl, renderLobby, hideLobby, roomBoard, top3 } from "./lobby.js";

export const pre = ["🕵️", "Thật hay giả? · Đấu phòng", [["👥", "Cần ít nhất 20 người, tối đa 50 người cùng chơi một phòng"], ["📱", "10 tin nhắn, mỗi tin 10 giây: vuốt trái nếu lừa đảo, vuốt phải nếu an toàn"], ["⚡", "Đúng và càng nhanh càng nhiều điểm, đúng liên tiếp được thưởng thêm"], ["🏆", "Xếp hạng trong phòng; điểm tính vào Bảng vàng"]]];
let g = null;

export async function start(ctx) {
  stop();
  $("g1field").querySelectorAll(".scard").forEach(e => e.remove());
  g = { ctx, running: true, k: -1, picked: null, raf: 0, score: 0, lobby: lobbyEl("g1") };
  $("g1sc").textContent = "0"; $("g1st").textContent = "Đang chờ phòng"; $("g1sec").textContent = "–";
  $("g1t").style.transform = "scaleX(1)";
  setButtons(false);
  if (ctx.space) ctx.space.show();
  ctx.send({ t: "mjoin", g: "g1" });
}
/** Rời gian hàng: báo máy chủ rời phòng chờ hoặc rời ván. */
export function stop() {
  if (!g) return;
  if (g.running) g.ctx.send({ t: "mleave" });
  g.running = false; cancelAnimationFrame(g.raf); hideLobby(g.lobby);
}
/** Nút hoặc phím: true = cho là lừa đảo. */
export function decide(saysScam) { answer(saysScam); }

/** Tin nhắn đấu phòng từ máy chủ (main.js chuyển sang). */
export function onMsg(m) {
  if (!g || !g.running) return;
  if (m.t === "mlobby") { if (g.ctx.space) g.ctx.space.lobby(m); else renderLobby(g.lobby, m, "Thật hay giả?", "#c8102e", () => g.ctx.leave()); }
  else if (m.t === "merr") { g.ctx.toast(m.text); g.ctx.leave(); }
  else if (m.t === "mstart") { hideLobby(g.lobby); if (g.ctx.space) g.ctx.space.hide(); msg($("g1msg"), "ok", "<b>Phòng đã đủ " + m.n + " người!</b><br>Chuẩn bị: " + m.total + " tin nhắn", 2200); beep("ok"); }
  else if (m.t === "mround") round(m);
  else if (m.t === "mreveal") reveal(m);
  else if (m.t === "mend") end(m);
}

function setButtons(on) { $("g1no").disabled = !on; $("g1yes").disabled = !on; }
function card(c) {
  const el = document.createElement("div"); el.className = "scard";
  el.innerHTML = '<span class="stamp no">LỪA ĐẢO</span><span class="stamp yes">AN TOÀN</span><div class="from"><span class="ic">' + c.icon + "</span>" + esc(c.from) + '</div><div class="txt">' + esc(c.text) + "</div>";
  return el;
}
function round(m) {
  const f = $("g1field"); f.querySelectorAll(".scard,.waitnote").forEach(e => e.remove());
  g.k = m.k; g.picked = null; g.endAt = performance.now() + m.dur; g.dur = m.dur;
  $("g1st").textContent = "Tin " + (m.k + 1) + "/" + m.total;
  const el = card(m.card); el.style.zIndex = 2; el.classList.add("deal"); f.appendChild(el); g.el = el; setTimeout(() => el.classList.remove("deal"), 400);
  setButtons(true);
  let x0 = null, dx = 0;
  el.onpointerdown = e => { if (g.picked !== null) return; x0 = e.clientX; dx = 0; try { el.setPointerCapture(e.pointerId); } catch (_) { /* bỏ qua */ } el.style.transition = "none"; };
  el.onpointermove = e => { if (x0 == null) return; dx = e.clientX - x0; el.style.transform = "translateY(-50%) translateX(" + dx + "px) rotateY(" + dx / 7 + "deg) rotateZ(" + dx / 22 + "deg)";
    el.style.setProperty("--n", Math.max(0, Math.min(1, -dx / 90))); el.style.setProperty("--y", Math.max(0, Math.min(1, dx / 90))); };
  el.onpointerup = el.onpointercancel = () => { if (x0 == null) return; x0 = null; el.style.transition = "";
    if (Math.abs(dx) > 90) answer(dx < 0); else { el.style.transform = ""; el.style.setProperty("--n", 0); el.style.setProperty("--y", 0); } };
  cancelAnimationFrame(g.raf); tick();
}
function tick() {
  if (!g || !g.running) return;
  const l = Math.max(0, (g.endAt - performance.now()) / g.dur);
  $("g1t").style.transform = "scaleX(" + l + ")"; $("g1tb").classList.toggle("warn", l < .3); $("g1sec").textContent = Math.ceil(l * g.dur / 1000) + "s";
  if (l > 0) g.raf = requestAnimationFrame(tick);
}
function answer(saysScam) {
  if (!g || !g.running || g.k < 0 || g.picked !== null || !g.el) return;
  g.picked = saysScam; setButtons(false);
  g.ctx.send({ t: "mans", k: g.k, a: saysScam });
  const el = g.el;
  el.style.transition = "transform .25s ease-in, opacity .25s"; el.style.transform = "translateY(-50%) translateX(" + (saysScam ? -520 : 520) + "px) rotateY(" + (saysScam ? -60 : 60) + "deg) rotateZ(" + (saysScam ? -20 : 20) + "deg)"; el.style.opacity = "0";
  const w = document.createElement("div"); w.className = "waitnote"; w.innerHTML = "Bạn chọn <b>" + (saysScam ? "Lừa đảo" : "An toàn") + "</b><br><small>Chờ mọi người trả lời…</small>";
  $("g1field").appendChild(w);
}
function reveal(m) {
  setButtons(false); cancelAnimationFrame(g.raf); $("g1t").style.transform = "scaleX(0)"; $("g1sec").textContent = "0s";
  g.score = m.you.score; $("g1sc").textContent = g.score.toLocaleString("vi-VN");
  const truth = m.scam ? "lừa đảo" : "an toàn";
  if (m.you.ok) { msg($("g1msg"), "ok", "<b>✓ Chính xác! +" + m.you.gain + "</b> · hạng " + m.rank + "/" + m.n + "<br>" + esc(m.why), m.next); beep("ok"); }
  else { msg($("g1msg"), "no", "<b>" + (m.you.answered ? "✕ Chưa đúng" : "⏱ Hết giờ") + ": đây là tin " + truth + "</b> · hạng " + m.rank + "/" + m.n + "<br>" + esc(m.why), m.next); beep("bad"); }
  const f = $("g1field"); f.querySelectorAll(".scard,.waitnote").forEach(e => e.remove());
  const w = document.createElement("div"); w.className = "waitnote rv";
  w.innerHTML = '<div class="pct"><span class="no" style="width:' + m.pctScam + '%">' + m.pctScam + '% Lừa đảo</span><span class="yes" style="width:' + (100 - m.pctScam) + '%">' + (100 - m.pctScam) + "% An toàn</span></div>" +
    "<small>" + m.answered + "/" + m.n + " người đã trả lời</small>" + top3(m.top) + (m.last ? "<small>Đang tổng kết…</small>" : "<small>Tin tiếp theo sắp hiện…</small>");
  f.appendChild(w);
  $("g1st").textContent = m.you.streak >= 2 ? "🔥 Chuỗi " + m.you.streak : "Tin " + (m.k + 1);
}
function end(m) {
  g.running = false; cancelAnimationFrame(g.raf);
  $("g1field").querySelectorAll(".scard,.waitnote").forEach(e => e.remove());
  const r = m.result;
  const review = r.review.length ? '<div class="lbl">Xem lại những tin nhầm</div><ul class="rev">' + r.review.map(c => "<li><b>" + c.icon + " " + (c.scam ? "Lừa đảo" : "An toàn") + ": " + esc(c.text) + "</b>" + esc(c.why) + "</li>").join("") + "</ul>" : '<div class="lbl">Không nhầm tin nào. Xuất sắc!</div>';
  g.ctx.result("g1", r, [["#" + m.rank + "/" + m.n, "Hạng trong phòng"], [r.stats.ok + "/" + r.stats.n, "Tin đúng"], ["🔥" + r.stats.top, "Chuỗi dài nhất"]], roomBoard(m) + review);
}
