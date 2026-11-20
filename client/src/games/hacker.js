// Gian 1: "Ai là Hacker?" – trò kiểu "Ai là gián điệp" về an toàn thông tin, 4–8 người thật một ván.
// Máy chủ (server/src/hacker.js) chia vai, giữ từ khóa, tính giờ và tính điểm; điện thoại chỉ biết từ của chính mình.
// Màn hình: chọn chế độ (Ghép ngẫu nhiên / Phòng bạn bè) nổi trên phòng chờ 3D, hàng chờ, phòng bạn bè,
// bàn chơi (người chơi xếp vòng tròn, câu mô tả hiện thành bong bóng), bỏ phiếu, đoán từ, kết quả và Góc kiến thức.
import { $, esc, beep } from "../ui.js";
import { share, vibrate } from "../platform.js";

export const pre = ["🕵️", "Ai là Hacker?", [
  ["👥", "Mỗi ván 4–8 người. Đa số là Công dân, nhận cùng một từ (ví dụ “Mã OTP”). Hacker nhận từ gần giống (ví dụ “Mật khẩu”). Đủ 8 người thì có 2 Hacker"],
  ["🤫", "Bạn chỉ biết từ của mình, không biết mình là Công dân hay Hacker. Chạm giữ thẻ để xem từ"],
  ["💬", "Lần lượt mỗi người gõ một câu mô tả từ của mình (30 giây), không được nói thẳng từ đó"],
  ["🗳️", "Hết vòng thì bỏ phiếu (20 giây) chọn người nghi là Hacker. Ai nhiều phiếu nhất bị loại"],
  ["🏆", "Công dân thắng khi loại hết Hacker. Hacker thắng khi chỉ còn 2 người, hoặc bị loại nhưng đoán trúng từ của Công dân"],
  ["⭐", "Thắng: Công dân +100, Hacker +200 (đoán trúng từ +100 nữa); mỗi vòng chọn trúng Hacker +50. Chỉ ván Ghép ngẫu nhiên được tính vào Bảng vàng"]
]];

const AV = ["🦊", "🐼", "🐯", "🐸", "🐵", "🐧", "🐨", "🐰"];
const AVC = ["#f97316", "#64748b", "#eab308", "#22c55e", "#a16207", "#0ea5e9", "#8b5cf6", "#ec4899"];
let g = null;

/* ---------- Vào gian ---------- */
export async function start(ctx) {
  stop(true);
  const root = $("hkRoot"); root.innerHTML = ""; root.className = "";
  g = { ctx, view: "choose", game: null, panel: null, timer: 0, lastMode: null };
  g.panel = ctx.space ? ctx.space.panel() : (() => { const p = document.createElement("div"); p.className = "sp-panel flat"; root.appendChild(p); root.className = "on"; return p; })(); // không có 3D: bảng chọn nằm thẳng trên màn hình gian
  if (ctx.space) ctx.space.show();
  renderChoose();
  ctx.send({ t: "hk:resume" }); // đang ở hàng chờ / phòng / ván dở (mất kết nối, tải lại trang) thì vào lại
  const code = takeCode(); if (code) joinCode(code);
}
/** Rời gian: báo máy chủ rời hàng chờ, phòng hoặc ván (rời ván giữa chừng không được điểm). */
export function stop(silent) {
  if (!g) return;
  clearInterval(g.timer); clearInterval(g.qTick);
  if (!silent) g.ctx.send({ t: "hk:leave" });
  if (g.panel) g.panel.remove();
  const root = $("hkRoot"); if (root) { root.innerHTML = ""; root.className = ""; }
  g = null;
}
/** Đang trong ván: rời gian cần hỏi lại. */
export const inGame = () => !!(g && g.game && !g.game.ended);
/** Mã phòng từ đường link mời (?hk=123456). */
function takeCode() { try { const u = new URL(location.href), c = u.searchParams.get("hk"); if (c) { u.searchParams.delete("hk"); history.replaceState(null, "", u.pathname + u.search + u.hash); } return c && /^\d{6}$/.test(c) ? c : null; } catch (e) { return null; } }
export function joinCode(code) { if (g) g.ctx.send({ t: "hk:join", code }); }

/* ---------- Bảng chọn chế độ, hàng chờ, phòng bạn bè (nổi trên phòng chờ 3D) ---------- */
function status(big, l1, l2, st) { if (g.ctx.space && g.ctx.space.status) g.ctx.space.status(big, l1, l2, st); }
function renderChoose() {
  g.view = "choose"; clearInterval(g.qTick);
  g.panel.innerHTML = '<div class="hkp"><div class="hkp-t">🕵️ Ai là Hacker?</div><div class="hkp-s">Tìm ra Hacker giữa những người dùng mạng · 4–8 người</div>' +
    '<button class="hkp-big" data-a="queue"><b>🎲 Ghép ngẫu nhiên</b><small>Ghép với người đang chờ · tính điểm Bảng vàng</small></button>' +
    '<button class="hkp-mid" data-a="create"><b>👥 Tạo phòng bạn bè</b><small>Mời bạn qua Zalo, chơi riêng với nhau</small></button>' +
    '<form class="hkp-code"><input inputmode="numeric" maxlength="6" placeholder="Nhập mã phòng 6 số" aria-label="Mã phòng 6 số"><button>Vào phòng</button></form>' +
    '<div class="hkp-n">Phòng bạn bè để giải trí, không tính điểm Bảng vàng</div></div>';
  g.panel.querySelector('[data-a="queue"]').onclick = () => { g.lastMode = "random"; g.ctx.send({ t: "hk:queue" }); };
  g.panel.querySelector('[data-a="create"]').onclick = () => { g.lastMode = "friend"; g.ctx.send({ t: "hk:create" }); };
  g.panel.querySelector(".hkp-code").onsubmit = e => { e.preventDefault(); const v = e.target.querySelector("input").value.trim(); if (!/^\d{6}$/.test(v)) return g.ctx.toast("Mã phòng gồm 6 chữ số"); joinCode(v); };
  status("AI LÀ HACKER?", "Chọn Ghép ngẫu nhiên hoặc Phòng bạn bè", "Mỗi ván 4–8 người · đủ 8 người có 2 Hacker", "🕵️ Chọn cách chơi");
}
function renderQueue(m) {
  g.view = "queue"; clearInterval(g.qTick);
  const since = Date.now() - (m.waited || 0), at = m.startIn != null ? Date.now() + m.startIn : null;
  const draw = () => {
    const s = at ? Math.max(0, Math.ceil((at - Date.now()) / 1000)) : null, long = !at && Date.now() - since > 90000;
    g.panel.innerHTML = '<div class="hkp"><div class="hkp-t">🎲 Ghép ngẫu nhiên</div>' +
      '<div class="hkp-q"><b>' + m.n + "</b>/" + m.max + "</div><div class=\"hkp-bar\"><i style=\"width:" + Math.round(100 * m.n / m.max) + '%"></i></div>' +
      '<div class="hkp-s">' + (at ? "Bắt đầu sau <b>" + s + "</b> giây (đủ " + m.max + " người thì bắt đầu ngay)" : "Đang chờ thêm người (" + m.n + "/" + m.max + ") · cần ít nhất " + m.min + " người") + "</div>" +
      (long ? '<div class="hkp-hint">Đang ít người chơi. Hãy tạo <b>Phòng bạn bè</b> và mời bạn vào cùng chơi nhé! <button class="hkp-link" data-a="friend">Tạo phòng bạn bè</button></div>' : "") +
      '<button class="hkp-ghost" data-a="leave">Rời hàng chờ</button></div>';
    g.panel.querySelector('[data-a="leave"]').onclick = () => { g.ctx.send({ t: "hk:leave" }); renderChoose(); };
    const f = g.panel.querySelector('[data-a="friend"]'); if (f) f.onclick = () => { g.ctx.send({ t: "hk:leave" }); g.ctx.send({ t: "hk:create" }); };
    status(m.n + " / " + m.max, at ? "Bắt đầu sau " + s + " giây!" : "Đang chờ thêm người (" + m.n + "/" + m.max + ")", "Ít nhất " + m.min + " người · đủ " + m.max + " người có 2 Hacker", at ? "⏱ Bắt đầu sau <b>" + s + "</b> giây" : "👥 Đang chờ <b>" + m.n + "</b>/" + m.max);
  };
  draw(); g.qTick = setInterval(draw, 1000);
}
function inviteText(code) { return "Vào chơi “Ai là Hacker?” với mình ở Hội chợ online! Mã phòng: " + code + " · " + location.origin + location.pathname + "?hk=" + code; }
function renderRoom(m) {
  g.view = "room"; clearInterval(g.qTick);
  g.panel.innerHTML = '<div class="hkp"><div class="hkp-t">👥 Phòng bạn bè</div><div class="hkp-code-big">' + m.code.slice(0, 3) + " " + m.code.slice(3) + '</div><div class="hkp-s">Gửi mã này cho bạn bè, hoặc bấm Mời bạn bè</div>' +
    '<div class="hkp-pl">' + m.players.map((p, i) => '<span style="--c:' + AVC[i % 8] + '">' + AV[i % 8] + " " + esc(p.nick) + (p.host ? " 👑" : "") + "</span>").join("") + "</div>" +
    '<div class="hkp-s">' + m.players.length + "/" + m.max + " người · cần ít nhất " + m.min + " người" + "</div>" +
    '<div class="hkp-row"><button class="hkp-mid" data-a="invite"><b>📨 Mời bạn bè</b></button>' + (m.host ? '<button class="hkp-mid go" data-a="start"' + (m.canStart ? "" : " disabled") + "><b>▶ Bắt đầu</b></button>" : '<div class="hkp-wait">Chờ chủ phòng bắt đầu…</div>') + "</div>" +
    (m.dev && m.host && m.players.length < m.max ? '<button class="hkp-ghost" data-a="bot">+ Thêm người ảo (chỉ khi chạy thử)</button>' : "") +
    '<div class="hkp-n">Phòng bạn bè để giải trí, không tính điểm Bảng vàng</div><button class="hkp-ghost" data-a="leave">Rời phòng</button></div>';
  const on = (a, f) => { const b = g.panel.querySelector('[data-a="' + a + '"]'); if (b) b.onclick = f; };
  on("invite", async () => { const r = await share("Ai là Hacker? · Hội chợ online", inviteText(m.code), "?hk=" + m.code); g.ctx.toast(r === "shared" ? "Đã mở chia sẻ" : r === "copied" ? "Đã sao chép lời mời và mã phòng" : "Mã phòng: " + m.code); });
  on("start", () => g.ctx.send({ t: "hk:start" }));
  on("bot", () => g.ctx.send({ t: "hk:bot" }));
  on("leave", () => { g.ctx.send({ t: "hk:leave" }); renderChoose(); });
  status("PHÒNG " + m.code, m.players.length + "/" + m.max + " người trong phòng", m.host ? "Bạn là chủ phòng · đủ " + m.min + " người thì bấm Bắt đầu" : "Chờ chủ phòng bắt đầu", "👥 Phòng <b>" + m.code + "</b> · " + m.players.length + " người");
}

/* ---------- Bàn chơi ---------- */
function deal(m) {
  clearInterval(g.qTick);
  const fresh = !g.game || g.game.id !== m.id;
  if (fresh) g.game = { id: m.id, you: m.you, word: m.word, mode: m.mode, nH: m.nH, maxRounds: m.maxRounds, players: m.players.map(p => ({ ...p })), descs: [], round: 0, phase: "deal", votes: new Set(), voted: false, pick: null, ended: false };
  const G = g.game;
  G.players = m.players.map(p => ({ ...(G.players.find(q => q.n === p.n) || {}), ...p }));
  G.descs = m.descs || G.descs; G.round = m.round || G.round;
  if (g.ctx.space) g.ctx.space.hide();
  g.panel.innerHTML = "";
  buildBoard();
  if (fresh && !m.round) { // mới chia từ: hiện thẻ lớn
    G.phase = "deal"; timer((m.until || 0) - (m.now || 0)); phaseText("Xem từ của bạn"); act('<div class="hk-wait">Ván sắp bắt đầu · chạm giữ thẻ để xem từ</div>');
    showDealCard(); beep("ok"); vibrate(60);
  }
}
window.__hkWord = () => g && g.game && g.game.word; // hỗ trợ kiểm thử tự động
function buildBoard() {
  const root = $("hkRoot"); root.className = "on";
  root.innerHTML = '<div class="hkb"><div class="hk-top"><span class="hk-ph"></span><span class="hk-tm"></span></div><div class="hk-tbar"><i></i></div>' +
    '<div class="hk-table"><div class="hk-mid"></div></div>' +
    '<div class="hk-word" role="button" aria-label="Chạm giữ để xem từ của bạn"><span class="hk-wl">🔒 Chạm giữ để xem từ của bạn</span><b></b></div>' +
    '<div class="hk-log"></div><div class="hk-act"></div><div class="hk-end"></div></div>';
  const w = root.querySelector(".hk-word"), wb = w.querySelector("b");
  const showW = e => { e.preventDefault(); wb.textContent = g.game.word; w.classList.add("open"); };
  const hideW = () => { wb.textContent = ""; w.classList.remove("open"); };
  w.addEventListener("pointerdown", showW); w.addEventListener("pointerup", hideW); w.addEventListener("pointerleave", hideW); w.addEventListener("pointercancel", hideW);
  w.addEventListener("contextmenu", e => e.preventDefault());
  drawSeats(); drawLog(); $("hkRound").textContent = g.game.round ? "Vòng " + g.game.round : "Chia từ";
}
function showDealCard() {
  const root = $("hkRoot"), d = document.createElement("div"); d.className = "hk-deal";
  d.innerHTML = '<div class="hk-dc"><div class="hk-dt">Từ khóa của bạn</div><div class="hk-dw" role="button"><span>👆 Chạm giữ để xem</span><b></b></div>' +
    '<div class="hk-dn">Đừng để người bên cạnh nhìn thấy! Bạn không biết mình là Công dân hay Hacker' + (g.game.nH > 1 ? " · ván này có 2 Hacker" : " · ván này có 1 Hacker") + '</div><button class="btn">Đã nhớ từ</button></div>';
  root.querySelector(".hkb").appendChild(d);
  const w = d.querySelector(".hk-dw"), b = w.querySelector("b");
  const on = e => { e.preventDefault(); b.textContent = g.game.word; w.classList.add("open"); }, off = () => { b.textContent = ""; w.classList.remove("open"); };
  w.addEventListener("pointerdown", on); w.addEventListener("pointerup", off); w.addEventListener("pointerleave", off); w.addEventListener("pointercancel", off);
  d.querySelector("button").onclick = () => d.remove();
  g.dealCard = d;
}
const P = n => g.game.players.find(p => p.n === n);
const nick = n => { const p = P(n); return p ? (n === g.game.you ? "Bạn" : p.nick) : "?"; };
function drawSeats() {
  const G = g.game, t = $("hkRoot").querySelector(".hk-table"); if (!t) return;
  t.querySelectorAll(".hk-seat").forEach(e => e.remove());
  const N = G.players.length, mi = Math.max(0, G.players.findIndex(p => p.n === G.you));
  G.players.forEach((p, i) => {
    const a = Math.PI / 2 + ((i - mi) * 2 * Math.PI) / N, x = 50 + Math.cos(a) * 40, y = 50 + Math.sin(a) * 36; // mình ngồi giữa phía dưới
    const last = [...G.descs].reverse().find(d => d.n === p.n && d.round === G.round);
    const s = document.createElement("button"); s.type = "button";
    s.className = "hk-seat" + (p.n === G.you ? " me" : "") + (p.out ? " out" : "") + (G.turn === p.n && G.phase === "describe" ? " talk" : "") + (G.votes.has(p.n) ? " voted" : "") + (G.pick === p.n ? " pick" : "") + (G.phase === "vote" && canPick(p.n) ? " can" : "");
    s.style.left = x + "%"; s.style.top = y + "%"; s.style.setProperty("--c", AVC[(p.n - 1) % 8]);
    s.innerHTML = '<span class="av">' + AV[(p.n - 1) % 8] + '</span><span class="nk">' + esc(p.n === G.you ? "Bạn" : p.nick) + "</span>" +
      (p.out ? '<span class="tag ' + (p.hacker ? "h" : p.left ? "l" : "c") + '">' + (p.left && p.hacker === undefined ? "Đã rời" : p.hacker ? "HACKER" : "Công dân") + "</span>" : "") +
      (last && last.text ? '<span class="hk-bub">' + esc(last.text) + "</span>" : last ? '<span class="hk-bub skip">…bỏ lượt</span>' : "") +
      (G.votes.has(p.n) ? '<span class="vk">✓</span>' : "");
    s.onclick = () => { if (G.phase === "vote" && canPick(p.n)) { G.pick = p.n; drawSeats(); drawVoteAct(); } };
    t.appendChild(s);
  });
}
const canPick = n => { const G = g.game, me = P(G.you); return me && !me.out && !G.voted && n !== G.you && G.cands.includes(n); };
function drawLog() {
  const G = g.game, el = $("hkRoot").querySelector(".hk-log"); if (!el) return;
  const rounds = [...new Set(G.descs.map(d => d.round))];
  el.innerHTML = rounds.length ? rounds.map(r => '<div class="hk-lr"><div class="hk-lh">Vòng ' + r + "</div>" + G.descs.filter(d => d.round === r).map(d =>
    '<div class="hk-ll' + (d.n === G.you ? " me" : "") + '"><span class="ic" style="--c:' + AVC[(d.n - 1) % 8] + '">' + AV[(d.n - 1) % 8] + "</span><b>" + esc(nick(d.n)) + ":</b> " +
    (d.text ? esc(d.text) + (d.n !== G.you ? ' <button class="rp" data-n="' + d.n + '" data-r="' + d.round + '" title="Báo cáo câu này" aria-label="Báo cáo">⚑</button>' : "") : "<i>bỏ lượt</i>") + "</div>").join("") + "</div>").join("")
    : '<div class="hk-le">Câu mô tả của mọi người sẽ hiện ở đây</div>';
  el.querySelectorAll(".rp").forEach(b => b.onclick = () => { if (confirm("Báo cáo câu mô tả này có nội dung không phù hợp?")) g.ctx.send({ t: "hk:report", n: +b.dataset.n, round: +b.dataset.r }); });
  el.scrollTop = el.scrollHeight;
}
function phaseText(t) { const e = $("hkRoot").querySelector(".hk-ph"); if (e) e.textContent = (g.game.round ? "Vòng " + g.game.round + "/" + g.game.maxRounds + " · " : "") + t; }
function mid(html) { const e = $("hkRoot").querySelector(".hk-mid"); if (e) e.innerHTML = html; }
function act(html) { const e = $("hkRoot").querySelector(".hk-act"); if (e) e.innerHTML = html; return e; }
function timer(ms) {
  clearInterval(g.timer); const end = performance.now() + Math.max(0, ms), total = Math.max(1, ms);
  const tm = $("hkRoot").querySelector(".hk-tm"), bar = $("hkRoot").querySelector(".hk-tbar i");
  const tick = () => { const l = Math.max(0, end - performance.now()); if (tm) tm.textContent = Math.ceil(l / 1000) + "s"; if (bar) { bar.style.transform = "scaleX(" + (l / total) + ")"; bar.parentNode.classList.toggle("warn", l < 6000); } if (!l) clearInterval(g.timer); };
  tick(); g.timer = setInterval(tick, 200);
}
const left = m => m.dur || 0;

function onTurn(m) {
  const G = g.game; G.round = m.round; G.phase = "describe"; G.turn = m.n; G.votes = new Set(); G.voted = false; G.pick = null;
  if (g.dealCard) { g.dealCard.remove(); g.dealCard = null; }
  $("hkRound").textContent = "Vòng " + G.round;
  phaseText("Mô tả"); timer(left(m)); drawSeats();
  if (m.n === G.you) {
    mid('<b class="hk-big">Tới lượt bạn!</b><small>Mô tả từ của mình, đừng nói thẳng từ đó</small>');
    const e = act('<form class="hk-in"><input maxlength="80" placeholder="Gõ một câu mô tả từ của bạn…" enterkeyhint="send" autocomplete="off"><button>Gửi</button></form><div class="hk-note"></div>');
    const f = e.querySelector("form"), i = f.querySelector("input"); setTimeout(() => i.focus(), 50);
    f.onsubmit = ev => { ev.preventDefault(); const v = i.value.trim(); if (v) g.ctx.send({ t: "hk:desc", text: v }); };
    beep("ok"); vibrate(80);
  } else {
    mid('<b class="hk-big">' + esc(nick(m.n)) + "</b><small>đang mô tả…</small>");
    act('<div class="hk-wait">Chờ <b>' + esc(nick(m.n)) + "</b> mô tả. Hãy đọc kỹ để tìm người nói khác mọi người!</div>");
  }
}
function onDesc(m) {
  const G = g.game; G.descs.push({ round: m.round, n: m.n, text: m.text }); G.turn = null;
  drawSeats(); drawLog();
  if (m.n === G.you) act('<div class="hk-wait">' + (m.text ? "Đã gửi câu mô tả của bạn" : "Hết giờ, bạn bị bỏ lượt") + "</div>");
}
function onVote(m) {
  const G = g.game; G.round = m.round; G.phase = "vote"; G.cands = m.cands; G.votes = new Set(); G.voted = !!m.mine; G.pick = m.mine || null; G.turn = null;
  phaseText(m.revote ? "Bỏ phiếu lại" : "Bỏ phiếu"); timer(left(m)); drawSeats();
  mid('<b class="hk-big">' + (m.revote ? "Hòa phiếu!" : "Ai là Hacker?") + "</b><small>" + (m.revote ? "Bỏ phiếu lại giữa những người hòa" : "Chạm vào người bạn nghi là Hacker") + "</small>");
  drawVoteAct(); beep("ok");
}
function drawVoteAct() {
  const G = g.game, me = P(G.you);
  if (!me || me.out) return act('<div class="hk-wait">Bạn đã bị loại, hãy xem mọi người bỏ phiếu</div>');
  if (G.voted) return act('<div class="hk-wait">Đã bỏ phiếu' + (G.pick ? " cho <b>" + esc(nick(G.pick)) + "</b>" : "") + ", chờ mọi người (" + G.votes.size + ")…</div>");
  const e = act(G.pick ? '<button class="btn hk-vote">🗳️ Bỏ phiếu cho ' + esc(nick(G.pick)) + "</button>" : '<div class="hk-wait">Chạm vào một người trên bàn để chọn</div>');
  const b = e.querySelector(".hk-vote"); if (b) b.onclick = () => { g.ctx.send({ t: "hk:vote", n: G.pick }); G.voted = true; drawSeats(); drawVoteAct(); };
}
function onVoted(m) { const G = g.game; G.votes.add(m.n); drawSeats(); if (G.voted) drawVoteAct(); }
function counts(c) { return Object.entries(c || {}).sort((a, b) => b[1] - a[1]).map(([n, v]) => esc(nick(+n)) + " " + v).join(" · "); }
function onOut(m) {
  const G = g.game, p = P(m.n); if (p) { p.out = true; p.hacker = m.hacker; }
  G.phase = "out"; drawSeats(); timer(0);
  mid('<b class="hk-big ' + (m.hacker ? "h" : "c") + '">' + esc(nick(m.n)) + " bị loại</b><small>" + (m.hacker ? "💻 Là HACKER!" : "🙂 Là Công dân, loại oan rồi") + "</small>");
  act('<div class="hk-wait">Số phiếu: ' + counts(m.counts) + "</div>");
  beep(m.hacker ? "ok" : "bad"); vibrate(m.n === G.you ? 200 : 40);
}
function onGuess(m) {
  const G = g.game; G.phase = "guess"; phaseText("Hacker đoán từ"); timer(left(m));
  if (m.n === G.you) {
    mid('<b class="hk-big h">Bạn là Hacker!</b><small>Đoán đúng từ của Công dân để lật kèo</small>');
    const e = act('<form class="hk-in"><input maxlength="40" placeholder="Từ của Công dân là…" autocomplete="off"><button>Đoán</button></form>');
    const f = e.querySelector("form"), i = f.querySelector("input"); setTimeout(() => i.focus(), 50);
    f.onsubmit = ev => { ev.preventDefault(); const v = i.value.trim(); if (v) { g.ctx.send({ t: "hk:guess", text: v }); act('<div class="hk-wait">Đã gửi câu đoán…</div>'); } };
  } else {
    mid('<b class="hk-big h">' + esc(nick(m.n)) + "</b><small>đang đoán từ của Công dân…</small>");
    act('<div class="hk-wait">Hacker bị loại được đoán từ một lần. Đoán trúng thì phe Hacker thắng!</div>');
  }
}
function onGuessed(m) {
  mid('<b class="hk-big ' + (m.ok ? "h" : "c") + '">' + (m.ok ? "Đoán trúng!" : "Đoán sai!") + "</b><small>" + esc(nick(m.n)) + (m.text ? " đoán “" + esc(m.text) + "”" : " không đoán kịp") + "</small>");
  act('<div class="hk-wait">' + (m.ok ? "Phe Hacker lật kèo!" : "Ván tiếp tục…") + "</div>");
}
function onTie(m) { mid('<b class="hk-big">Hòa phiếu</b><small>' + counts(m.counts) + "</small>"); act('<div class="hk-wait">Sắp bỏ phiếu lại giữa những người hòa…</div>'); }
function onNobody(m) { mid('<b class="hk-big">Không ai bị loại</b><small>' + (Object.keys(m.counts || {}).length ? "Vẫn hòa phiếu · " : "Không ai bỏ phiếu · ") + "sang vòng mới</small>"); act('<div class="hk-wait">Vòng mới sắp bắt đầu…</div>'); }
function onLeft(m) { const p = P(m.n); if (p) { p.out = true; p.left = true; if (m.hacker !== undefined) p.hacker = m.hacker; } drawSeats(); g.ctx.toast(nick(m.n) + " đã rời ván"); }

/* ---------- Kết quả, Góc kiến thức ---------- */
function onEnd(m) {
  const G = g.game; G.ended = true; clearInterval(g.timer);
  m.roles.forEach(r => { const p = P(r.n); if (p) Object.assign(p, { hacker: r.hacker, out: r.out, left: r.left }); });
  drawSeats(); act(""); mid("");
  const me = m.roles.find(r => r.n === m.you) || {}, s = m.score || {};
  const won = (m.result === "civ" && !me.hacker) || (m.result === "hacker" && me.hacker);
  const title = m.result === "civ" ? "🛡️ Công dân thắng!" : m.result === "hacker" ? "💻 Phe Hacker thắng!" : "🤝 Ván hòa";
  const why = m.result === "civ" ? "Đã tìm ra tất cả Hacker" : m.result === "hacker" ? (m.guesser ? esc(nick(m.guesser)) + " đoán trúng từ của Công dân" : "Chỉ còn 2 người, Hacker trụ lại tới cuối") : "Hết " + m.rounds + " vòng chưa phân thắng thua";
  const pts = me.points || 0;
  const scoreLine = m.mode !== "random" ? "Phòng bạn bè: chơi vui, không tính điểm Bảng vàng" : !s.counted ? (me.left ? "Bạn đã rời ván: không được điểm" : "Ngoài đợt treo thưởng: lượt luyện tập") :
    s.added < pts ? "+" + s.added.toLocaleString("vi-VN") + " vào Bảng vàng · đã đạt " + (s.caps ? s.caps.day.toLocaleString("vi-VN") : "1.000") + " điểm hôm nay" : "+" + s.added.toLocaleString("vi-VN") + " vào Bảng vàng";
  const end = $("hkRoot").querySelector(".hk-end");
  end.innerHTML = '<div class="hk-ec ' + (won ? "win" : "lose") + '"><div class="hk-et">' + title + '</div><div class="hk-ew">' + why + "</div>" +
    '<div class="hk-words"><div><small>Từ của Công dân</small><b>' + esc(m.civ) + '</b></div><div class="h"><small>Từ của Hacker</small><b>' + esc(m.hacker) + "</b></div></div>" +
    '<div class="hk-me"><span>' + (me.hacker ? "Bạn là 💻 Hacker" : "Bạn là 🙂 Công dân") + '</span><b>' + (pts ? "+" + pts : "0") + " điểm</b></div><div class=\"hk-sl\">" + scoreLine + "</div>" +
    '<ul class="hk-roles">' + m.roles.slice().sort((a, b) => b.points - a.points).map(r => '<li class="' + (r.n === m.you ? "me" : "") + '"><span class="ic" style="--c:' + AVC[(r.n - 1) % 8] + '">' + AV[(r.n - 1) % 8] + "</span>" + esc(r.n === m.you ? "Bạn" : r.nick) +
      ' <i class="' + (r.hacker ? "h" : "c") + '">' + (r.hacker ? "Hacker" : "Công dân") + "</i>" + (r.left ? ' <i class="l">rời ván</i>' : "") + (r.hits ? ' <i class="v">🎯×' + r.hits + "</i>" : "") + "<b>" + (r.points ? "+" + r.points : "0") + "</b></li>").join("") + "</ul>" +
    '<div class="hk-kn"><div class="hk-kt">💡 Góc kiến thức: ' + esc(m.civ) + " hay " + esc(m.hacker) + "?</div>" + esc(m.knowledge || "") + "</div>" +
    '<div class="hk-ea"><button class="btn" data-a="again">' + (m.mode === "random" ? "🎲 Ván mới" : "👥 Về phòng chờ") + '</button><button class="btn ghost" data-a="lobby">Về phòng chờ 3D</button></div>' +
    '<div class="hk-ea"><button class="btn ghost" data-a="lb">🏆 Bảng vàng</button><button class="btn ghost" data-a="out">Về hội chợ</button></div></div>';
  end.classList.add("on");
  if (s && s.bests && g.ctx.updateMe) g.ctx.updateMe(s);
  beep(won ? "ok" : "bad");
  const on = (a, f) => { end.querySelector('[data-a="' + a + '"]').onclick = f; };
  on("again", () => { backToLobby(); if (m.mode === "random") g.ctx.send({ t: "hk:queue" }); else renderChoose(); });
  on("lobby", () => backToLobby());
  on("lb", () => g.ctx.board && g.ctx.board("g1"));
  on("out", () => g.ctx.leave());
}
function backToLobby() {
  g.game = null; clearInterval(g.timer);
  const root = $("hkRoot"); root.innerHTML = ""; root.className = "";
  if (g.ctx.space) { g.ctx.space.show(); g.panel = g.ctx.space.panel(); } else { root.appendChild(g.panel); root.className = "on"; }
  renderChoose();
}

/** Tin từ máy chủ (main.js chuyển các tin "hk:*" sang đây). */
export function onMsg(m) {
  if (!g) return;
  switch (m.t) {
    case "hk:idle": if (g.view !== "choose" && !g.game) renderChoose(); return;
    case "hk:queue": if (!g.game || g.game.ended) { if (g.game) backToLobby(); renderQueue(m); } return;
    case "hk:room": if (!g.game || g.game.ended) { if (g.game) backToLobby(); renderRoom(m); } return;
    case "hk:err": g.ctx.toast(m.text); return;
    case "hk:deal": return deal(m);
  }
  if (!g.game) return;
  switch (m.t) {
    case "hk:turn": return onTurn(m);
    case "hk:desc": return onDesc(m);
    case "hk:descno": { const n = $("hkRoot").querySelector(".hk-note"); if (n) { n.textContent = m.text; n.classList.add("on"); } beep("bad"); return; }
    case "hk:vote": return onVote(m);
    case "hk:voted": return onVoted(m);
    case "hk:tie": return onTie(m);
    case "hk:nobody": return onNobody(m);
    case "hk:out": return onOut(m);
    case "hk:guess": return onGuess(m);
    case "hk:guessed": return onGuessed(m);
    case "hk:left": return onLeft(m);
    case "hk:end": return onEnd(m);
  }
}
