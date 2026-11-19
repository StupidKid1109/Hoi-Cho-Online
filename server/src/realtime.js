// Các khu hội chợ thời gian thực: vị trí người chơi, cử chỉ, chat có kiểm duyệt.
import { blockReason, cleanText, normalize, CHAT_GAP_MS } from "../../shared/chatFilter.js";
import { WORLD, SPAWN, SEATS } from "../../shared/world.js";
import { encodeFrame } from "./ws.js";

const EMOTES = 4, HIDE_AFTER_REPORTS = 3;
// Vị trí người chơi được gom lại và gửi theo nhịp (thay vì chuyển từng bước ngay lập tức):
// 100 người trong một khu thì mỗi điện thoại nhận khoảng 10 tin/giây thay vì vài trăm.
const TICK_MS = 100;
const SLOW_BUFFER = 256 * 1024; // người đang dồn ứ dữ liệu: bỏ qua gói vị trí lần này (gói sau vẫn có vị trí mới nhất)

export function makeRealtime({ db, store, auth, config, matches }) {
  const rooms = new Map(); // khu -> Map(playerId -> client)
  for (let k = 1; k <= config.khuCount; k++) rooms.set(k, new Map());
  const insChat = db.prepare("INSERT INTO chat (khu, player, nick, text, ts) VALUES (?, ?, ?, ?, ?)");
  const recent = db.prepare("SELECT id, player, nick, text, ts FROM chat WHERE khu = ? AND hidden = 0 ORDER BY id DESC LIMIT 20");
  const getChat = db.prepare("SELECT id, khu, player FROM chat WHERE id = ?");
  const addReport = db.prepare("INSERT OR IGNORE INTO reports (chat_id, reporter, ts) VALUES (?, ?, ?)");
  const countReports = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE chat_id = ?");
  const hideChat = db.prepare("UPDATE chat SET hidden = 1 WHERE id = ?");

  // đóng gói một lần, gửi cho cả khu
  const broadcast = (khu, msg, except) => { const f = encodeFrame(JSON.stringify(msg)); for (const c of rooms.get(khu).values()) if (c !== except) c.conn.sendFrame(f); };
  // n: số thứ tự ngắn của người chơi trong khu, dùng trong gói vị trí cho gọn
  const pub = c => ({ id: c.pid, n: c.n, nick: c.nick, x: Math.round(c.x), y: Math.round(c.y), seat: c.seat });
  const nextN = new Map(); for (const k of rooms.keys()) nextN.set(k, 1);
  const dirty = new Map(); for (const k of rooms.keys()) dirty.set(k, new Set()); // người đã di chuyển từ nhịp trước
  // Nhịp gửi vị trí: mỗi khu một gói [[n, x, y], ...] cho những người đã di chuyển
  const tick = setInterval(() => {
    for (const [khu, set] of dirty) {
      if (!set.size) continue;
      const p = []; for (const c of set) if (c.open) p.push([c.n, Math.round(c.x), Math.round(c.y)]);
      set.clear(); if (!p.length) continue;
      const f = encodeFrame(JSON.stringify({ t: "poses", p }));
      for (const c of rooms.get(khu).values()) if (c.conn.buffered < SLOW_BUFFER) c.conn.sendFrame(f);
    }
  }, TICK_MS);
  tick.unref();
  // Chỗ ngồi: mỗi khu một bảng ghế -> người đang ngồi
  const seatsOf = new Map(); for (const k of rooms.keys()) seatsOf.set(k, new Map());
  function standUp(c, announce = true) {
    if (c.seat < 0) return;
    const occ = seatsOf.get(c.khu); if (occ.get(c.seat) === c.pid) occ.delete(c.seat);
    c.seat = -1;
    if (announce) broadcast(c.khu, { t: "sit", id: c.pid, s: -1 });
  }

  function onConnection(conn, url) {
    const pid = auth.verify(url.searchParams.get("token"));
    const khu = Number(url.searchParams.get("khu"));
    if (!pid || !rooms.has(khu)) { conn.sendJSON({ t: "error", text: "Phiên đăng nhập hoặc khu không hợp lệ" }); return conn.close(4001); }
    const room = rooms.get(khu);
    if (room.size >= config.khuCapacity && !room.has(pid)) { conn.sendJSON({ t: "full", text: "Khu đã đầy, hãy chọn khu khác" }); return conn.close(4002); }
    const player = store.ensurePlayer(pid);
    const old = room.get(pid); if (old) old.conn.close(4003); // mở ở máy khác: đóng kết nối cũ
    const n = nextN.get(khu); nextN.set(khu, n + 1);
    const c = { conn, pid, khu, n, open: true, nick: player.nick, banned: !!player.banned, x: SPAWN.x, y: SPAWN.y, seat: -1, lastPos: 0, lastChat: 0, lastEmote: 0, lastSit: 0, posN: 0 };
    room.set(pid, c);
    conn.sendJSON({ t: "welcome", you: pub(c), peers: [...room.values()].filter(x => x !== c).map(pub),
      history: recent.all(khu).reverse().map(m => ({ id: m.id, pid: m.player, nick: m.nick, text: m.text, ts: m.ts })) });
    broadcast(khu, { t: "join", peer: pub(c) }, c);

    conn.on("message", raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      const now = Date.now();
      if (matches && typeof m.t === "string" && m.t[0] === "m") return matches.onMessage(c, m); // đấu phòng Gian 1, Gian 2
      if (m.t === "pos") {
        if (now - c.lastPos < 60) return; // tối đa khoảng 16 lần/giây
        const x = Number(m.x), y = Number(m.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        c.x = Math.max(0, Math.min(WORLD, x)); c.y = Math.max(0, Math.min(WORLD, y)); c.lastPos = now;
        if (c.seat >= 0 && Math.hypot(c.x - SEATS[c.seat].x, c.y - SEATS[c.seat].y) > 40) standUp(c); // đã rời ghế
        dirty.get(khu).add(c); // gửi trong nhịp tới
      } else if (m.t === "sit") {
        // s = số thứ tự chỗ ngồi trong shared/world.js, -1 = đứng dậy
        const s = Number(m.s); if (!Number.isInteger(s) || s < -1 || s >= SEATS.length || now - c.lastSit < 300) return;
        c.lastSit = now;
        if (s === -1) return standUp(c);
        const occ = seatsOf.get(khu), who = occ.get(s);
        if (who && who !== pid) return conn.sendJSON({ t: "sitno", s, text: "Ghế này đã có người ngồi, bạn chọn ghế khác nhé." });
        standUp(c, false);
        occ.set(s, pid); c.seat = s; c.x = SEATS[s].x; c.y = SEATS[s].y;
        broadcast(khu, { t: "sit", id: pid, s });
      } else if (m.t === "emote") {
        const e = Number(m.e); if (!Number.isInteger(e) || e < 0 || e >= EMOTES || now - c.lastEmote < 1500) return;
        c.lastEmote = now; broadcast(khu, { t: "emote", id: pid, e }, c);
      } else if (m.t === "chat") {
        if (c.banned) return conn.sendJSON({ t: "sys", text: "Tài khoản của bạn đang bị tạm khóa chat." });
        if (now - c.lastChat < CHAT_GAP_MS) return conn.sendJSON({ t: "sys", text: "Bạn nhắn nhanh quá, đợi vài giây nhé." });
        const text = normalize(m.text); if (!text) return;
        const why = blockReason(text);
        if (why) return conn.sendJSON({ t: "sys", text: "⚠️ Tin chưa được gửi vì chứa " + why + ". Không chia sẻ những thông tin này ở nơi công cộng, cẩn thận lừa đảo!" });
        c.lastChat = now;
        const clean = cleanText(text), id = Number(insChat.run(khu, pid, c.nick, clean, now).lastInsertRowid);
        broadcast(khu, { t: "chat", m: { id, pid, nick: c.nick, text: clean, ts: now } });
      } else if (m.t === "report") {
        const row = getChat.get(Number(m.id)); if (!row || row.khu !== khu || row.player === pid) return;
        addReport.run(row.id, pid, now);
        conn.sendJSON({ t: "sys", ok: true, text: "Đã gửi báo cáo cho ban quản trị. Cảm ơn bạn!" });
        if (countReports.get(row.id).n >= HIDE_AFTER_REPORTS) { hideChat.run(row.id); broadcast(khu, { t: "hide", id: row.id }); }
      }
    });
    conn.on("close", () => {
      c.open = false; dirty.get(khu).delete(c);
      if (matches) matches.onClose(c);
      // nhả ghế (trừ khi người này vừa mở lại ở máy khác và đang ngồi đúng ghế đó)
      const now = room.get(pid);
      if (c.seat >= 0 && (!now || now === c || now.seat !== c.seat)) standUp(c, false);
      if (now === c) { room.delete(pid); broadcast(khu, { t: "leave", id: pid }); }
    });
  }

  function khuList() { return [...rooms.entries()].map(([k, r]) => ({ khu: k, online: r.size, capacity: config.khuCapacity })); }
  function feed(text) { for (const k of rooms.keys()) broadcast(k, { t: "feed", text }); }
  function rename(pid, nick) { for (const [k, r] of rooms) { const c = r.get(pid); if (c) { c.nick = nick; broadcast(k, { t: "rename", id: pid, nick }); } } }
  function ban(pid, banned) { for (const r of rooms.values()) { const c = r.get(pid); if (c) c.banned = banned; } }
  function hide(chatId) { const row = getChat.get(chatId); if (row) broadcast(row.khu, { t: "hide", id: chatId }); }

  return { onConnection, khuList, feed, rename, ban, hide };
}
