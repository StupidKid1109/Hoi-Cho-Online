// Gian 3: phần vẽ bằng CSS 3D (dùng khi máy không có WebGL hoặc chạy mã nguồn chưa build).
// Chỉ vẽ; mô phỏng và ghi thao tác nằm ở runner.js.
import { $ } from "../ui.js";
import { ROAD, OBSTACLES, JUMP_FRAMES } from "../../../shared/runnerSim.js";

const ICON = { coin: "🪙", star: "⭐", helmet: "⛑️" };
const bb = (cls, inner, shadow) => (shadow ? '<div class="rsh"></div>' : "") + '<div class="bb"><div class="bbi ' + cls + '">' + inner + "</div></div>";
let v = null;

export function init() {
  const road = $("road"); road.classList.remove("gl");
  road.querySelectorAll(".gl3,.g3tap").forEach(e => e.remove());
  const rp = $("rplane"); rp.querySelectorAll(".ro3").forEach(e => e.remove());
  v = { els: new Map(), trees: [], off: 0 };
  const p = document.createElement("div"); p.className = "ro3 pl3"; p.id = "g3p"; p.innerHTML = bb("", '<span class="e">🛵</span>', true); rp.appendChild(p);
  for (let y = ROAD.SPAWN; y < ROAD.L; y += 320) { tree(y, 0); tree(y + 160, 1); }
}
export function stop() { /* không có gì phải dừng */ }

function tree(y, side) {
  const el = document.createElement("div"); el.className = "ro3"; el.innerHTML = bb("tree", '<span class="e">' + ["🌳", "🌴", "🏡", "🌳", "🏪"][Math.floor(Math.random() * 5)] + "</span>", false);
  $("rplane").appendChild(el); v.trees.push({ el, x: side ? 560 : 80, y });
}
function place(el, x, y) { el.style.opacity = Math.min(1, (y - ROAD.SPAWN) / 260); el.style.transform = "translate3d(" + x + "px," + y.toFixed(1) + "px,0)"; }

export function spawn(o) {
  const el = document.createElement("div"); el.className = "ro3";
  const how = o.kind === "obs" ? OBSTACLES[o.ob][3] : "", hint = how === "low" ? " ⬆" : how === "high" ? " ⬇" : "";
  el.innerHTML = o.kind === "obs" ? bb(how === "high" ? "hi" : "", '<span class="e">' + OBSTACLES[o.ob][0] + '</span><span class="l">' + OBSTACLES[o.ob][1] + hint + "</span>", true) : bb("pk", '<span class="e">' + ICON[o.kind] + "</span>", true);
  $("rplane").appendChild(el); v.els.set(o.id, el);
}
export function remove(o) { const el = v.els.get(o.id); if (el) { el.remove(); v.els.delete(o.id); } }

/** Vẽ một khung hình. g: trạng thái lượt chơi (sim, px, tilt), mv: quãng đường đường chạy trôi trong khung này. */
export function frame(g, dt, mv) {
  const s = g.sim;
  v.off += mv; $("g3ln").style.webkitMaskPosition = "0 " + v.off.toFixed(0) + "px"; $("g3ln").style.maskPosition = "0 " + v.off.toFixed(0) + "px";
  for (const t of v.trees) { t.y += mv; if (t.y > ROAD.L + 100) t.y -= (ROAD.L + 100 - ROAD.SPAWN); place(t.el, t.x, t.y); }
  for (const o of s.objs) { const el = v.els.get(o.id); if (el) place(el, ROAD.LANES[o.lane], o.y); }
  const p = $("g3p"); p.style.transform = "translate3d(" + g.px.toFixed(1) + "px," + ROAD.PY + "px,0)";
  const hJump = s.air > 0 ? Math.sin((1 - s.air / JUMP_FRAMES) * Math.PI) : 0; // nhảy: bật lên; cúi: thấp xuống
  p.querySelector(".e").style.transform = "translateY(" + (-hJump * 70).toFixed(0) + "px) rotateZ(" + g.tilt.toFixed(1) + "deg) scaleY(" + (s.duck > 0 ? 0.62 : 1) + ")";
  p.classList.toggle("sh", s.shield); p.classList.toggle("inv", s.inv > 0);
}
