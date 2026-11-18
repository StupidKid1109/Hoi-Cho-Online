// Các khu hội chợ thời gian thực: vị trí người chơi, cử chỉ, chat có kiểm duyệt.
import { blockReason, cleanText, normalize, CHAT_GAP_MS } from "../../shared/chatFilter.js";

const EMOTES = 4, HIDE_AFTER_REPORTS = 3;

export function makeRealtime({ db, store, auth, config }) {
  const rooms = new Map(); // khu -> Map(playerId -> client)
  for (let k = 1; k <= config.khuCount; k++) rooms.set(k, new Map());
  const insChat = db.prepare("INSERT INTO chat (khu, player, nick, text, ts) VALUES (?, ?, ?, ?, ?)");
  const recent = db.prepare("SELECT id, player, nick, text, ts FROM chat WHERE khu = ? AND hidden = 0 ORDER BY id DESC LIMIT 20");
  const getChat = db.prepare("SELECT id, khu, player FROM chat WHERE id = ?");
  const addReport = db.prepare("INSERT OR IGNORE INTO reports (chat_id, reporter, ts) VALUES (?, ?, ?)");
  const countReports = db.prepare("SELECT COUNT(*) AS n FROM reports WHERE chat_id = ?");
  const hideChat = db.prepare("UPDATE chat SET hidden = 1 WHERE id = ?");

  const broadcast = (khu, msg, except) => { const s = JSON.stringify(msg); for (const c of rooms.get(khu).values()) if (c !== except) c.conn.send(s); };
  const pub = c => ({ id: c.pid, nick: c.nick, x: Math.round(c.x), y: Math.round(c.y) });

  function onConnection(conn, url) {
    const pid = auth.verify(url.searchParams.get("token"));
    const khu = Number(url.searchParams.get("khu"));
    if (!pid || !rooms.has(khu)) { conn.sendJSON({ t: "error", text: "Phiên đăng nhập hoặc khu không hợp lệ" }); return conn.close(4001); }
    const room = rooms.get(khu);
    if (room.size >= config.khuCapacity && !room.has(pid)) { conn.sendJSON({ t: "full", text: "Khu đã đầy, hãy chọn khu khác" }); return conn.close(4002); }
    const player = store.ensurePlayer(pid);
    const old = room.get(pid); if (old) old.conn.close(4003); // mở ở máy khác: đóng kết nối cũ
    const c = { conn, pid, khu, nick: player.nick, banned: !!player.banned, x: 700, y: 1265, lastPos: 0, lastChat: 0, lastEmote: 0, posN: 0 };
    room.set(pid, c);
    conn.sendJSON({ t: "welcome", you: pub(c), peers: [...room.values()].filter(x => x !== c).map(pub),
      history: recent.all(khu).reverse().map(m => ({ id: m.id, pid: m.player, nick: m.nick, text: m.text, ts: m.ts })) });
    broadcast(khu, { t: "join", peer: pub(c) }, c);

    conn.on("message", raw => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      const now = Date.now();
      if (m.t === "pos") {
        if (now - c.lastPos < 90) return; // tối đa khoảng 10 lần/giây
        const x = Number(m.x), y = Number(m.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        c.x = Math.max(0, Math.min(1400, x)); c.y = Math.max(0, Math.min(1400, y)); c.lastPos = now;
        broadcast(khu, { t: "pos", id: pid, x: Math.round(c.x), y: Math.round(c.y) }, c);
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
    conn.on("close", () => { if (room.get(pid) === c) { room.delete(pid); broadcast(khu, { t: "leave", id: pid }); } });
  }

  function khuList() { return [...rooms.entries()].map(([k, r]) => ({ khu: k, online: r.size, capacity: config.khuCapacity })); }
  function feed(text) { for (const k of rooms.keys()) broadcast(k, { t: "feed", text }); }
  function rename(pid, nick) { for (const [k, r] of rooms) { const c = r.get(pid); if (c) { c.nick = nick; broadcast(k, { t: "rename", id: pid, nick }); } } }
  function ban(pid, banned) { for (const r of rooms.values()) { const c = r.get(pid); if (c) c.banned = banned; } }
  function hide(chatId) { const row = getChat.get(chatId); if (row) broadcast(row.khu, { t: "hide", id: chatId }); }

  return { onConnection, khuList, feed, rename, ban, hide };
}
