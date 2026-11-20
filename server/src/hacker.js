// Gian 1 "Ai là Hacker?": trò kiểu "Ai là gián điệp" về an toàn thông tin, 4–8 người thật một ván.
// Công dân nhận cùng một từ, Hacker (1 người; đủ 8 người thì 2) nhận từ gần giống. Lần lượt mô tả, rồi bỏ phiếu loại người nghi là Hacker.
// Máy chủ giữ vai và từ, chỉ gửi cho mỗi người từ của chính họ; vai của người khác chỉ lộ khi họ bị loại hoặc khi ván kết thúc.
//
// Tin qua kết nối WebSocket của khu (realtime.js chuyển các tin "hk:*" sang đây):
//   Điện thoại gửi: hk:queue (ghép ngẫu nhiên) · hk:create (tạo phòng bạn bè) · hk:join {code} · hk:start (chủ phòng) · hk:leave
//                   hk:desc {text} · hk:vote {n} · hk:guess {text} · hk:report {n, text} · hk:resume · hk:bot (chỉ khi DEV_LOGIN=1)
//   Máy chủ gửi:    hk:queue {n, min, max, startIn} · hk:room {code, host, players, canStart} · hk:deal (từ của mình, danh sách người chơi)
//                   hk:turn · hk:desc · hk:descno · hk:vote · hk:voted · hk:out · hk:nobody · hk:guess · hk:guessed · hk:left · hk:end · hk:err
import { randomInt, randomUUID } from "node:crypto";
import { blockReason, cleanText, normalize } from "../../shared/chatFilter.js";

export const HK = { MIN: 4, MAX: 8, MAX_ROUNDS: 10, DESC_MAX: 80 };
const MS = { deal: 8000, desc: 30000, vote: 20000, revote: 15000, guess: 20000, gap: 3500, queue: 30000, grace: 30000, descGap: 700 };
const BOT_LINES = ["Cái này hay gặp trên điện thoại", "Liên quan tới tài khoản của mình", "Phải cẩn thận khi dùng", "Người lạ hay hỏi cái này", "Ngân hàng có nhắc tới", "Mình dùng nó hằng ngày", "Có thể bị kẻ gian lợi dụng", "Nên kiểm tra kỹ trước khi dùng"];

/** Bỏ dấu, viết hoa, chỉ giữ chữ và số (so sánh từ khóa, đoán từ). */
export const fold = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().replace(/[^A-Z0-9]/g, "");
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function makeHacker({ config, content, db, onScore, report }) {
  const SPEED = config.hackerSpeed || 1, T = k => Math.max(5, Math.round(MS[k] * SPEED));
  const where = new Map();   // pid -> "queue" | phòng bạn bè | ván đang chơi
  const queue = [];          // [{ pid, c, nick, at }]
  let qTimer = null, qStartAt = null;
  const rooms = new Map();   // mã 6 số -> phòng bạn bè đang chờ
  const games = new Set();
  let lastPair = -1;
  const ins = db.prepare("INSERT INTO hacker_games (id, mode, civ, hacker, players, rounds, result, started, ended) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");

  const send = (c, o) => { if (c && c.open) c.conn.sendJSON(o); };
  const toGame = (G, o) => { const s = JSON.stringify(o); for (const p of G.players) if (!p.bot && p.c && p.c.open && !p.left) p.c.conn.send(s); };
  const err = (c, text) => send(c, { t: "hk:err", text });

  /* ---------- Ghép ngẫu nhiên ---------- */
  function queueState() {
    const o = { t: "hk:queue", n: queue.length, min: HK.MIN, max: HK.MAX, startIn: qStartAt ? Math.max(0, qStartAt - Date.now()) : null };
    for (const q of queue) send(q.c, { ...o, waited: Date.now() - q.at });
  }
  function scheduleQueue() {
    if (queue.length >= HK.MAX) { clearTimeout(qTimer); qTimer = null; qStartAt = null; startGame(queue.splice(0, HK.MAX), "random"); return scheduleQueue(); }
    if (queue.length >= HK.MIN && !qTimer) { qStartAt = Date.now() + T("queue"); qTimer = setTimeout(() => { qTimer = null; qStartAt = null; if (queue.length >= HK.MIN) startGame(queue.splice(0, HK.MAX), "random"); scheduleQueue(); }, T("queue")); }
    if (queue.length < HK.MIN && qTimer) { clearTimeout(qTimer); qTimer = null; qStartAt = null; }
    queueState();
  }
  function joinQueue(c) {
    if (where.has(c.pid)) return resume(c);
    queue.push({ pid: c.pid, c, nick: c.nick, at: Date.now() }); where.set(c.pid, "queue");
    scheduleQueue();
  }

  /* ---------- Phòng bạn bè ---------- */
  function roomState(R) {
    const players = [...R.members.values()].map(m => ({ nick: m.nick, host: m.pid === R.host, bot: !!m.bot }));
    for (const m of R.members.values()) send(m.c, { t: "hk:room", code: R.code, host: m.pid === R.host, players, canStart: R.members.size >= HK.MIN && R.members.size <= HK.MAX, min: HK.MIN, max: HK.MAX, dev: !!config.devLogin });
  }
  function createRoom(c) {
    if (where.has(c.pid)) leave(c);
    let code; do code = String(randomInt(100000, 1000000)); while (rooms.has(code));
    const R = { code, host: c.pid, members: new Map() };
    R.members.set(c.pid, { pid: c.pid, c, nick: c.nick }); rooms.set(code, R); where.set(c.pid, R);
    roomState(R);
  }
  function joinRoom(c, code) {
    const R = rooms.get(String(code || "").trim());
    if (!R) return err(c, "Không tìm thấy phòng " + String(code || "").slice(0, 6) + ". Kiểm tra lại mã phòng nhé.");
    if (where.get(c.pid) === R) { R.members.get(c.pid).c = c; return roomState(R); }
    if (R.members.size >= HK.MAX) return err(c, "Phòng đã đủ " + HK.MAX + " người.");
    if (where.has(c.pid)) leave(c);
    R.members.set(c.pid, { pid: c.pid, c, nick: c.nick }); where.set(c.pid, R);
    roomState(R);
  }
  function startRoom(c) {
    const R = where.get(c.pid); if (!R || !R.members || R.host !== c.pid) return;
    if (R.members.size < HK.MIN) return err(c, "Cần ít nhất " + HK.MIN + " người để bắt đầu.");
    rooms.delete(R.code);
    startGame([...R.members.values()], "friend", R.code);
  }
  /** Chỉ khi chạy thử (DEV_LOGIN=1): thêm người chơi ảo vào phòng bạn bè để thử một mình. */
  function addBot(c) {
    if (!config.devLogin) return err(c, "Không có người chơi ảo ở bản chính thức.");
    const R = where.get(c.pid); if (!R || !R.members) return;
    if (R.members.size >= HK.MAX) return;
    const id = "bot-" + randomUUID().slice(0, 6);
    R.members.set(id, { pid: id, c: null, nick: "Người ảo " + (R.members.size), bot: true }); roomState(R);
  }

  /* ---------- Ván chơi ---------- */
  function pickPair() {
    const pairs = content().hacker.pairs;
    let i = randomInt(pairs.length); if (pairs.length > 1 && i === lastPair) i = (i + 1) % pairs.length;
    lastPair = i; return pairs[i];
  }
  function startGame(members, mode, code) {
    const pair = pickPair(), list = shuffle(members), nH = list.length >= HK.MAX ? 2 : 1;
    const hackerIdx = new Set(shuffle(list.map((_, i) => i)).slice(0, nH));
    const G = { id: randomUUID(), mode, code, pair, nH, round: 0, phase: "deal", timer: null, until: 0, startedAt: Date.now(), log: [], descs: [], ended: false,
      players: list.map((m, i) => ({ n: i + 1, pid: m.pid, c: m.c, nick: m.nick, bot: !!m.bot, hacker: hackerIdx.has(i), out: false, left: false, hits: new Set(), offTimer: null })) };
    games.add(G);
    phase(G, "deal", T("deal"), () => newRound(G)); // đặt giờ trước để thẻ chia từ có đồng hồ đếm ngược
    for (const p of G.players) { if (!p.bot) where.set(p.pid, G); sendDeal(G, p); }
  }
  const word = (G, p) => p.hacker ? G.pair.hacker : G.pair.civ;
  const pubPlayers = G => G.players.map(p => ({ n: p.n, nick: p.nick, out: p.out, left: p.left, hacker: p.out ? p.hacker : undefined }));
  function sendDeal(G, p) { send(p.c, { t: "hk:deal", id: G.id, mode: G.mode, you: p.n, word: word(G, p), players: pubPlayers(G), nH: G.nH, maxRounds: HK.MAX_ROUNDS, descs: G.descs, round: G.round, until: G.until, now: Date.now() }); }
  function phase(G, name, dur, next) { clearTimeout(G.timer); G.phase = name; G.until = Date.now() + dur; G.timer = setTimeout(next, dur); }
  const alive = G => G.players.filter(p => !p.out && !p.left);
  const aliveHackers = G => alive(G).filter(p => p.hacker);

  function newRound(G) {
    if (G.ended) return;
    if (G.round >= HK.MAX_ROUNDS) return endGame(G, "draw");
    G.round++; G.turnQueue = alive(G).map(p => p.n); G.turn = null;
    nextTurn(G);
  }
  function nextTurn(G) {
    if (G.ended) return;
    while (G.turnQueue.length) {
      const p = G.players[G.turnQueue.shift() - 1];
      if (p.out || p.left) continue;
      G.turn = p.n;
      toGame(G, { t: "hk:turn", round: G.round, n: p.n, dur: T("desc"), until: Date.now() + T("desc") });
      phase(G, "describe", T("desc"), () => { G.descs.push({ round: G.round, n: p.n, text: null }); toGame(G, { t: "hk:desc", round: G.round, n: p.n, text: null }); nextTurn(G); });
      if (p.bot) setTimeout(() => { if (G.turn === p.n && G.phase === "describe" && !G.ended) describe(G, p, BOT_LINES[randomInt(BOT_LINES.length)]); }, Math.min(1200, T("desc") / 3));
      return;
    }
    G.turn = null; startVote(G, null);
  }
  /** Kiểm tra câu mô tả: bộ lọc chat dùng chung, tối đa 80 ký tự, không chứa chính từ của mình (bỏ dấu, không phân biệt hoa thường). */
  function checkDesc(G, p, raw) {
    if (String(raw || "").trim().length > HK.DESC_MAX) return { no: "Câu mô tả tối đa " + HK.DESC_MAX + " ký tự." };
    const text = normalize(raw);
    if (!text) return { no: "Bạn chưa nhập câu mô tả." };
    const why = blockReason(text); if (why) return { no: "Câu mô tả chứa " + why + ", hãy viết lại." };
    if (fold(text).includes(fold(word(G, p)))) return { no: "Không được nói thẳng từ khóa của mình, hãy mô tả khéo hơn!" };
    return { text: cleanText(text) };
  }
  function describe(G, p, raw) {
    if (G.phase !== "describe" || G.turn !== p.n) return;
    const r = checkDesc(G, p, raw);
    if (r.no) return send(p.c, { t: "hk:descno", text: r.no });
    clearTimeout(G.timer); G.turn = null;
    G.descs.push({ round: G.round, n: p.n, text: r.text });
    toGame(G, { t: "hk:desc", round: G.round, n: p.n, text: r.text });
    phase(G, "describe", T("descGap"), () => nextTurn(G));
  }

  function startVote(G, cands) {
    if (G.ended) return;
    G.votes = new Map(); G.revote = !!cands; G.cands = cands || alive(G).map(p => p.n);
    const dur = T(cands ? "revote" : "vote");
    toGame(G, { t: "hk:vote", round: G.round, revote: G.revote, cands: G.cands, dur, until: Date.now() + dur });
    phase(G, "vote", dur, () => tally(G));
    for (const p of alive(G)) if (p.bot) setTimeout(() => { const opts = G.cands.filter(n => n !== p.n); if (G.phase === "vote" && opts.length) vote(G, p, opts[randomInt(opts.length)]); }, Math.min(900, dur / 4));
  }
  function vote(G, p, n) {
    if (G.phase !== "vote" || p.out || p.left || G.votes.has(p.n)) return;
    n = Number(n); if (n === p.n || !G.cands.includes(n)) return;
    G.votes.set(p.n, n);
    toGame(G, { t: "hk:voted", n: p.n, count: G.votes.size, of: alive(G).length });
    if (alive(G).every(q => G.votes.has(q.n))) { clearTimeout(G.timer); tally(G); }
  }
  function tally(G) {
    if (G.ended || G.phase !== "vote") return;
    G.phase = "tally";
    const counts = {};
    for (const [voter, target] of G.votes) {
      counts[target] = (counts[target] || 0) + 1;
      const v = G.players[voter - 1], t = G.players[target - 1];
      if (!v.hacker && t.hacker) v.hits.add(G.round); // Công dân chọn trúng Hacker: +50 cho vòng này (Hacker chọn Hacker kia không tính)
    }
    G.log.push({ round: G.round, revote: G.revote, votes: Object.fromEntries(G.votes) });
    const max = Math.max(0, ...Object.values(counts)), top = Object.keys(counts).filter(k => counts[k] === max).map(Number);
    if (!max || top.length > 1) {
      if (!G.revote && max) { toGame(G, { t: "hk:tie", round: G.round, counts, tied: top }); return phase(G, "tally", T("gap"), () => startVote(G, top)); }
      toGame(G, { t: "hk:nobody", round: G.round, counts });
      return phase(G, "tally", T("gap"), () => newRound(G));
    }
    eliminate(G, G.players[top[0] - 1], counts);
  }
  function eliminate(G, p, counts) {
    p.out = true;
    toGame(G, { t: "hk:out", round: G.round, n: p.n, hacker: p.hacker, counts });
    if (p.hacker && !p.left) return startGuess(G, p);
    phase(G, "tally", T("gap"), () => afterOut(G));
  }
  /** Hacker bị loại được đoán từ của Công dân một lần trong 20 giây. */
  function startGuess(G, p) {
    G.guesser = p.n;
    phase(G, "guess", T("gap") + T("guess"), () => guessed(G, p, null));
    setTimeout(() => { if (G.guesser === p.n && !G.ended) toGame(G, { t: "hk:guess", n: p.n, dur: T("guess"), until: Date.now() + T("guess") }); }, T("gap"));
    if (p.bot) setTimeout(() => { if (G.guesser === p.n && !G.ended) guessed(G, p, "Không biết"); }, T("gap") + Math.min(900, T("guess") / 3));
  }
  function guessed(G, p, text) {
    if (G.guesser !== p.n || G.ended) return;
    G.guesser = null; clearTimeout(G.timer);
    const ok = text != null && fold(text) === fold(G.pair.civ);
    toGame(G, { t: "hk:guessed", n: p.n, ok, text: text == null ? null : String(text).slice(0, 40) });
    if (ok) return endGame(G, "hacker", p);
    phase(G, "tally", T("gap"), () => afterOut(G));
  }
  /** Sau khi có người bị loại (hoặc rời ván): kiểm tra thắng thua, chưa phân thắng thua thì sang vòng mới. */
  function afterOut(G) {
    if (G.ended) return;
    const r = verdict(G); if (r) return endGame(G, r);
    newRound(G);
  }
  function verdict(G) {
    if (!aliveHackers(G).length) return "civ";                         // loại được tất cả Hacker
    if (alive(G).length <= 2) return "hacker";                        // còn đúng 2 người, trong đó có Hacker
    return null;
  }

  /* ---------- Kết thúc ván: tính điểm, lưu, công bố vai ---------- */
  function endGame(G, result, guesser = null) {
    if (G.ended) return; G.ended = true; clearTimeout(G.timer); games.delete(G);
    for (const p of G.players) {
      clearTimeout(p.offTimer);
      let pts = 0;
      if (!p.left) {
        if (result === "civ" && !p.hacker) pts += 100;
        if (result === "hacker" && p.hacker) pts += 200 + (guesser === p ? 100 : 0);
        if (!p.hacker) pts += 50 * p.hits.size;
      }
      p.points = pts;
    }
    try { ins.run(G.id, G.mode, G.pair.civ, G.pair.hacker, JSON.stringify(G.players.map(p => ({ n: p.n, pid: p.pid, nick: p.nick, hacker: p.hacker, out: p.out, left: p.left, points: p.points, bot: p.bot }))), JSON.stringify({ descs: G.descs, votes: G.log }), result, G.startedAt, Date.now()); }
    catch (e) { console.warn("Không lưu được ván Ai là Hacker:", e.message); }
    const roles = G.players.map(p => ({ n: p.n, nick: p.nick, hacker: p.hacker, out: p.out, left: p.left, points: p.points, hits: p.hits.size }));
    for (const p of G.players) {
      if (p.bot) continue;
      if (where.get(p.pid) === G) where.delete(p.pid);
      const score = p.bot ? null : onScore(p.pid, p.points, G.mode === "random" && !p.left);
      send(p.c, { t: "hk:end", id: G.id, result, guesser: guesser ? guesser.n : null, civ: G.pair.civ, hacker: G.pair.hacker, knowledge: G.pair.knowledge, roles, you: p.n, mode: G.mode, rounds: G.round, score });
    }
  }

  /* ---------- Rời ván, mất kết nối, nối lại ---------- */
  function markLeft(G, p) {
    if (p.left || G.ended) return;
    p.left = true; clearTimeout(p.offTimer);
    const wasAlive = !p.out; p.out = true;
    toGame(G, { t: "hk:left", n: p.n, hacker: wasAlive ? undefined : p.hacker });
    if (!G.players.some(q => !q.bot && !q.left)) return endGame(G, "draw"); // không còn ai: đóng ván
    if (!wasAlive) return;
    if (G.phase === "describe" && G.turn === p.n) { clearTimeout(G.timer); G.turn = null; nextTurn(G); }
    else if (G.phase === "guess" && G.guesser === p.n) guessed(G, p, null);
    else if (G.phase === "vote") { G.cands = G.cands.filter(n => n !== p.n); if (alive(G).every(q => G.votes.has(q.n))) { clearTimeout(G.timer); tally(G); } }
    const r = verdict(G); if (r && G.phase !== "guess") endGame(G, r);
  }
  function leave(c) {
    const W = where.get(c.pid); if (!W) return;
    if (W === "queue") { const i = queue.findIndex(q => q.pid === c.pid); if (i >= 0) queue.splice(i, 1); where.delete(c.pid); return scheduleQueue(); }
    if (W.members) { // phòng bạn bè đang chờ
      W.members.delete(c.pid); where.delete(c.pid);
      const humans = [...W.members.values()].filter(m => !m.bot);
      if (!humans.length) { rooms.delete(W.code); return; }
      if (W.host === c.pid) W.host = humans[0].pid;
      return roomState(W);
    }
    const p = W.players.find(q => q.pid === c.pid); where.delete(c.pid);
    if (p) markLeft(W, p);
  }
  function resume(c) {
    const W = where.get(c.pid);
    if (!W) return send(c, { t: "hk:idle" });
    if (W === "queue") { const q = queue.find(x => x.pid === c.pid); if (q) q.c = c; return queueState(); }
    if (W.members) { W.members.get(c.pid).c = c; return roomState(W); }
    const p = W.players.find(q => q.pid === c.pid); if (!p) return;
    p.c = c; clearTimeout(p.offTimer); p.offTimer = null;
    sendDeal(W, p);
    const left = Math.max(0, W.until - Date.now());
    if (W.phase === "describe" && W.turn) send(c, { t: "hk:turn", round: W.round, n: W.turn, dur: left, until: W.until });
    else if (W.phase === "vote") send(c, { t: "hk:vote", round: W.round, revote: W.revote, cands: W.cands, dur: left, until: W.until, mine: W.votes.get(p.n) || null });
    else if (W.phase === "guess" && W.guesser) send(c, { t: "hk:guess", n: W.guesser, dur: left, until: W.until });
  }

  function onMessage(c, m) {
    const W = where.get(c.pid), G = W && W.players ? W : null, p = G ? G.players.find(q => q.pid === c.pid) : null;
    if (p && p.c !== c) { p.c = c; clearTimeout(p.offTimer); p.offTimer = null; }
    switch (m.t) {
      case "hk:queue": return joinQueue(c);
      case "hk:create": return createRoom(c);
      case "hk:join": return joinRoom(c, m.code);
      case "hk:start": return startRoom(c);
      case "hk:bot": return addBot(c);
      case "hk:leave": return leave(c);
      case "hk:resume": return resume(c);
      case "hk:desc": if (p) describe(G, p, m.text); return;
      case "hk:vote": if (p) vote(G, p, m.n); return;
      case "hk:guess": if (p && G.phase === "guess") guessed(G, p, String(m.text || "").slice(0, 60)); return;
      case "hk:report": { if (!G) return; const d = G.descs.find(x => x.n === Number(m.n) && x.text && x.round === Number(m.round)); const a = d && G.players[d.n - 1]; if (a && report) report(c.pid, a.pid, a.nick, d.text); send(c, { t: "hk:err", text: "Đã gửi báo cáo, cảm ơn bạn!", ok: true }); return; }
    }
  }
  /** Mất kết nối: hàng chờ, phòng bạn bè thì rời ngay; đang chơi thì giữ chỗ 30 giây chờ nối lại. */
  function onClose(c) {
    const W = where.get(c.pid); if (!W) return;
    if (W === "queue") { const q = queue.find(x => x.pid === c.pid); if (q && q.c === c) leave(c); return; }
    if (W.members) { const m = W.members.get(c.pid); if (m && m.c === c) leave(c); return; }
    const p = W.players.find(q => q.pid === c.pid); if (!p || p.c !== c) return;
    clearTimeout(p.offTimer);
    p.offTimer = setTimeout(() => { if (p.c === c && !c.open && where.get(p.pid) === W) { where.delete(p.pid); markLeft(W, p); } }, T("grace"));
  }
  function status() { return { queue: queue.length, startIn: qStartAt ? Math.max(0, qStartAt - Date.now()) : null, min: HK.MIN, max: HK.MAX, rooms: rooms.size, games: games.size, playing: [...games].reduce((n, G) => n + G.players.filter(p => !p.left && !p.bot).length, 0) }; }

  return { onMessage, onClose, status, _games: games };
}
