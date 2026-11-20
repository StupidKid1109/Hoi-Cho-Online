// Đấu phòng Gian 2 (Đuổi hình bắt chữ), phòng chờ 3D của Gian 1 và quán cà phê.
// Gian 2: vào phòng chờ; đủ MIN người thì đếm ngược rồi bắt đầu, đủ MAX thì bắt đầu ngay.
// Gian 1 (Ai là Hacker?) chỉ dùng phần không gian ở đây (đi lại, chào, chat) như quán cà phê; ghép ván ở hacker.js.
// Mọi người trong phòng chơi cùng một đề, cùng lúc. Máy chủ giữ đáp án, tính giờ và chấm điểm.
// Tin nhắn đi qua kết nối WebSocket của khu hội chợ (realtime.js chuyển các tin bắt đầu bằng "m" sang đây).
//
// Điện thoại gửi:  {t:"mjoin", g} · {t:"mleave"}
//                  {t:"mguess", k, text} · {t:"mhint", k} (Gian 2)
//                  {t:"mpos", x, y} · {t:"memote", e} (đi lại, chào nhau trong không gian riêng của gian)
//                  {t:"mchat", text} (chat trong phòng chờ và quán cà phê; g = "cafe" khi vào quán)
// Máy chủ gửi:     mlobby (phòng chờ) · mspace / mpjoin / mpleave / mposes / memote (người trong không gian gian hàng)
//                  mstart · mround (mở một câu) · mreveal (đáp án câu đó)
//                  mguess / mhint (trả lời riêng) · msolved (có người đoán đúng) · mend (kết quả) · merr
import { shuffle, strip, tilesFor } from "./games.js";
import { CAFE_MAX, CAFE_SEATS, roomOf, inPoly } from "../../shared/world.js";
import { blockReason, cleanText, normalize, CHAT_GAP_MS } from "../../shared/chatFilter.js";
import { encodeFrame } from "./ws.js";

const G2_MS = 30000, G2_REVEAL_MS = 6000, G2_HINT_COST = 100, G2_PLACE_BONUS = [200, 100, 50];
const START_DELAY_MS = 2500, FULL_START_MS = 3000;

export function makeMatches({ config, content, canPlay, beginRun, finishRun }) {
  const MIN = config.matchMin || 20, MAX = config.matchMax || 50;
  const COUNTDOWN = config.matchCountdown ?? 15000, SPEED = config.matchSpeed || 1;
  const ms = v => Math.round(v * SPEED);
  const lobbies = new Map();   // game -> phòng chờ hiện tại ("cafe": phòng quán cà phê đang nhận khách)
  let music = { file: null, yt: null, title: "", startedAt: 0, loop: true, volume: 0.8 }; // nhạc trong quán, quản trị viên bật
  const where = new Map();     // pid -> phòng chờ hoặc phòng đang chơi
  let nextRoom = 1;

  const send = (c, o) => { if (c.open) c.conn.sendJSON(o); };
  const toAll = (room, o) => { const s = JSON.stringify(o); for (const p of room.players.values()) if (p.c.open && !p.left) p.c.conn.send(s); };
  const ranking = room => [...room.players.values()].sort((a, b) => b.score - a.score || a.joinAt - b.joinAt);
  const top = (room, n) => ranking(room).slice(0, n).map(p => ({ nick: p.nick, score: p.score }));

  /* ---------- Phòng chờ ---------- */
  function lobbyOf(game) {
    let L = lobbies.get(game);
    if (!L) { L = { id: nextRoom++, game, players: new Map(), startAt: null, timer: null, lobby: true, cafe: game === "cafe", social: game === "cafe" || game === "g1", seats: new Map(), nextN: 1, dirty: new Set() }; lobbies.set(game, L); live.add(L); }
    return L;
  }
  /* ---------- Không gian riêng của gian hàng: ai đang chờ, đứng ở đâu ---------- */
  const live = new Set(); // các phòng chờ đang mở (cả phòng đã đủ người đang chờ bắt đầu)
  const pub = p => ({ n: p.n, nick: p.nick, gd: p.c.gd || undefined, x: Math.round(p.x), y: Math.round(p.y), seat: p.seat ?? -1 });
  /** Ghế trong quán: mỗi ghế một người; s = -1 là đứng dậy. */
  function freeSeat(L, p) { if (p.seat >= 0 && L.seats.get(p.seat) === p.pid) L.seats.delete(p.seat); const had = p.seat >= 0; p.seat = -1; return had; }
  function sitInSpace(c, m) {
    const L = where.get(c.pid); if (!L || !L.lobby || !L.cafe) return;
    const p = L.players.get(c.pid), s = Number(m.s); if (!p || !Number.isInteger(s)) return;
    if (s === -1) { if (freeSeat(L, p)) toAll(L, { t: "msit", g: L.game, n: p.n, s: -1 }); return; } // đứng dậy: không giới hạn
    const now = Date.now(); if (now - (p.lastSit || 0) < 150 && p.seat !== s) return; p.lastSit = now; // chống bấm dồn (ngồi lại đúng ghế đang ngồi thì luôn trả lời)
    const se = CAFE_SEATS[s]; if (!se) return;
    const who = L.seats.get(s);
    if (who && who !== p.pid) return send(c, { t: "msitno", g: L.game, s, text: "Ghế này có người ngồi rồi, bạn chọn ghế khác nhé." });
    freeSeat(L, p); L.seats.set(s, p.pid); p.seat = s; p.x = se.x; p.y = se.y;
    toAll(L, { t: "msit", g: L.game, n: p.n, s });
  }
  /** Đưa người chơi vào không gian của phòng chờ L: gán số thứ tự, chỗ đứng gần cửa, báo cho mọi người. */
  function enterSpace(L, p) {
    p.n = L.nextN++;
    const R = roomOf(L.game);
    if (R.walk) { p.x = R.door.x - Math.random() * 200; p.y = R.door.y + 200 + Math.random() * 120; } // quán: vào từ cửa tường sau, đứng lùi vào trong
    else { p.x = R.door.x + (Math.random() - 0.5) * 300; p.y = R.door.y - Math.random() * 120; }
    send(p.c, { t: "mspace", g: L.game, you: pub(p), peers: [...L.players.values()].filter(q => q !== p).map(pub) });
    const s = JSON.stringify({ t: "mpjoin", g: L.game, peer: pub(p) });
    for (const q of L.players.values()) if (q !== p && q.c.open) q.c.conn.send(s);
  }
  // nhịp gửi vị trí trong không gian gian hàng (giống ở sảnh: gom 100 ms một lần)
  const posTick = setInterval(() => {
    for (const L of live) {
      if (!L.dirty.size) continue;
      const p = [...L.dirty].filter(q => L.players.get(q.pid) === q).map(q => [q.n, Math.round(q.x), Math.round(q.y)]); L.dirty.clear();
      if (!p.length) continue;
      const f = encodeFrame(JSON.stringify({ t: "mposes", g: L.game, p }));
      for (const q of L.players.values()) if (q.c.open) q.c.conn.sendFrame(f);
    }
  }, 100);
  posTick.unref();
  function moveInSpace(c, m) {
    const L = where.get(c.pid); if (!L || !L.lobby) return;
    const p = L.players.get(c.pid), x = Number(m.x), y = Number(m.y), R = roomOf(L.game), M = R.margin;
    if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const now = Date.now(); if (now - (p.lastPos || 0) < 60) return; p.lastPos = now;
    const nx = Math.max(M, Math.min(R.w - M, x)), ny = Math.max(M, Math.min(R.h - M, y));
    if (R.walk && !inPoly(nx, ny, R.walk) && !CAFE_SEATS.some(se => Math.hypot(se.x - nx, se.y - ny) < 45)) return; // ngoài sàn quán (sau quầy, ngoài kính)
    p.x = nx; p.y = ny;
    if (p.seat >= 0) { const se = CAFE_SEATS[p.seat]; if (Math.hypot(se.x - p.x, se.y - p.y) > 40 && freeSeat(L, p)) toAll(L, { t: "msit", g: L.game, n: p.n, s: -1 }); } // đi khỏi ghế
    L.dirty.add(p);
  }
  function emoteInSpace(c, m) {
    const L = where.get(c.pid); if (!L || !L.lobby) return;
    const p = L.players.get(c.pid), e = Number(m.e), now = Date.now();
    if (!p || !Number.isInteger(e) || e < 0 || e > 3 || now - (p.lastEmote || 0) < 1500) return;
    p.lastEmote = now; toAll(L, { t: "memote", g: L.game, n: p.n, e });
  }
  /** Chat trong phòng chờ / quán: cùng bộ lọc với chat ở sảnh (số điện thoại, link, OTP, từ tục, gửi quá nhanh). */
  function chatInSpace(c, m) {
    const L = where.get(c.pid); if (!L || !L.lobby) return;
    const p = L.players.get(c.pid), now = Date.now(); if (!p) return;
    if (c.banned) return send(c, { t: "msys", g: L.game, text: "Tài khoản của bạn đang bị tạm khóa chat." });
    if (now - (p.lastChat || 0) < CHAT_GAP_MS) return send(c, { t: "msys", g: L.game, text: "Bạn nhắn nhanh quá, đợi vài giây nhé." });
    const text = normalize(m.text); if (!text) return;
    const why = blockReason(text);
    if (why) return send(c, { t: "msys", g: L.game, text: "⚠️ Tin chưa được gửi vì chứa " + why + ". Không chia sẻ những thông tin này ở nơi công cộng, cẩn thận lừa đảo!" });
    p.lastChat = now;
    toAll(L, { t: "mchat", g: L.game, n: p.n, nick: p.nick, text: cleanText(text) });
  }
  const musicMsg = () => ({ t: "cmusic", g: "cafe", ...music, now: Date.now() });
  /** Quản trị viên bật/tắt nhạc: báo cho mọi người đang trong quán (mọi phòng quán). */
  function setMusic(next) {
    music = { ...music, ...next };
    for (const L of live) if (L.cafe) toAll(L, musicMsg());
    return music;
  }
  function lobbyState(L) {
    if (L.cafe) return toAll(L, { t: "mlobby", g: "cafe", n: L.players.size, max: CAFE_MAX, cafe: true, names: [] });
    if (L.social) return toAll(L, { t: "mlobby", g: L.game, n: L.players.size, social: true, names: [] }); // phòng chờ Gian 1: chỉ để gặp nhau
    const names = [...L.players.values()].map(p => p.nick);
    toAll(L, { t: "mlobby", g: L.game, n: L.players.size, min: MIN, max: MAX, startIn: L.startAt ? Math.max(0, L.startAt - Date.now()) : null, names });
  }
  function schedule(L) {
    if (L.social) { if (L.players.size >= CAFE_MAX && lobbies.get(L.game) === L) lobbies.delete(L.game); return; } // quán, phòng chờ Gian 1 không bắt đầu ván; đầy thì mở phòng mới
    clearTimeout(L.timer); L.timer = null;
    const n = L.players.size;
    if (n < MIN) { L.startAt = null; return; }
    if (n >= MAX && lobbies.get(L.game) === L) lobbies.delete(L.game); // đủ người tối đa: đóng phòng chờ, người sau vào phòng chờ mới
    const wait = n >= MAX ? Math.min(FULL_START_MS, L.startAt ? L.startAt - Date.now() : FULL_START_MS) : (L.startAt ? L.startAt - Date.now() : COUNTDOWN);
    L.startAt = Date.now() + Math.max(0, wait);
    L.timer = setTimeout(() => startRoom(L), Math.max(0, wait));
  }
  function join(c, game) {
    if (game !== "g1" && game !== "g2" && game !== "cafe") return;
    const cur = where.get(c.pid);
    if (cur && cur.players.has(c.pid)) cur.players.get(c.pid).c = c; // kết nối lại: gắn vào kết nối mới
    if (cur && cur.lobby && cur.game === game) { const p = cur.players.get(c.pid); send(c, { t: "mspace", g: game, you: pub(p), peers: [...cur.players.values()].filter(q => q !== p).map(pub) }); if (cur.cafe) send(c, musicMsg()); return lobbyState(cur); } // đã ở phòng chờ này
    if (cur && !cur.lobby && cur.game === game && !cur.players.get(c.pid).left) return send(c, { t: "mstart", g: game, room: cur.id, n: cur.players.size, total: cur.set.length, in: 0, rejoin: true });
    if (cur) leave(c);
    const why = game === "g2" ? canPlay(c.pid) : null; if (why) return send(c, { t: "merr", g: game, text: why });
    const L = lobbyOf(game);
    const p = { c, pid: c.pid, nick: c.nick, joinAt: Date.now(), score: 0, seat: -1 };
    L.players.set(c.pid, p);
    where.set(c.pid, L);
    enterSpace(L, p);
    if (L.cafe) send(c, musicMsg());
    schedule(L); lobbyState(L);
  }
  function leave(c) {
    const R = where.get(c.pid); if (!R) return;
    where.delete(c.pid);
    if (R.lobby) {
      const p = R.players.get(c.pid); R.players.delete(c.pid); if (p) { if (R.seats) freeSeat(R, p); toAll(R, { t: "mpleave", g: R.game, n: p.n }); }
      if (R.social && !R.players.size && lobbies.get(R.game) !== R) { live.delete(R); return; } // phòng phụ đã vắng: đóng
      schedule(R); lobbyState(R); return;
    }
    const p = R.players.get(c.pid); if (p) p.left = true; // rời giữa ván: vẫn tính điểm đã có khi ván kết thúc
    if ([...R.players.values()].every(x => x.left || !x.c.open)) endRoom(R, true);
  }

  /* ---------- Bắt đầu ván ---------- */
  function startRoom(L) {
    if (lobbies.get(L.game) === L) lobbies.delete(L.game);
    live.delete(L);
    clearTimeout(L.timer);
    // người đã mất kết nối thì bỏ khỏi phòng; còn dưới MIN (hiếm) thì quay lại chờ
    for (const [pid, p] of L.players) if (!p.c.open) { L.players.delete(pid); where.delete(pid); }
    if (L.players.size < MIN) {
      const N = lobbyOf(L.game);
      for (const [pid, p] of L.players) { N.players.set(pid, p); where.set(pid, N); enterSpace(N, p); }
      schedule(N); lobbyState(N); return;
    }
    const R = { id: L.id, game: L.game, players: L.players, lobby: false, k: -1, open: false, timer: null, startedAt: Date.now() };
    const c = content();
    R.set = shuffle([...c.rebus.puzzles.keys()]).slice(0, c.rebus.perRound || 5);
    for (const p of R.players.values()) {
      Object.assign(p, { score: 0, ok: 0, streak: 0, top: 0, miss: [], hints: 0, solved: 0, runId: beginRun(p.pid, R.game, { room: R.id }) });
      where.set(p.pid, R);
    }
    toAll(R, { t: "mstart", g: R.game, room: R.id, n: R.players.size, total: R.set.length, in: ms(START_DELAY_MS) });
    R.timer = setTimeout(() => nextRound(R), ms(START_DELAY_MS));
  }

  function nextRound(R) {
    R.k++;
    if (R.k >= R.set.length) return endRoom(R);
    const c = content(); R.open = true; R.openAt = Date.now(); R.answers = new Map(); R.placed = 0;
    {
      const pz = c.rebus.puzzles[R.set[R.k]];
      R.ans = strip(pz.name); R.dur = ms(G2_MS);
      for (const p of R.players.values()) { p.lock = []; p.rHints = 0; p.rGain = 0; p.rOk = false; }
      toAll(R, { t: "mround", g: "g2", k: R.k, total: R.set.length, pics: pz.pics, words: pz.name.split(/\s+/).map(w => strip(w).length), tiles: tilesFor(R.ans), dur: R.dur });
    }
    R.timer = setTimeout(() => reveal(R), R.dur + 300); // chờ thêm chút cho người mạng chậm
  }
  const active = R => [...R.players.values()].filter(p => !p.left && p.c.open);
  const left = R => Math.max(0, 1 - (Date.now() - R.openAt) / R.dur);

  /* ---------- Gian 2: đoán, gợi ý ---------- */
  function guessG2(c, m) {
    const R = where.get(c.pid); if (!R || R.lobby || R.game !== "g2" || !R.open || m.k !== R.k) return;
    const p = R.players.get(c.pid); if (!p || p.rOk) return;
    const now = Date.now(); if (now - (p.lastGuess || 0) < 250) return; p.lastGuess = now;
    if (strip(m.text || "") !== R.ans) return send(c, { t: "mguess", g: "g2", k: R.k, ok: false });
    const place = ++R.placed, gain = Math.max(50, 300 + Math.round(700 * left(R)) - G2_HINT_COST * p.rHints) + (G2_PLACE_BONUS[place - 1] || 0);
    p.rOk = true; p.rGain = gain; p.score += gain; p.ok++;
    send(c, { t: "mguess", g: "g2", k: R.k, ok: true, gain, place, score: p.score });
    toAll(R, { t: "msolved", g: "g2", k: R.k, nick: p.nick, place, n: active(R).length });
    if (active(R).every(x => x.rOk)) { clearTimeout(R.timer); reveal(R); } // ai cũng đã đoán đúng
  }
  function hintG2(c, m) {
    const R = where.get(c.pid); if (!R || R.lobby || R.game !== "g2" || !R.open || m.k !== R.k) return;
    const p = R.players.get(c.pid); if (!p || p.rOk) return;
    const pos = [...R.ans].findIndex((_, i) => !p.lock.includes(i)); if (pos < 0) return;
    p.lock.push(pos); p.rHints++; p.hints++;
    send(c, { t: "mhint", g: "g2", k: R.k, pos, letter: R.ans[pos] });
  }

  /* ---------- Đáp án từng câu ---------- */
  function reveal(R) {
    if (!R.open) return;
    R.open = false; clearTimeout(R.timer);
    const c = content(), n = R.players.size;
    {
      const pz = c.rebus.puzzles[R.set[R.k]], solved = [...R.players.values()].filter(p => p.rOk).length;
      const ranked = ranking(R), t3 = ranked.slice(0, 3).map(p => ({ nick: p.nick, score: p.score }));
      ranked.forEach((p, i) => send(p.c, { t: "mreveal", g: "g2", k: R.k, last: R.k >= R.set.length - 1, name: pz.name, info: pz.info, pics: pz.pics,
        you: { ok: p.rOk, gain: p.rGain, score: p.score }, solved, top: t3, rank: i + 1, n, next: ms(G2_REVEAL_MS) }));
      R.timer = setTimeout(() => nextRound(R), ms(G2_REVEAL_MS));
    }
  }

  /* ---------- Kết thúc ván: ghi điểm, gửi xếp hạng ---------- */
  function endRoom(R, abandoned = false) {
    if (R.ended) return; R.ended = true; clearTimeout(R.timer);
    const c = content(), ranked = ranking(R), t10 = top(R, 10), n = R.players.size;
    ranked.forEach((p, i) => {
      if (where.get(p.pid) === R) where.delete(p.pid);
      let res;
      res = { score: p.score, stats: { ok: p.ok, total: R.set.length, hints: p.hints },
        review: R.set.map(j => ({ pics: c.rebus.puzzles[j].pics, name: c.rebus.puzzles[j].name, info: c.rebus.puzzles[j].info })) };
      const out = finishRun(p.runId, R.game, res);
      if (!abandoned) send(p.c, { t: "mend", g: R.game, rank: i + 1, n, top: t10, result: out });
    });
  }

  function onMessage(c, m) {
    if (m.t === "mjoin") join(c, m.g);
    else if (m.t === "mleave") leave(c);
    else if (m.t === "mguess") guessG2(c, m);
    else if (m.t === "mhint") hintG2(c, m);
    else if (m.t === "mpos") moveInSpace(c, m);
    else if (m.t === "memote") emoteInSpace(c, m);
    else if (m.t === "mchat") chatInSpace(c, m);
    else if (m.t === "msit") sitInSpace(c, m);
  }
  /** Mất kết nối: rời phòng chờ, hoặc đánh dấu đã rời ván đang chơi. */
  function onClose(c) { const R = where.get(c.pid); if (R && R.players.get(c.pid)?.c === c) leave(c); }
  /** Tình trạng công khai: số người đang chờ ở mỗi gian, số phòng và số người đang chơi. */
  function status() {
    const rooms = new Set([...where.values()].filter(r => !r.lobby));
    const wait = g => { const L = lobbies.get(g); return L ? { n: L.players.size, startIn: L.startAt ? Math.max(0, L.startAt - Date.now()) : null } : { n: 0, startIn: null }; };
    const cafe = [...live].filter(L => L.cafe).reduce((n, L) => n + L.players.size, 0);
    return { min: MIN, max: MAX, g1: wait("g1"), g2: wait("g2"), cafe: { n: cafe, music: music.file || music.yt ? music.title : null }, rooms: rooms.size, playing: [...rooms].reduce((n, r) => n + [...r.players.values()].filter(p => !p.left).length, 0) };
  }

  return { onMessage, onClose, status, setMusic, music: () => music, MIN, MAX };
}
