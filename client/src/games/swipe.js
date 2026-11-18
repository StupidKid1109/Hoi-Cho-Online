// Gian 1: Thật hay giả? Máy chủ giữ đáp án và chấm từng thẻ.
import { $, msg, beep, esc } from "../ui.js";
import { post } from "../api.js";

export const pre = ["🕵️", "Thật hay giả?", [["⬅️", "Vuốt trái nếu tin nhắn là lừa đảo"], ["➡️", "Vuốt phải nếu tin nhắn an toàn"], ["🔥", "Đúng liên tiếp được thưởng thêm, sai bị trừ 3 giây"], ["⏱️", "Có 60 giây"]]];
let g = null;

export async function start(ctx) {
  $("g1field").querySelectorAll(".scard").forEach(e => e.remove());
  const r = await post("/api/runs", { game: "g1" });
  g = { ctx, run: r.runId, cards: r.cards, dur: r.duration, i: 0, score: 0, streak: 0, deadline: performance.now() + r.duration * 1000, busy: false, running: true, ending: false, raf: 0 };
  $("g1sc").textContent = "0"; streakChip(); deal(); tick();
  if (!r.counted) ctx.toast("Ngoài thời gian đợt thưởng: lượt này để luyện tập, không tính điểm");
}
export function stop() { if (g) { g.running = false; cancelAnimationFrame(g.raf); } }
export function decide(saysScam) { answer(saysScam); }

const left = () => Math.max(0, (g.deadline - performance.now()) / 1000);
function tick() {
  if (!g || !g.running) return;
  const l = left(); $("g1t").style.transform = "scaleX(" + l / g.dur + ")"; $("g1tb").classList.toggle("warn", l < 10); $("g1sec").textContent = Math.ceil(l) + "s";
  if (l <= 0 && !g.busy) return end();
  g.raf = requestAnimationFrame(tick);
}
function streakChip() { const c = $("g1st"); c.textContent = "🔥 Chuỗi " + g.streak; c.classList.toggle("hot", g.streak >= 3); }
function card(c, back) {
  const el = document.createElement("div"); el.className = "scard" + (back ? " back" : "");
  el.innerHTML = '<span class="stamp no">LỪA ĐẢO</span><span class="stamp yes">AN TOÀN</span><div class="from"><span class="ic">' + c.icon + "</span>" + esc(c.from) + '</div><div class="txt">' + esc(c.text) + "</div>";
  return el;
}
function deal() {
  const f = $("g1field"); f.querySelectorAll(".scard").forEach(e => e.remove());
  if (g.i >= g.cards.length) return end();
  if (g.cards[g.i + 1]) f.insertBefore(card(g.cards[g.i + 1], true), f.firstChild);
  const el = card(g.cards[g.i], false); el.style.zIndex = 2; el.classList.add("deal"); f.appendChild(el); g.el = el; setTimeout(() => el.classList.remove("deal"), 400);
  let x0 = null, dx = 0;
  el.onpointerdown = e => { if (g.busy || !g.running) return; x0 = e.clientX; dx = 0; try { el.setPointerCapture(e.pointerId); } catch (_) { /* bỏ qua */ } el.style.transition = "none"; };
  el.onpointermove = e => { if (x0 == null) return; dx = e.clientX - x0; el.style.transform = "translateY(-50%) translateX(" + dx + "px) rotateY(" + dx / 7 + "deg) rotateZ(" + dx / 22 + "deg)";
    el.style.setProperty("--n", Math.max(0, Math.min(1, -dx / 90))); el.style.setProperty("--y", Math.max(0, Math.min(1, dx / 90))); };
  el.onpointerup = el.onpointercancel = () => { if (x0 == null) return; x0 = null; el.style.transition = "";
    if (Math.abs(dx) > 90) answer(dx < 0); else { el.style.transform = ""; el.style.setProperty("--n", 0); el.style.setProperty("--y", 0); } };
}
async function answer(saysScam) {
  if (!g || g.busy || !g.running) return; g.busy = true;
  const el = g.el, k = g.i;
  el.style.transition = "transform .25s ease-in, opacity .25s"; el.style.transform = "translateY(-50%) translateX(" + (saysScam ? -520 : 520) + "px) rotateY(" + (saysScam ? -60 : 60) + "deg) rotateZ(" + (saysScam ? -20 : 20) + "deg)"; el.style.opacity = "0";
  let r;
  try { r = await post("/api/runs/" + g.run + "/answer", { k, scam: saysScam }); }
  catch (e) { g.busy = false; g.ctx.toast(e.message); return end(); }
  if (!g.running) return;
  if (r.done && r.ok === undefined) return end();
  g.i++; g.score = r.score; g.streak = r.streak;
  g.deadline = performance.now() + r.left * 1000; // đồng bộ thời gian còn lại theo máy chủ
  if (r.ok) { msg($("g1msg"), "ok", "<b>✓ Chính xác! +" + r.gain + "</b>", 900); beep("ok"); }
  else { msg($("g1msg"), "no", "<b>✕ Đây là tin " + (r.scam ? "lừa đảo" : "an toàn") + " (−3 giây)</b><br>" + esc(r.why), 2400); beep("bad"); }
  $("g1sc").textContent = g.score; streakChip();
  setTimeout(() => { if (!g.running) return; g.busy = false; if (r.done) end(); else deal(); }, 200);
}
async function end() {
  if (!g || g.ending) return; g.ending = true; g.running = false; cancelAnimationFrame(g.raf);
  try {
    const r = await post("/api/runs/" + g.run + "/finish");
    const review = r.review.length ? '<div class="lbl">Xem lại những thẻ nhầm</div><ul class="rev">' + r.review.map(c => "<li><b>" + c.icon + " " + (c.scam ? "Lừa đảo" : "An toàn") + ": " + esc(c.text) + "</b>" + esc(c.why) + "</li>").join("") + "</ul>" : '<div class="lbl">Không nhầm thẻ nào. Xuất sắc!</div>';
    g.ctx.result("g1", r, [[r.stats.ok + "/" + r.stats.n, "Thẻ đúng"], [(r.stats.n ? Math.round(100 * r.stats.ok / r.stats.n) : 0) + "%", "Chính xác"], ["🔥" + r.stats.top, "Chuỗi dài nhất"]], review);
  } catch (e) { g.ctx.toast(e.message); g.ctx.leave(); }
}
