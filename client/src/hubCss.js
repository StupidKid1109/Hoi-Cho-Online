// Sảnh hội chợ 3D (CSS 3D): đi lại tự do, máy quay xoay quanh nhân vật, thấy người chơi khác trong cùng khu.
import { $, esc, beep } from "./ui.js";
import { BOOTHS, PLACE_NAME, CAFE } from "./config.js";
import { WORLD, CENTER, GATE, SPAWN, SPOTS, LOCKED, BLOCK, FAIR_R, standPoint } from "../../shared/world.js";

// Bố cục lấy từ shared/world.js (dùng chung với bản Three.js và máy chủ).
const FW = WORLD, CX = CENTER.x, CY = CENTER.y, FLOOR_R = FAIR_R + 300;
export const EMOTES = [["👋", "Chào"], ["🙏", "Cảm ơn"], ["👏", "Vỗ tay"], ["🎉", "Chúc mừng"]];
const PEOPLE = ["👩", "👨", "🧒", "👧", "🧓", "👵", "👦", "🧑‍🦱", "👱"];
const WOOD = "--fr:linear-gradient(180deg,#a8692f,#7a4a1f);--sd:#6b3d1a;--tp:#5e3816";

const me = { x: SPAWN.x, y: SPAWN.y }, cam = { x: SPAWN.x, y: SPAWN.y, yaw: 0, zoom: -1200, tilt: 84 }, camT = { zoom: 0, tilt: 58, yaw: null };
let target = null, onArrive = null, zoomCb = null, raf = 0, last = null, keys = {}, moved = false, sentAt = 0, sentX = 0, sentY = 0;
let ctx = null, peers = new Map(), OCC = [], hidden = new Set();

/* ---------- Dựng cảnh ---------- */
function cub(w, h, d, vars, front, lift = 0, dx = 0) {
  return '<div class="cub" style="width:' + w + "px;height:" + h + "px;left:" + (dx - w / 2) + "px;top:" + (-h - lift) + "px;" + vars + '">' +
    '<div class="fc fr" style="width:' + w + "px;height:" + h + "px;transform:translateZ(" + d / 2 + 'px)">' + (front || "") + "</div>" +
    '<div class="fc bk" style="width:' + w + "px;height:" + h + "px;transform:rotateY(180deg) translateZ(" + d / 2 + 'px)"></div>' +
    '<div class="fc lf" style="width:' + d + "px;height:" + h + "px;left:" + (w - d) / 2 + "px;transform:rotateY(-90deg) translateZ(" + w / 2 + 'px)"></div>' +
    '<div class="fc rt" style="width:' + d + "px;height:" + h + "px;left:" + (w - d) / 2 + "px;transform:rotateY(90deg) translateZ(" + w / 2 + 'px)"></div>' +
    '<div class="fc tp" style="width:' + w + "px;height:" + d + "px;top:" + (h - d) / 2 + "px;transform:rotateX(90deg) translateZ(" + h / 2 + 'px)"></div></div>';
}
const at = (x, y, inner, rot, id) => { if (id) OCC.push({ id, x, y }); return '<div class="o"' + (id ? ' id="' + id + '"' : "") + ' style="transform:translate3d(' + x + "px," + y + "px,0)" + (rot ? " rotateZ(" + rot + "deg)" : "") + ';transition:opacity .25s">' + inner + "</div>"; };
const up = inner => '<div class="up">' + inner + "</div>";
const bill = (x, y, inner) => '<div class="o" style="transform:translate3d(' + x + "px," + y + 'px,0)"><div class="bill">' + inner + "</div></div>";
const shadowAt = (w, h) => '<div class="shadow" style="left:' + (-w / 2) + "px;top:" + (-h / 2) + "px;width:" + w + "px;height:" + h + 'px"></div>';
function stall(b, w, hh, d) {
  return shadowAt(w + 70, d + 60) + up(
    cub(w, hh, d, WOOD, '<div class="bwin">' + b.icons + '</div><div class="bctr">' + b.goods + "</div>") +
    '<div class="awn3" style="--c:' + b.c + ";width:" + (w + 26) + "px;left:" + (-(w + 26) / 2) + "px;top:" + (-hh - 6) + "px;transform:translateZ(" + (d / 2 + 2) + 'px) rotateX(-38deg)"></div>' +
    '<div class="sign3" style="--c:' + b.c + ";left:-85px;width:170px;top:" + (-hh - 92) + "px;transform:translateZ(" + (d / 2 - 20) + 'px)"><small>' + b.tag + "</small>" + b.name + "</div>" +
    '<span class="bbest" id="bb_' + b.id + '" style="left:-40px;top:' + (-hh - 122) + "px;transform:translateZ(" + (d / 2 - 20) + 'px)"></span>' +
    '<div class="hit3" data-id="' + b.id + '" style="left:-110px;top:' + (-hh - 100) + "px;width:220px;height:" + (hh + 100) + "px;transform:translateZ(" + (d / 2 + 4) + 'px)" role="button" aria-label="' + b.tag + ": " + b.name + '"></div>');
}
function avHTML(id, name, emo, mine) {
  return '<div class="o" id="' + id + '">' + shadowAt(52, 24) + '<div class="bill"><div class="avt' + (mine ? " mine" : "") + '"><span class="bub"></span><span class="me">' + emo + '</span><span class="nm">' + esc(name) + "</span></div></div></div>";
}

export function buildHub(context) {
  ctx = context; OCC = []; peers = new Map(); hidden = new Set(ctx.hidden || []);
  // Nền chỉ phủ khu hội chợ (không phủ cả sân) để máy yếu không phải vẽ một lớp hình quá lớn
  const F0 = CX - FLOOR_R, FS = FLOOR_R * 2, G0 = F0 - 800, GS = FS + 1600;
  let h = '<div class="grass" style="left:' + G0 + "px;top:" + G0 + "px;width:" + GS + "px;height:" + GS + 'px"></div><div class="floor" id="floor" style="left:' + F0 + "px;top:" + F0 + "px;width:" + FS + "px;height:" + FS + 'px"></div>';
  for (let i = 0; i < 48; i++) { const a = i / 48 * 6.283; if (Math.abs(a - Math.PI / 2) < .25) continue; h += bill(CX + Math.cos(a) * (FAIR_R + 120), CY + Math.sin(a) * (FAIR_R + 120), '<div class="bi3"><span class="tree3">' + ["🌳", "🌸", "🌳", "🌴"][i % 4] + "</span></div>"); }
  for (let i = 0; i < 28; i++) { const a = i / 28 * 6.283 + .1; if (Math.abs(a - Math.PI / 2) < .15) continue; const x = CX + Math.cos(a) * (FAIR_R - 35), y = CY + Math.sin(a) * (FAIR_R - 35);
    h += at(x, y, up(cub(10, 220, 10, "--fr:#6b3d1a;--sd:#4a2a10;--tp:#6b3d1a"))) + bill(x, y, '<div class="bi3" style="bottom:192px"><span class="lanp" style="animation-delay:' + (-i * .37) + 's">🏮</span></div>'); }
  const red = "--fr:linear-gradient(90deg,#a50e27,#e01b3c,#a50e27);--sd:#8f0b20;--tp:#c8102e";
  h += at(GATE.x, GATE.y, shadowAt(320, 60) + up(cub(24, 250, 24, red, "", 0, -125) + cub(24, 250, 24, red, "", 0, 125) +
    cub(290, 66, 30, "--fr:linear-gradient(180deg,#e01b3c,#a50e27);--sd:#8f0b20;--tp:#c8102e", '<div class="beamtx">HỘI CHỢ ONLINE<small>' + esc(PLACE_NAME) + "</small></div>", 220)), 0, "occ_gate");
  BOOTHS.forEach(b => { const sp = SPOTS[b.id]; h += at(sp.x, sp.y, stall(b, 200, 130, 110), sp.r, "occ_" + b.id); });
  h += at(SPOTS.cafe.x, SPOTS.cafe.y, stall({ ...CAFE, goods: "Cà phê · nhạc" }, 200, 130, 110), SPOTS.cafe.r, "occ_cafe"); // quán cà phê
  LOCKED.map(l => [l.x, l.y, l.r, l.name]).forEach(g => h += at(g[0], g[1], shadowAt(220, 150) + up(cub(160, 110, 100, "--fr:linear-gradient(180deg,#8a7a6a,#5e5246);--sd:#4f453b;--tp:#4f453b", '<div class="soon">🔒 ' + g[3] + "<small>Sắp mở</small></div>")), g[2], "occ_s" + g[3].slice(-1)));
  const S = SPOTS.board;
  h += at(S.x, S.y, shadowAt(240, 90) + up(
    cub(12, 90, 12, "--fr:#8a5a00;--sd:#6b4600;--tp:#8a5a00", "", 0, -55) + cub(12, 90, 12, "--fr:#8a5a00;--sd:#6b4600;--tp:#8a5a00", "", 0, 55) +
    cub(180, 120, 16, "--fr:linear-gradient(160deg,#ffe07a,#f2b51c);--sd:#b98100;--tp:#d99a00", '<div class="boardtx"><b>🏆 BẢNG VÀNG</b><small>Xếp hạng chung 3 gian</small><span class="tpb" id="bdTop"></span></div>', 80) +
    '<div class="hit3" data-id="board" style="left:-95px;top:-205px;width:190px;height:205px;transform:translateZ(12px)" role="button" aria-label="Bảng vàng"></div>'), 0, "occ_board");
  h += avHTML("avo", ctx.nick + " (bạn)", "🧑", true);
  $("cam").innerHTML = h;
  let st = ""; for (let i = 0; i < 46; i++) st += '<i style="left:' + (i * 37 % 100) + "%;top:" + (i * 53 % 90) + "%;animation-delay:" + (-(i % 9) * .3) + 's"></i>'; $("sky").innerHTML = st;
  $("jumps").innerHTML = BOOTHS.map(b => '<button data-j="' + b.id + '"><i>' + b.icons.slice(0, 2) + "</i>" + b.tag + "</button>").join("") + '<button data-j="cafe"><i>☕</i>Cà phê</button><button data-j="board"><i>🏆</i>Bảng vàng</button>';
  $("jumps").querySelectorAll("button").forEach(btn => btn.onclick = () => goTo(btn.dataset.j));
  $("emo").innerHTML = EMOTES.map((e, i) => '<button data-e="' + i + '"><i>' + e[0] + "</i>" + e[1] + "</button>").join("");
  $("emo").querySelectorAll("button").forEach(btn => btn.onclick = () => { const i = +btn.dataset.e; bubble("avo", EMOTES[i][0]); beep("coin"); ctx.send({ t: "emote", e: i }); ctx.onEmote && ctx.onEmote(i); });
  bindInput();
  cam.zoom = -1200; cam.tilt = 84;
}

/* ---------- Người chơi khác ---------- */
function peerEl(p) {
  if (!$("p_" + p.id)) {
    const wrap = document.createElement("div"); wrap.innerHTML = avHTML("p_" + p.id, p.nick, PEOPLE[Math.abs(hash(p.id)) % PEOPLE.length], false);
    $("cam").appendChild(wrap.firstChild);
  }
  return $("p_" + p.id);
}
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
export function addPeer(p) { const q = { ...p, tx: p.x, ty: p.y, walk: false }; peers.set(p.id, q); const el = peerEl(q); el.style.display = hidden.has(p.id) ? "none" : ""; }
export function removePeer(id) { peers.delete(id); const el = $("p_" + id); if (el) el.remove(); }
export function movePeer(id, x, y) { const p = peers.get(id); if (p) { p.tx = x; p.ty = y; } }
export function renamePeer(id, nick) { const p = peers.get(id); if (p) { p.nick = nick; const el = $("p_" + id); if (el) el.querySelector(".nm").textContent = nick; } }
export function peerEmote(id, e) { if (!hidden.has(id) && EMOTES[e]) bubble("p_" + id, EMOTES[e][0]); }
export function peerSay(id, text) { if (!hidden.has(id)) bubble("p_" + id, '<span style="font-size:13px;font-weight:700">' + esc(text.length > 34 ? text.slice(0, 33) + "…" : text) + "</span>"); }
export function selfSay(text) { bubble("avo", '<span style="font-size:13px;font-weight:700">' + esc(text.length > 34 ? text.slice(0, 33) + "…" : text) + "</span>"); }
export function hidePeer(id) { hidden.add(id); const el = $("p_" + id); if (el) el.style.display = "none"; }
export function resetPeers(list) { for (const id of [...peers.keys()]) removePeer(id); list.forEach(addPeer); }
export const peerCount = () => peers.size;

/* ---------- Điều khiển ---------- */
export function goTo(id) {
  const p = standPoint(id);
  walkTo(p.x, p.y, () => { camT.yaw = -SPOTS[id].r; if (id === "board") ctx.onBoard(); else { camT.zoom = 250; camT.tilt = 52; zoomCb = () => ctx.onBooth(id); } });
}
export function zoomOut() { camT.zoom = 0; camT.tilt = 58; }
function walkTo(x, y, cb) { target = { x: Math.max(80, Math.min(FW - 80, x)), y: Math.max(80, Math.min(FW - 80, y)) }; onArrive = cb; }
function bubble(id, html) { const el = $(id); if (!el) return; const b = el.querySelector(".bub"); b.innerHTML = html; b.classList.add("on"); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("on"), 2400); }
let inputBound = false;
function bindInput() {
  if (inputBound) return; inputBound = true;
  const vp = $("viewport"); let d = null;
  vp.addEventListener("pointerdown", e => { if (e.target.closest("button") || e.target.closest(".chat")) return; d = { x: e.clientX, y: e.clientY, yaw: cam.yaw, drag: false }; });
  window.addEventListener("pointermove", e => { if (!d) return; const dx = e.clientX - d.x; if (!d.drag && Math.abs(dx) + Math.abs(e.clientY - d.y) > 10) d.drag = true; if (d.drag) { cam.yaw = d.yaw + dx * .35; camT.yaw = null; } });
  window.addEventListener("pointerup", e => {
    if (!d) return; const wasDrag = d.drag; d = null; if (wasDrag || !$("fair").classList.contains("on")) return;
    const t = e.target.closest ? e.target.closest("[data-id]") : null;
    if (t) return goTo(t.dataset.id);
    if (e.target.id === "floor") { const r = vp.getBoundingClientRect(); tapDot(e.clientX - r.left, e.clientY - r.top); walkTo(e.offsetX + CX - FLOOR_R, e.offsetY + CY - FLOOR_R, null); }
  });
  document.addEventListener("keydown", e => { if (e.target.tagName === "INPUT") return; keys[e.key.toLowerCase()] = true; });
  document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
}
function tapDot(x, y) { const el = document.createElement("div"); el.className = "tapdot"; el.style.left = x + "px"; el.style.top = y + "px"; $("viewport").appendChild(el); setTimeout(() => el.remove(), 650); }
function blockPush(p) { BLOCK.forEach(([bx, by, br]) => { const dx = p.x - bx, dy = p.y - by, dd = Math.hypot(dx, dy); if (dd < br && dd > 0) { p.x = bx + dx / dd * br; p.y = by + dy / dd * br; } }); p.x = Math.max(80, Math.min(FW - 80, p.x)); p.y = Math.max(80, Math.min(FW - 80, p.y)); }
/** Bước về phía đích; gặp vật cản thì trượt vòng theo mép thay vì đứng kẹt. */
function stepToward(p, tx, ty, sp, dt) {
  const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy); if (dd < 4) return true;
  const len = Math.min(dd, sp * dt), ux = dx / dd, uy = dy / dd;
  let nx = p.x + ux * len, ny = p.y + uy * len;
  for (const [bx, by, br] of BLOCK) {
    const ox = nx - bx, oy = ny - by, od = Math.hypot(ox, oy);
    if (od >= br + 2 || Math.hypot(tx - bx, ty - by) < br) continue;
    const pr = Math.hypot(p.x - bx, p.y - by) || 1, rx = (p.x - bx) / pr, ry = (p.y - by) / pr;
    let sx = -ry, sy = rx; const dot = sx * ux + sy * uy;
    if (dot < 0 || (Math.abs(dot) < 1e-3 && p.x < bx)) { sx = -sx; sy = -sy; }
    nx = p.x + sx * len; ny = p.y + sy * len;
  }
  p.x = nx; p.y = ny; blockPush(p);
  return Math.hypot(tx - p.x, ty - p.y) < 4;
}

/* ---------- Vòng lặp ---------- */
export function startHub() { cancelAnimationFrame(raf); last = null; zoomOut(); raf = requestAnimationFrame(loop); }
let stuck = 0;
function loop(ts) {
  if (!$("fair").classList.contains("on")) return;
  const dt = last == null ? 0 : Math.min(.05, (ts - last) / 1000); last = ts;
  const Y = cam.yaw * Math.PI / 180; let walking = false;
  const kx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), ky = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (kx || ky) {
    target = null; onArrive = null; const fx = -Math.sin(Y), fy = -Math.cos(Y), rx = Math.cos(Y), ry = -Math.sin(Y), n = Math.hypot(kx, ky);
    me.x += (rx * kx - fx * ky) / n * 500 * dt; me.y += (ry * kx - fy * ky) / n * 500 * dt; blockPush(me); walking = true;
  } else if (target) {
    const px = me.x, py = me.y, done = stepToward(me, target.x, target.y, 500, dt);
    stuck = Math.hypot(me.x - px, me.y - py) < .2 && dt > 0 ? stuck + 1 : 0;
    if (done || stuck > 20) { target = null; stuck = 0; const f = onArrive; onArrive = null; if (f) f(); } else walking = true;
  }
  if (walking && !moved) { moved = true; $("hint3").style.opacity = 0; }
  // gửi vị trí của mình
  if ((Math.abs(me.x - sentX) > 2 || Math.abs(me.y - sentY) > 2) && ts - sentAt > 120) { sentAt = ts; sentX = me.x; sentY = me.y; ctx.send({ t: "pos", x: Math.round(me.x), y: Math.round(me.y) }); }
  // người chơi khác: trượt mượt tới vị trí mới nhận
  for (const p of peers.values()) {
    const dx = p.tx - p.x, dy = p.ty - p.y, dd = Math.hypot(dx, dy), w = dd > 2;
    if (dd > 400) { p.x = p.tx; p.y = p.ty; } else if (w) { const k = Math.min(1, dt * 8); p.x += dx * k; p.y += dy * k; }
    const el = $("p_" + p.id); if (el) { el.style.transform = "translate3d(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px,0)"; if (p.walk !== w) { p.walk = w; el.querySelector(".avt").classList.toggle("walk", w); } }
  }
  // máy quay
  const k = Math.min(1, dt * 5), slow = cam.zoom < -150 ? 1.5 : 5;
  cam.x += (me.x - cam.x) * k; cam.y += (me.y - cam.y) * k;
  cam.zoom += (camT.zoom - cam.zoom) * Math.min(1, dt * slow); cam.tilt += (camT.tilt - cam.tilt) * Math.min(1, dt * slow);
  if (camT.yaw != null) { const dy = ((camT.yaw - cam.yaw) % 360 + 540) % 360 - 180; cam.yaw += dy * Math.min(1, dt * 5); if (Math.abs(dy) < .3) camT.yaw = null; }
  const c = $("cam"); c.style.setProperty("--yaw", cam.yaw.toFixed(2) + "deg");
  c.style.transform = "translateZ(" + cam.zoom.toFixed(1) + "px) rotateX(" + cam.tilt.toFixed(2) + "deg) rotateZ(" + cam.yaw.toFixed(2) + "deg) translate3d(" + (-cam.x).toFixed(1) + "px," + (-cam.y).toFixed(1) + "px,0)";
  const av = $("avo"); av.style.transform = "translate3d(" + me.x.toFixed(1) + "px," + me.y.toFixed(1) + "px,0)"; av.querySelector(".avt").classList.toggle("walk", walking);
  // làm mờ vật che giữa máy quay và nhân vật
  const bx = Math.sin(Y), by = Math.cos(Y);
  OCC.forEach(o => { const vx = o.x - me.x, vy = o.y - me.y, t = vx * bx + vy * by, perp = Math.abs(vx * by - vy * bx), el = $(o.id); if (el) el.style.opacity = t > 20 && t < 520 && perp < 150 && cam.zoom < 100 ? .28 : 1; });
  if (zoomCb && Math.abs(cam.zoom - camT.zoom) < 12) { const f = zoomCb; zoomCb = null; f(); }
  if (Math.random() < dt * .45) firework();
  raf = requestAnimationFrame(loop);
}
function firework() {
  const sky = $("sky"), x = 10 + Math.random() * 80, y = 6 + Math.random() * 22, cols = ["#ffc533", "#ff5a7a", "#7dd3fc", "#a3e635", "#f0abfc"], c = cols[Math.floor(Math.random() * cols.length)];
  for (let i = 0; i < 14; i++) { const f = document.createElement("span"), a = i / 14 * 6.283, r = 30 + Math.random() * 20; f.className = "fw"; f.style.left = x + "%"; f.style.top = y + "%"; f.style.background = c; f.style.boxShadow = "0 0 6px " + c;
    f.style.setProperty("--x", Math.cos(a) * r + "px"); f.style.setProperty("--y", Math.sin(a) * r + "px"); sky.appendChild(f); setTimeout(() => f.remove(), 1150); }
}
