// Điểm khởi động: tải, đăng nhập, màn hình chào, sảnh hội chợ, gian hàng, Bảng vàng.
import { $, show, toast, openSheet, closeSheet, initSheet, fmt, esc } from "./ui.js";
import { api, post, setToken, connectKhu } from "./api.js";
import { initPlatform, loginPayload, share, inZalo } from "./platform.js";
import { BOOTHS, BOOTH, PLACE_NAME } from "./config.js";
import * as hub from "./hub.js";
import * as chat from "./chat.js";
import * as swipe from "./games/swipe.js";
import * as rebus from "./games/rebus.js";
import * as runner from "./games/runner.js";

const GAMES = { g1: swipe, g2: rebus, g3: runner };
const PROVERBS = [["Ăn quả nhớ kẻ trồng cây.", "Tục ngữ"], ["Một cây làm chẳng nên non, ba cây chụm lại nên hòn núi cao.", "Ca dao"], ["Bán anh em xa, mua láng giềng gần.", "Tục ngữ"], ["Đi một ngày đàng, học một sàng khôn.", "Tục ngữ"]];
const S = { me: null, event: null, khu: 1, myId: null, conn: null, cur: null };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } } };

/* ---------- Tải và đăng nhập ---------- */
async function boot() {
  initSheet();
  const q = PROVERBS[Math.floor(Math.random() * PROVERBS.length)]; $("lq").innerHTML = "“" + q[0] + "”<small>" + q[1] + "</small>";
  const stepTo = (pct, text) => { $("lbar").style.width = pct + "%"; $("lst").textContent = text; };
  try {
    stepTo(15, "Đang kết nối Zalo…"); await initPlatform();
    stepTo(40, "Đang đăng nhập…");
    const auth = await post("/api/auth", await loginPayload()); setToken(auth.token);
    stepTo(70, "Đang treo đèn lồng…");
    const [me, khu] = await Promise.all([api("/api/me"), api("/api/khu")]);
    S.me = me; S.event = me.event;
    stepTo(85, "Đang dựng gian hàng 3D…"); await hub.prepareHub();
    stepTo(100, "Sắp xong rồi…");
    setTimeout(() => landing(khu.khu), 300);
  } catch (e) {
    $("lst").textContent = "Chưa vào được hội chợ";
    const box = $("lerr"); box.hidden = false; box.innerHTML = esc(e.message) + '<br><button id="retry">Thử lại</button>';
    $("retry").onclick = () => location.reload();
  }
}

function landing(khuList) {
  show("land");
  $("landTag").textContent = "Dạo hội, chơi game, rinh quà · " + PLACE_NAME;
  $("nick").textContent = S.me.nick;
  const saved = store.get("hc_khu");
  $("khu").innerHTML = khuList.map(k => '<option value="' + k.khu + '"' + (k.online >= k.capacity ? " disabled" : "") + ">Khu " + k.khu + " · " + k.online + " người đang dạo" + (k.online >= k.capacity ? " (đầy)" : "") + "</option>").join("");
  const pick = khuList.find(k => k.khu === saved && k.online < k.capacity) || khuList.find(k => k.online < k.capacity) || khuList[0];
  $("khu").value = pick.khu;
  $("evInfo").textContent = S.event.active ? "🎊 " + S.event.name + " đang diễn ra đến " + new Date(S.event.end).toLocaleDateString("vi-VN") : "Hiện chưa có đợt treo thưởng. Bạn vẫn chơi để luyện tập được.";
  $("reroll").onclick = async () => { try { const r = await post("/api/me/nickname"); S.me.nick = r.nick; $("nick").textContent = r.nick; } catch (e) { toast(e.message); } };
  $("enterFair").onclick = () => { S.khu = Number($("khu").value); store.set("hc_khu", S.khu); enterFair(); };
}

/* ---------- Sảnh hội chợ ---------- */
function enterFair() {
  show("fair");
  const send = o => S.conn && S.conn.send(o);
  hub.buildHub({
    nick: S.me.nick, hidden: [...chat.hiddenIds()], send, toast,
    onBooth: id => boothSheet(id), onBoard: () => board("all"),
    onEmote: i => chat.onEmoteSelf(hub.EMOTES[i][0] + " " + hub.EMOTES[i][1])
  });
  chat.initChat({ khu: S.khu, send, nick: () => S.me.nick, get myId() { return S.myId; }, onPeerSay: hub.peerSay, onSelfSay: hub.selfSay, onHide: hub.hidePeer });
  if (!$("conn")) { const c = document.createElement("div"); c.id = "conn"; c.className = "conn"; $("viewport").appendChild(c); }
  S.conn = connectKhu(S.khu, onRealtime, ok => { const c = $("conn"); c.textContent = ok ? "● Trực tuyến" : "● Mất kết nối, đang nối lại…"; c.classList.toggle("off", !ok); });
  renderHud(); hub.startHub();
  const note = hub.fallbackNotice();
  if (note && !$("gfxNote")) {
    const n = document.createElement("div"); n.id = "gfxNote"; n.className = "gfxnote";
    n.innerHTML = "<span>" + esc(note) + '</span><button aria-label="Đóng">✕</button>';
    n.querySelector("button").onclick = () => n.remove();
    $("viewport").appendChild(n);
  }
}
function onRealtime(m) {
  if (m.t === "welcome") { S.myId = m.you.id; hub.resetPeers(m.peers); chat.setHistory(m.history); renderWho(); }
  else if (m.t === "join") { hub.addPeer(m.peer); renderWho(); }
  else if (m.t === "leave") { hub.removePeer(m.id); renderWho(); }
  else if (m.t === "pos") hub.movePeer(m.id, m.x, m.y);
  else if (m.t === "emote") hub.peerEmote(m.id, m.e);
  else if (m.t === "sit") { if (m.id !== S.myId) hub.peerSit(m.id, m.s); }
  else if (m.t === "sitno") { hub.sitRejected(m.s); toast(m.text); }
  else if (m.t === "rename") hub.renamePeer(m.id, m.nick);
  else if (m.t === "chat") chat.onChat(m.m);
  else if (m.t === "hide") chat.onHide(m.id);
  else if (m.t === "sys") chat.onSys(m.text, m.ok);
  else if (m.t === "feed") feed(m.text);
  else if (m.t === "full" || m.t === "error") toast(m.text);
}
function renderWho() { $("who").innerHTML = "🧑 <b>" + esc(S.me.nick) + "</b> · Khu " + S.khu + " · " + (hub.peerCount() + 1) + " người đang dạo"; }
function feed(text) { const row = document.createElement("div"); row.textContent = text; const f = $("feed"); f.appendChild(row); while (f.children.length > 2) f.firstChild.remove(); setTimeout(() => row.remove(), 6000); }
function eventLeft() { const ms = Math.max(0, Date.parse(S.event.end) - Date.now()), d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5); return d + " ngày " + h + " giờ"; }
function renderHud() {
  $("tot").textContent = fmt(S.me.total);
  $("evBar").innerHTML = S.event.active ? "🎊 <b>" + esc(S.event.name) + "</b> · còn " + eventLeft() : "Chưa có đợt treo thưởng · đang luyện tập";
  BOOTHS.forEach(b => { const v = S.me.bests[b.id]; const el = $("bb_" + b.id); if (el) el.textContent = v ? "Kỷ lục: " + fmt(v) : "Chưa chơi"; });
  const bd = $("bdTop"); if (bd) bd.textContent = S.me.rank ? "Bạn đang hạng #" + S.me.rank : "Chơi để lên bảng";
  renderWho();
}
function boothSheet(id) {
  const b = BOOTH(id), v = S.me.bests[id];
  openSheet('<button class="xx" aria-label="Đóng">✕</button><div class="bsh"><div class="ic">' + b.icons + "</div><h2>" + b.tag + " · " + b.name + '</h2><span class="tpill" style="background:' + b.c + '">' + b.topic + "</span><p>" + b.desc + '</p><div class="kv"><div><b>' + (v ? fmt(v) : "–") + '</b>Kỷ lục của bạn</div><div><b>' + fmt(S.me.total) + '</b>Tổng điểm hội chợ</div></div><button class="btn" id="enter" style="background:' + b.c + '">Vào gian hàng</button></div>', { onClose: () => hub.zoomOut() });
  $("enter").onclick = () => { closeSheet(); openGame(id); };
}

/* ---------- Gian hàng ---------- */
function openGame(id) {
  S.cur = id; show(id);
  const p = GAMES[id].pre, pre = $(id + "pre");
  pre.innerHTML = '<div class="box"><div class="big">' + p[0] + "</div><h2>" + p[1] + "</h2><ul>" + p[2].map(x => "<li><i>" + x[0] + "</i>" + x[1] + "</li>").join("") + '</ul><button class="btn" style="background:' + BOOTH(id).c + '">Bắt đầu</button></div>';
  pre.classList.add("on");
  pre.querySelector("button").onclick = () => { pre.classList.remove("on"); play(id); };
}
const gameCtx = { toast, result, leave: leaveGame };
function play(id) { GAMES[id].start(gameCtx).catch(e => { toast(e.message); leaveGame(); }); }
function leaveGame() { if (S.cur) GAMES[S.cur].stop(); S.cur = null; closeSheet(); show("fair"); renderHud(); hub.startHub(); }
function result(id, r, stats, review) {
  const b = BOOTH(id);
  S.me.bests = r.bests; S.me.total = r.total; S.me.rank = r.rank;
  const head = !r.counted ? '<span class="old">Lượt luyện tập, không tính vào Bảng vàng</span>' : r.newBest && r.score > 0 ? '<span class="new">Kỷ lục mới của bạn!</span>' : '<span class="old">Kỷ lục của bạn: ' + fmt(r.best) + "</span>";
  openSheet('<div class="rhead" style="--c:' + b.c + '"><small>' + b.tag + " · " + b.name + '</small><div class="pts">' + fmt(r.score) + "</div>" + head +
    '<div class="stats">' + stats.map(s => "<div><b>" + s[0] + "</b>" + s[1] + "</div>").join("") + "</div></div>" +
    '<div class="totbox">Tổng điểm hội chợ <b>' + fmt(r.total) + "</b>" + (r.rank ? " · Bảng vàng hạng <b>#" + r.rank + "</b>" : "") + "<br><small>Bảng vàng tính điểm cao nhất của mỗi gian</small></div>" + (review || "") +
    '<div class="acts"><button class="btn" id="rAgain" style="background:' + b.c + '">Chơi lại</button><button class="btn ghost" id="rBack">Về hội chợ</button></div>' +
    '<div class="acts" style="margin-top:10px"><button class="btn ghost" id="rShare">Thách bạn bè</button><button class="btn ghost" id="rLb">Bảng vàng</button></div>', { dismiss: false });
  $("rAgain").onclick = () => { closeSheet(); play(id); };
  $("rBack").onclick = leaveGame;
  $("rLb").onclick = () => board("all", true);
  $("rShare").onclick = async () => {
    const res = await share("Hội chợ online", "Mình vừa đạt " + fmt(r.score) + " điểm ở " + b.tag + " “" + b.name + "” trong Hội chợ online. Bạn dám thách đấu không?");
    toast(res === "shared" ? "Đã mở chia sẻ" : res === "copied" ? "Đã sao chép lời thách đấu" : "Không chia sẻ được");
  };
}

/* ---------- Bảng vàng ---------- */
async function board(tab, fromResult) {
  let d;
  try { d = await api("/api/leaderboard?tab=" + tab); } catch (e) { return toast(e.message); }
  const e = d.event, li = r => '<li class="' + (r.me ? "me" : "") + '"><span class="rk">' + r.rank + '</span><span class="nm">' + esc(r.nick) + (r.me ? " (bạn)" : "") + '</span><span class="pt">' + fmt(r.score) + "</span></li>";
  let list = d.rows.slice(0, 10).map(li).join("");
  if (d.me && d.me.rank > 10) list += '<li class="gap">⋯</li>' + li({ rank: d.me.rank, nick: S.me.nick, score: d.me.score, me: true });
  if (!d.rows.length) list = '<li class="gap">Chưa có ai trên bảng. Hãy là người đầu tiên!</li>';
  const tabs = [["all", "Tổng 3 gian"], ["g1", "Gian 1"], ["g2", "Gian 2"], ["g3", "Gian 3"]];
  openSheet('<button class="xx" aria-label="Đóng">✕</button><h2>🏆 Bảng vàng</h2><p class="sub">' + d.players + " người đã ghi điểm trong đợt này</p>" +
    '<div class="evc"><div class="t">' + esc(e.name) + (e.active ? "" : "<small>chưa diễn ra hoặc đã kết thúc</small>") + '</div><div class="cd">' + (e.active ? "Kết thúc sau <b>" + eventLeft() + "</b>" : "Từ " + new Date(e.start).toLocaleDateString("vi-VN") + " đến " + new Date(e.end).toLocaleDateString("vi-VN")) +
    '</div><div class="prz">' + e.prizes.map(p => "<div><b>" + esc(p[0]) + "</b>" + esc(p[1]) + "</div>").join("") + "</div></div>" +
    '<div class="tabs">' + tabs.map(t => '<button data-t="' + t[0] + '" class="' + (t[0] === tab ? "on" : "") + '">' + t[1] + "</button>").join("") + '</div><ol class="lb">' + list + "</ol>" +
    '<p class="note">' + esc(e.rules || "") + "</p>" +
    (fromResult ? '<div class="acts" style="margin-top:12px"><button class="btn" id="bAgain">Chơi lại</button><button class="btn ghost" id="bBack">Về hội chợ</button></div>' : ""), { dismiss: !fromResult, onClose: fromResult ? null : () => hub.zoomOut() });
  $("sheet").querySelectorAll(".tabs button").forEach(b => b.onclick = () => board(b.dataset.t, fromResult));
  if (fromResult) { $("bAgain").onclick = () => { closeSheet(); play(S.cur); }; $("bBack").onclick = leaveGame; }
}

/* ---------- Gắn nút trong gian hàng ---------- */
document.querySelectorAll("[data-back]").forEach(b => b.onclick = leaveGame);
$("lbBtn").onclick = () => board("all");
$("g1no").onclick = () => swipe.decide(true); $("g1yes").onclick = () => swipe.decide(false);
$("g2hint").onclick = () => rebus.hint(); $("g2skip").onclick = () => rebus.skip();
const road = $("road"); let rx = null;
road.onpointerdown = e => { rx = e.clientX; };
road.onpointerup = e => { if (rx == null) return; const dx = e.clientX - rx; rx = null;
  if (Math.abs(dx) > 30) runner.move(dx > 0 ? 1 : -1); else { const p = $("g3p"), r = p ? p.querySelector(".e").getBoundingClientRect() : road.getBoundingClientRect(); runner.move(e.clientX < r.left + r.width / 2 ? -1 : 1); } };
document.addEventListener("keydown", e => {
  if (e.target.tagName === "INPUT") return;
  if (S.cur === "g1") { if (e.key === "ArrowLeft") swipe.decide(true); if (e.key === "ArrowRight") swipe.decide(false); }
  if (S.cur === "g3") { if (e.key === "ArrowLeft" || e.key === "a") runner.move(-1); if (e.key === "ArrowRight" || e.key === "d") runner.move(1); }
});
window.__hoicho = { S, inZalo }; // hỗ trợ kiểm thử
boot();
