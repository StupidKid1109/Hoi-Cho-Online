// Gian 3: Đường về an toàn (3D). Mô phỏng tất định dùng chung với máy chủ; máy chủ chạy lại để chấm điểm.
import { $, msg, beep } from "../ui.js";
import { post } from "../api.js";
import { vibrate } from "../platform.js";
import { createSim, step, steer, score, ROAD, OBSTACLES, FPS, DT } from "../../../shared/runnerSim.js";

export const pre = ["🛵", "Đường về an toàn", [["👆", "Vuốt hoặc chạm trái, phải để đổi làn"], ["🚫", "Né các lỗi vi phạm: rượu bia, đèn đỏ, điện thoại…"], ["⛑️", "Nhặt mũ bảo hiểm để được bảo vệ 1 lần"], ["❤️", "Có 3 mạng, chạy càng xa càng nhiều điểm"]]];
const ICON = { coin: "🪙", star: "⭐", helmet: "⛑️" };
let g = null;

const bb = (cls, inner, shadow) => (shadow ? '<div class="rsh"></div>' : "") + '<div class="bb"><div class="bbi ' + cls + '">' + inner + "</div></div>";

export async function start(ctx) {
  const rp = $("rplane"); rp.querySelectorAll(".ro3").forEach(e => e.remove());
  const r = await post("/api/runs", { game: "g3" });
  g = { ctx, run: r.runId, sim: createSim(r.seed), inputs: [], pending: [], els: new Map(), trees: [], acc: 0, last: null, px: ROAD.LANES[1], tilt: 0, off: 0, running: true, raf: 0, ending: false };
  const p = document.createElement("div"); p.className = "ro3 pl3"; p.id = "g3p"; p.innerHTML = bb("", '<span class="e">🛵</span>', true); rp.appendChild(p);
  for (let y = ROAD.SPAWN; y < ROAD.L; y += 320) { tree(y, 0); tree(y + 160, 1); }
  if (!r.counted) ctx.toast("Ngoài thời gian đợt thưởng: lượt này để luyện tập, không tính điểm");
  hud(); g.raf = requestAnimationFrame(loop);
}
export function stop() { if (g) { g.running = false; cancelAnimationFrame(g.raf); } }
/** Đổi làn. Thao tác được ghi theo số khung hình để máy chủ chạy lại đúng như vậy. */
export function move(d) { if (!g || !g.running || g.sim.over) return; g.pending.push(d); }

function tree(y, side) {
  const el = document.createElement("div"); el.className = "ro3"; el.innerHTML = bb("tree", '<span class="e">' + ["🌳", "🌴", "🏡", "🌳", "🏪"][Math.floor(Math.random() * 5)] + "</span>", false);
  $("rplane").appendChild(el); g.trees.push({ el, x: side ? 560 : 80, y });
}
function place(el, x, y) { el.style.opacity = Math.min(1, (y - ROAD.SPAWN) / 260); el.style.transform = "translate3d(" + x + "px," + y.toFixed(1) + "px,0)"; }
function hud() { const s = g.sim; $("g3sc").textContent = score(s).toLocaleString("vi-VN"); $("g3m").textContent = Math.floor(s.dist) + " m" + (s.shield ? " · ⛑️" : ""); $("g3hp").textContent = "❤️".repeat(Math.max(0, s.lives)) + "🤍".repeat(3 - Math.max(0, s.lives)); }

function handle(ev) {
  const o = ev.obj;
  if (ev.type === "spawn") {
    const el = document.createElement("div"); el.className = "ro3";
    el.innerHTML = o.kind === "obs" ? bb("", '<span class="e">' + OBSTACLES[o.ob][0] + '</span><span class="l">' + OBSTACLES[o.ob][1] + "</span>", true) : bb("pk", '<span class="e">' + ICON[o.kind] + "</span>", true);
    $("rplane").appendChild(el); g.els.set(o.id, el); return;
  }
  const el = g.els.get(o.id); if (el) { el.remove(); g.els.delete(o.id); }
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
    while (g.pending.length) { const d = g.pending.shift(), before = s.lane; steer(s, d); if (s.lane !== before) { g.inputs.push([s.frame, d]); g.tilt = d * 18; } }
    step(s); s.events.forEach(handle); s.events.length = 0;
  }
  const mv = Math.min(1500, 620 + 22 * s.t) * dt;
  g.off += mv; $("g3ln").style.webkitMaskPosition = "0 " + g.off.toFixed(0) + "px"; $("g3ln").style.maskPosition = "0 " + g.off.toFixed(0) + "px";
  const tx = ROAD.LANES[s.lane]; g.px += (tx - g.px) * Math.min(1, dt * 14); g.tilt += (0 - g.tilt) * Math.min(1, dt * 6);
  for (const t of g.trees) { t.y += mv; if (t.y > ROAD.L + 100) t.y -= (ROAD.L + 100 - ROAD.SPAWN); place(t.el, t.x, t.y); }
  for (const o of s.objs) { const el = g.els.get(o.id); if (el) place(el, ROAD.LANES[o.lane], o.y); }
  const p = $("g3p"); p.style.transform = "translate3d(" + g.px.toFixed(1) + "px," + ROAD.PY + "px,0)"; p.querySelector(".e").style.transform = "rotateZ(" + g.tilt.toFixed(1) + "deg)";
  p.classList.toggle("sh", s.shield); p.classList.toggle("inv", s.inv > 0);
  hud();
  if (s.over) return end();
  g.raf = requestAnimationFrame(loop);
}
async function end() {
  if (g.ending) return; g.ending = true; g.running = false; cancelAnimationFrame(g.raf);
  try {
    const r = await post("/api/runs/" + g.run + "/finish", { inputs: g.inputs, frames: g.sim.frame });
    const tips = r.tips.map(i => OBSTACLES[i]);
    setTimeout(() => g.ctx.result("g3", r, [[r.stats.dist + " m", "Quãng đường"], [r.stats.coins, "Xu"], [r.stats.stars, "Sao"]],
      tips.length ? '<div class="lbl">Ghi nhớ khi tham gia giao thông</div><ul class="rev">' + tips.map(d => "<li><b>" + d[0] + " " + d[1] + "</b>" + d[2] + "</li>").join("") + "</ul>" : ""), 400);
  } catch (e) { g.ctx.toast(e.message); g.ctx.leave(); }
}
export { FPS };
