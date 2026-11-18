// Máy chủ HTTP: API cho Mini App, trang quản trị, phục vụ file giao diện khi chạy thử.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync, createReadStream } from "node:fs";
import { join, normalize as pnorm, extname, sep } from "node:path";
import { openDb } from "./db.js";
import { makeAuth } from "./auth.js";
import { makeStore, GAMES } from "./store.js";
import { makeRealtime } from "./realtime.js";
import { attachWebSocket } from "./ws.js";
import { swipe, rebus, runner, GameError } from "./games.js";
import { ROOT_DIR, SERVER_DIR } from "./config.js";

const RUN_TTL = 15 * 60 * 1000, RUNS_PER_DAY = 300;
const GAME_NAMES = { g1: "Gian 1", g2: "Gian 2", g3: "Gian 3" };
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon" };

function loadContent() {
  const read = f => JSON.parse(readFileSync(join(SERVER_DIR, "content", f), "utf8"));
  return { cards: read("cards.json"), rebus: read("rebus.json"), event: read("event.json") };
}

export function createApp(config) {
  const db = openDb(config.dbFile);
  let content = loadContent();
  const auth = makeAuth(config);
  const store = makeStore(db, (({ _ghi_chu, ...e }) => e)(content.event));
  const rt = makeRealtime({ db, store, auth, config });
  const authHits = new Map();

  const send = (res, status, data, headers = {}) => {
    const body = typeof data === "string" ? data : JSON.stringify(data);
    res.writeHead(status, { "content-type": typeof data === "string" && headers["content-type"] ? headers["content-type"] : "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
    res.end(body);
  };
  const readBody = req => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > 256 * 1024) { reject(new GameError("Dữ liệu quá lớn", 413)); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { if (!chunks.length) return resolve({}); try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (e) { reject(new GameError("JSON không hợp lệ")); } });
    req.on("error", reject);
  });
  const playerOf = req => { const h = req.headers.authorization || ""; return auth.verify(h.startsWith("Bearer ") ? h.slice(7) : ""); };
  const isAdmin = req => config.adminKey && req.headers["x-admin-key"] === config.adminKey;
  const publicEvent = () => { const e = store.event(); return { id: e.id, name: e.name, start: e.start, end: e.end, prizes: e.prizes, rules: e.rules, active: store.eventActive(), now: Date.now() }; };

  function finishResponse(run, game, res) {
    store.finishRun(run, res.score);
    const rec = store.recordBest(run, res.score), player = store.ensurePlayer(run.player);
    const b = store.bests(run.player), total = b.g1 + b.g2 + b.g3, lb = store.leaderboard("all", run.player, 0);
    if (rec.newBest && res.score > 0) rt.feed("🎉 " + player.nick + " vừa đạt " + res.score.toLocaleString("vi-VN") + " điểm ở " + GAME_NAMES[game]);
    return { ...res, counted: rec.counted, best: rec.counted ? rec.best : null, newBest: rec.newBest, bests: b, total, rank: lb.me ? lb.me.rank : null };
  }

  async function api(req, res, url) {
    const path = url.pathname, method = req.method;
    if (path === "/api/health") return send(res, 200, { ok: true, time: Date.now() });

    if (path === "/api/auth" && method === "POST") {
      const ip = req.socket.remoteAddress, now = Date.now(), hits = (authHits.get(ip) || []).filter(t => now - t < 60000);
      if (hits.length >= 20) return send(res, 429, { error: "Thử lại sau ít phút" });
      hits.push(now); authHits.set(ip, hits);
      const id = await auth.identify(await readBody(req));
      if (!id) return send(res, 401, { error: "Không xác thực được tài khoản Zalo" });
      const p = store.ensurePlayer(id);
      return send(res, 200, { token: auth.issue(id), player: { nick: p.nick } });
    }

    if (path === "/api/event" && method === "GET") return send(res, 200, publicEvent());
    if (path === "/api/khu" && method === "GET") return send(res, 200, { khu: rt.khuList() });

    // Các API dưới đây cần đăng nhập
    if (path.startsWith("/api/") && !path.startsWith("/api/admin/")) {
      const pid = playerOf(req);
      if (!pid) return send(res, 401, { error: "Phiên đăng nhập đã hết hạn" });
      const player = store.ensurePlayer(pid);

      if (path === "/api/me" && method === "GET") {
        const b = store.bests(pid), lb = store.leaderboard("all", pid, 0);
        return send(res, 200, { nick: player.nick, banned: !!player.banned, bests: b, total: b.g1 + b.g2 + b.g3, rank: lb.me ? lb.me.rank : null, event: publicEvent() });
      }
      if (path === "/api/me/nickname" && method === "POST") {
        const nick = store.rerollNick(pid); if (!nick) return send(res, 429, { error: "Hôm nay bạn đã đổi biệt danh nhiều lần" });
        rt.rename(pid, nick); return send(res, 200, { nick });
      }
      if (path === "/api/leaderboard" && method === "GET") {
        const tab = url.searchParams.get("tab") || "all";
        const { ranked, ...lb } = store.leaderboard(GAMES.includes(tab) ? tab : "all", pid, 50);
        return send(res, 200, { ...lb, event: publicEvent() });
      }
      if (path === "/api/runs" && method === "POST") {
        const { game } = await readBody(req);
        if (!GAMES.includes(game)) return send(res, 400, { error: "Gian không tồn tại" });
        if (store.runsSince(pid, Date.now() - 864e5) >= RUNS_PER_DAY) return send(res, 429, { error: "Bạn đã chơi rất nhiều hôm nay, nghỉ ngơi rồi quay lại nhé!" });
        const started = game === "g1" ? swipe.start(content.cards) : game === "g2" ? rebus.start(content.rebus) : runner.start();
        const id = store.createRun(pid, game, started.state);
        return send(res, 200, { runId: id, game, counted: store.eventActive(), ...started.view });
      }
      const m = path.match(/^\/api\/runs\/([0-9a-f-]{36})\/(answer|finish|guess|hint|skip|next)$/);
      if (m && method === "POST") {
        const run = store.loadRun(m[1]), now = Date.now();
        if (!run || run.player !== pid) return send(res, 404, { error: "Không tìm thấy lượt chơi" });
        if (run.finished) return send(res, 409, { error: "Lượt chơi đã kết thúc" });
        if (now - run.started > RUN_TTL) return send(res, 410, { error: "Lượt chơi đã quá hạn" });
        const body = await readBody(req), action = m[2];
        if (run.game === "g1") {
          if (action === "answer") { const r = swipe.answer(run, body, content.cards, now); store.saveRun(run); return send(res, 200, r); }
          if (action === "finish") return send(res, 200, finishResponse(run, "g1", swipe.result(run, content.cards)));
        } else if (run.game === "g2") {
          if (action === "finish") return send(res, 200, finishResponse(run, "g2", rebus.result(run, content.rebus)));
          const r = rebus.act(run, action, body, content.rebus, now); store.saveRun(run); return send(res, 200, r);
        } else if (run.game === "g3" && action === "finish") {
          runner.finish(run, body, now);
          return send(res, 200, finishResponse(run, "g3", runner.result(run)));
        }
        return send(res, 400, { error: "Thao tác không hợp lệ" });
      }
      return send(res, 404, { error: "Không tìm thấy" });
    }

    // Quản trị
    if (path.startsWith("/api/admin/")) {
      if (!isAdmin(req)) return send(res, 403, { error: "Sai mã quản trị hoặc chưa đặt ADMIN_KEY" });
      if (path === "/api/admin/summary") {
        const n = sql => db.prepare(sql).get().n;
        return send(res, 200, { event: store.event(), active: store.eventActive(), players: n("SELECT COUNT(*) n FROM players"), runs: n("SELECT COUNT(*) n FROM runs"),
          runsToday: db.prepare("SELECT COUNT(*) n FROM runs WHERE started > ?").get(Date.now() - 864e5).n, openReports: n("SELECT COUNT(*) n FROM reports WHERE status = 'open'"), khu: rt.khuList() });
      }
      if (path === "/api/admin/event" && method === "PUT") {
        const e = await readBody(req);
        if (!e.id || !e.name || isNaN(Date.parse(e.start)) || isNaN(Date.parse(e.end)) || !Array.isArray(e.prizes)) return send(res, 400, { error: "Thiếu id, tên, thời gian hoặc giải thưởng" });
        store.setEvent({ id: String(e.id), name: String(e.name), start: e.start, end: e.end, prizes: e.prizes, rules: String(e.rules || "") });
        return send(res, 200, { ok: true, event: store.event() });
      }
      if (path === "/api/admin/reports") {
        return send(res, 200, { reports: db.prepare(`SELECT c.id, c.khu, c.player, c.nick, c.text, c.ts, c.hidden, COUNT(r.id) AS reports, MAX(r.ts) AS last
          FROM reports r JOIN chat c ON c.id = r.chat_id WHERE r.status = 'open' GROUP BY c.id ORDER BY last DESC LIMIT 200`).all() });
      }
      const rm = path.match(/^\/api\/admin\/reports\/(\d+)$/);
      if (rm && method === "POST") {
        const { action } = await readBody(req), chatId = Number(rm[1]);
        const row = db.prepare("SELECT player FROM chat WHERE id = ?").get(chatId); if (!row) return send(res, 404, { error: "Không có tin nhắn" });
        if (action === "hide" || action === "ban") { db.prepare("UPDATE chat SET hidden = 1 WHERE id = ?").run(chatId); rt.hide(chatId); }
        if (action === "ban") { store.setBan(row.player, true); rt.ban(row.player, true); }
        db.prepare("UPDATE reports SET status = ? WHERE chat_id = ?").run(action === "dismiss" ? "dismissed" : "resolved", chatId);
        return send(res, 200, { ok: true });
      }
      if (path === "/api/admin/winners.csv") {
        const top = Math.min(500, Number(url.searchParams.get("top")) || 20), lb = store.leaderboard("all", null, top);
        const b = id => store.bests(id);
        const lines = ["hang,biet_danh,ma_nguoi_choi,diem_tong,gian_1,gian_2,gian_3"].concat(lb.ranked.slice(0, top).map(r => { const s = b(r.id); return [r.rank, '"' + r.nick + '"', r.id, r.score, s.g1, s.g2, s.g3].join(","); }));
        return send(res, 200, "﻿" + lines.join("\n"), { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="bang-vang.csv"' });
      }
      if (path === "/api/admin/reload-content" && method === "POST") { content = loadContent(); return send(res, 200, { ok: true }); }
      return send(res, 404, { error: "Không tìm thấy" });
    }
    return send(res, 404, { error: "Không tìm thấy" });
  }

  function serveStatic(req, res, url) {
    let p = decodeURIComponent(url.pathname), base;
    if (p === "/admin" || p === "/admin/") { base = join(ROOT_DIR, "admin"); p = "/index.html"; }
    else if (p.startsWith("/shared/")) { base = join(ROOT_DIR, "shared"); p = p.slice(7); }
    else { base = join(ROOT_DIR, "client"); if (p === "/") p = "/index.html"; }
    const file = pnorm(join(base, p));
    if (!file.startsWith(base + sep) || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, { error: "Không tìm thấy" });
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream", "cache-control": "no-cache" });
    createReadStream(file).pipe(res);
  }

  const server = createServer(async (req, res) => {
    res.setHeader("access-control-allow-origin", config.corsOrigin);
    res.setHeader("access-control-allow-headers", "authorization, content-type, x-admin-key");
    res.setHeader("access-control-allow-methods", "GET, POST, PUT, OPTIONS");
    res.setHeader("x-content-type-options", "nosniff");
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
    const url = new URL(req.url, "http://localhost");
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, res, url);
      if (config.serveClient && (req.method === "GET" || req.method === "HEAD")) return serveStatic(req, res, url);
      send(res, 404, { error: "Không tìm thấy" });
    } catch (e) {
      if (e instanceof GameError) return send(res, e.status, { error: e.message });
      console.error(e); send(res, 500, { error: "Lỗi máy chủ" });
    }
  });
  const ws = attachWebSocket(server, "/ws", rt.onConnection);
  return { server, db, store, auth, rt, close: () => new Promise(r => { ws.stop(); server.close(() => { db.close(); r(); }); }) };
}
