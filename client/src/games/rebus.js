// Gian 2: Đuổi hình bắt chữ – đấu phòng 20–50 người.
// Cả phòng cùng đoán một câu; máy chủ giữ đáp án, kiểm tra từng lần đoán, ai đúng trước được thưởng thêm.
import { $, beep, esc, msg } from "../ui.js";
import { lobbyEl, renderLobby, hideLobby, roomBoard, top3 } from "./lobby.js";

export const pre = ["🖼️", "Đuổi hình bắt chữ · Đấu phòng", [["👥", "Cần ít nhất 20 người, tối đa 50 người cùng chơi một phòng"], ["👀", "5 câu, mỗi câu 30 giây: nhìn hình, chạm chữ cái để ghép tên địa danh"], ["🥇", "Đoán đúng càng nhanh càng nhiều điểm; nhất, nhì, ba được thưởng thêm"], ["💡", "Gợi ý mở 1 chữ, trừ 100 điểm"]]];
let g = null;

export async function start(ctx) {
  stop();
  g = { ctx, running: true, k: -1, score: 0, raf: 0, locked: true, lobby: lobbyEl("g2") };
  $("g2sc").textContent = "0"; $("g2n").textContent = "Đang chờ phòng"; $("g2sec").textContent = "–";
  $("g2pic").innerHTML = ""; $("g2slots").innerHTML = ""; $("g2tiles").innerHTML = ""; $("g2rev").className = "reveal";
  $("g2skip").textContent = "Bỏ câu này";
  ctx.send({ t: "mjoin", g: "g2" });
}
export function stop() {
  if (!g) return;
  if (g.running) g.ctx.send({ t: "mleave" });
  g.running = false; cancelAnimationFrame(g.raf); hideLobby(g.lobby);
}
export function hint() { if (g && g.running && !g.locked) { g.ctx.send({ t: "mhint", k: g.k }); } }
/** Bỏ câu này: không đoán nữa, chờ đáp án cùng cả phòng. */
export function skip() { if (g && g.running && !g.locked) { g.locked = true; render(); waitNote("Bạn đã bỏ câu này. Chờ cả phòng…"); } }

export function onMsg(m) {
  if (!g || !g.running) return;
  if (m.t === "mlobby") renderLobby(g.lobby, m, "Đuổi hình bắt chữ", "#0f8a5f", () => g.ctx.leave());
  else if (m.t === "merr") { g.ctx.toast(m.text); g.ctx.leave(); }
  else if (m.t === "mstart") { hideLobby(g.lobby); g.ctx.toast("Phòng đã đủ " + m.n + " người! Chuẩn bị " + m.total + " câu"); beep("ok"); }
  else if (m.t === "mround") round(m);
  else if (m.t === "mguess" && m.k === g.k) guessed(m);
  else if (m.t === "mhint" && m.k === g.k) hinted(m);
  else if (m.t === "msolved" && m.k === g.k) solvedBy(m);
  else if (m.t === "mreveal") reveal(m);
  else if (m.t === "mend") end(m);
}

function round(m) {
  Object.assign(g, { k: m.k, p: m, tiles: m.tiles.map(ch => ({ ch, used: false })), slots: Array(m.words.reduce((a, b) => a + b, 0)).fill(null), lock: [], locked: false, endAt: performance.now() + m.dur, dur: m.dur, solved: 0 });
  $("g2pic").innerHTML = m.pics.map(e => "<span>" + e + "</span>").join('<span class="plus">+</span>'); $("g2pic").classList.remove("flip"); void $("g2pic").offsetWidth; $("g2pic").classList.add("flip");
  $("g2n").textContent = "Câu " + (m.k + 1) + "/" + m.total; $("g2rev").className = "reveal";
  render(); cancelAnimationFrame(g.raf); tick();
}
function tick() {
  if (!g || !g.running) return;
  const l = Math.max(0, (g.endAt - performance.now()) / g.dur);
  $("g2t").style.transform = "scaleX(" + l + ")"; $("g2tb").classList.toggle("warn", l < .25); $("g2sec").textContent = Math.ceil(l * g.dur / 1000) + "s";
  if (l > 0) g.raf = requestAnimationFrame(tick);
}
function render() {
  let k = 0, h = "";
  g.p.words.forEach(len => { h += '<div class="word">'; for (let j = 0; j < len; j++, k++) { const t = g.slots[k]; h += '<button class="slot' + (t != null ? " f" : "") + (g.lock.includes(k) ? " lock" : "") + '" data-s="' + k + '">' + (t != null ? g.tiles[t].ch : "") + "</button>"; } h += "</div>"; });
  const sl = $("g2slots"); sl.className = "slots" + (g.won ? " good" : ""); sl.innerHTML = h;
  sl.querySelectorAll(".slot").forEach(el => el.onclick = () => { const s = +el.dataset.s; if (g.locked || g.lock.includes(s) || g.slots[s] == null) return; g.tiles[g.slots[s]].used = false; g.slots[s] = null; render(); });
  $("g2tiles").innerHTML = g.tiles.map((t, i) => '<button class="tile' + (t.used ? " u" : "") + '" data-t="' + i + '">' + t.ch + "</button>").join("");
  $("g2tiles").querySelectorAll(".tile").forEach(el => el.onclick = () => put(+el.dataset.t));
  $("g2hint").disabled = g.locked; $("g2skip").disabled = g.locked;
}
function put(ti) {
  if (g.locked || g.tiles[ti].used) return; const s = g.slots.indexOf(null); if (s < 0) return;
  g.slots[s] = ti; g.tiles[ti].used = true; render();
  if (!g.slots.includes(null)) { g.locked = true; g.ctx.send({ t: "mguess", k: g.k, text: g.slots.map(t => g.tiles[t].ch).join("") }); }
}
function clearLoose() { g.slots.forEach((t, s) => { if (!g.lock.includes(s) && t != null) { g.tiles[t].used = false; g.slots[s] = null; } }); }
function guessed(m) {
  if (m.ok) {
    g.won = true; g.score = m.score; $("g2sc").textContent = g.score.toLocaleString("vi-VN"); beep("ok"); render(); g.won = false;
    waitNote("✓ Chính xác! +" + m.gain + " điểm" + (m.place <= 3 ? " · " + ["🥇 Nhất", "🥈 Nhì", "🥉 Ba"][m.place - 1] : " · thứ " + m.place) + "<br><small>Chờ cả phòng…</small>");
    return;
  }
  const sl = $("g2slots"); sl.classList.add("bad"); beep("bad");
  setTimeout(() => { if (!g || g.k !== m.k) return; clearLoose(); g.locked = false; render(); }, 450);
}
function hinted(m) {
  clearLoose(); const ti = g.tiles.findIndex(t => !t.used && t.ch === m.letter);
  if (ti >= 0) { g.slots[m.pos] = ti; g.tiles[ti].used = true; g.lock.push(m.pos); }
  render(); g.ctx.toast("Đã mở 1 chữ (−100 điểm)");
  if (!g.slots.includes(null)) { g.locked = true; g.ctx.send({ t: "mguess", k: g.k, text: g.slots.map(t => g.tiles[t].ch).join("") }); }
}
function solvedBy(m) { if (m.place <= 3) msg($("g2msg") || $("g2rev"), "ok", "<b>" + ["🥇", "🥈", "🥉"][m.place - 1] + " " + esc(m.nick) + "</b> đã đoán đúng!", 1600); }
function waitNote(html) { const rv = $("g2rev"); rv.innerHTML = '<div class="rv ok">' + html + "</div>"; rv.className = "reveal on wait"; }
function reveal(m) {
  g.locked = true; cancelAnimationFrame(g.raf); $("g2t").style.transform = "scaleX(0)"; $("g2sec").textContent = "0s";
  g.score = m.you.score; $("g2sc").textContent = g.score.toLocaleString("vi-VN");
  if (!m.you.ok) beep("bad");
  const rv = $("g2rev");
  rv.innerHTML = '<div class="rv ' + (m.you.ok ? "ok" : "no") + '">' + (m.you.ok ? "✓ Bạn đoán đúng! +" + m.you.gain + " điểm" : "Đáp án là:") + " · hạng " + m.rank + "/" + m.n + '</div><div class="pics">' + m.pics.join(" ") + '</div><div class="nm">' + esc(m.name) + "</div><p>" + esc(m.info) + "</p>" +
    "<small>" + m.solved + "/" + m.n + " người đoán đúng</small>" + top3(m.top) + "<small>" + (m.last ? "Đang tổng kết…" : "Câu tiếp theo sắp hiện…") + "</small>";
  rv.className = "reveal on";
}
function end(m) {
  g.running = false; cancelAnimationFrame(g.raf);
  const r = m.result;
  g.ctx.result("g2", r, [["#" + m.rank + "/" + m.n, "Hạng trong phòng"], [r.stats.ok + "/" + r.stats.total, "Đoán đúng"], [r.stats.hints, "Gợi ý đã dùng"]],
    roomBoard(m) + '<div class="lbl">Địa danh trong ván này</div><ul class="rev">' + r.review.map(p => "<li><b>" + p.pics.join(" ") + " → " + esc(p.name) + "</b>" + esc(p.info) + "</li>").join("") + "</ul>");
}
