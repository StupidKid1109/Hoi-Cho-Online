// Gian 3: Đường về an toàn. Mô phỏng tất định dùng chung với máy chủ; máy chủ chạy lại để chấm điểm.
// File này giữ vòng mô phỏng bước cố định và việc ghi thao tác (inputs) gửi máy chủ.
// Phần vẽ tách riêng: runner3d.js (Three.js) hoặc runnerCss.js (CSS 3D, khi không có WebGL).
import { $, msg, beep } from "../ui.js";
import { post } from "../api.js";
import { vibrate } from "../platform.js";
import { hasWebGL } from "../gfx/webgl.js";
import { createSim, step, steer, score, ROAD, OBSTACLES, FPS, DT } from "../../../shared/runnerSim.js";
import * as cssView from "./runnerCss.js";

export const pre = ["🛵", "Đường về an toàn", [["👆", "Vuốt hoặc chạm trái, phải để đổi làn"], ["🚫", "Né các lỗi vi phạm: rượu bia, đèn đỏ, điện thoại…"], ["⛑️", "Nhặt mũ bảo hiểm để được bảo vệ 1 lần"], ["❤️", "Có 3 mạng, chạy càng xa càng nhiều điểm"]]];
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
  g = { ctx, run: r.runId, sim: createSim(r.seed), inputs: [], pending: [], acc: 0, last: null, px: ROAD.LANES[1], tilt: 0, running: true, raf: 0, ending: false, view };
  try { view.init(g); }
  catch (e) {
    if (view === cssView) throw e;
    console.warn("Không dựng được cảnh WebGL cho Gian 3, dùng bản CSS 3D:", e);
    view3d = null; view = g.view = cssView; view.init(g);
  }
  if (!r.counted) ctx.toast("Ngoài thời gian đợt thưởng: lượt này để luyện tập, không tính điểm");
  hud(); g.raf = requestAnimationFrame(loop);
}
export function stop() { if (g) { g.running = false; cancelAnimationFrame(g.raf); g.view.stop(); } }
/** Đổi làn. Thao tác được ghi theo số khung hình để máy chủ chạy lại đúng như vậy. */
export function move(d) { if (!g || !g.running || g.sim.over) return; g.pending.push(d); }

function hud() { const s = g.sim; $("g3sc").textContent = score(s).toLocaleString("vi-VN"); $("g3m").textContent = Math.floor(s.dist) + " m" + (s.shield ? " · ⛑️" : ""); $("g3hp").textContent = "❤️".repeat(Math.max(0, s.lives)) + "🤍".repeat(3 - Math.max(0, s.lives)); }

function handle(ev) {
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
    while (g.pending.length) { const d = g.pending.shift(), before = s.lane; steer(s, d); if (s.lane !== before) { g.inputs.push([s.frame, d]); g.tilt = d * 18; } }
    step(s); s.events.forEach(handle); s.events.length = 0;
  }
  const mv = Math.min(1500, 620 + 22 * s.t) * dt;
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
    const tips = r.tips.map(i => OBSTACLES[i]);
    setTimeout(() => g.ctx.result("g3", r, [[r.stats.dist + " m", "Quãng đường"], [r.stats.coins, "Xu"], [r.stats.stars, "Sao"]],
      tips.length ? '<div class="lbl">Ghi nhớ khi tham gia giao thông</div><ul class="rev">' + tips.map(d => "<li><b>" + d[0] + " " + d[1] + "</b>" + d[2] + "</li>").join("") + "</ul>" : ""), 400);
  } catch (e) { g.ctx.toast(e.message); g.ctx.leave(); }
}
export { FPS };
