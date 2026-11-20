// Người chơi, đợt treo thưởng, điểm cao nhất và Bảng vàng.
import { randomInt, randomUUID } from "node:crypto";

const NICK_A = ["Hoa Sữa", "Sen Hồng", "Bằng Lăng", "Phượng Đỏ", "Mai Vàng", "Lúa Non", "Sao Mai", "Gió Nam", "Trăng Rằm", "Cánh Diều", "Hoa Gạo", "Mây Trắng", "Cỏ May", "Hải Âu", "Sông Xanh", "Nắng Mai"];
export const GAMES = ["g1", "g2", "g3"];
const today = () => new Date(Date.now() + 7 * 36e5).toISOString().slice(0, 10);

export function makeStore(db, defaultEvent) {
  const q = sql => db.prepare(sql);
  const st = {
    getPlayer: q("SELECT id, nick, banned FROM players WHERE id = ?"),
    addPlayer: q("INSERT INTO players (id, nick, created) VALUES (?, ?, ?)"),
    setNick: q("UPDATE players SET nick = ?, reroll_day = ?, rerolls = ? WHERE id = ?"),
    getReroll: q("SELECT reroll_day, rerolls FROM players WHERE id = ?"),
    setBan: q("UPDATE players SET banned = ? WHERE id = ?"),
    getSetting: q("SELECT value FROM settings WHERE key = ?"),
    putSetting: q("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"),
    addRun: q("INSERT INTO runs (id, player, game, event, started, state) VALUES (?, ?, ?, ?, ?, ?)"),
    getRun: q("SELECT * FROM runs WHERE id = ?"),
    saveRun: q("UPDATE runs SET state = ? WHERE id = ?"),
    endRun: q("UPDATE runs SET state = ?, finished = ?, score = ? WHERE id = ?"),
    runsToday: q("SELECT COUNT(*) AS n FROM runs WHERE player = ? AND started > ?"),
    getBest: q("SELECT score FROM bests WHERE event = ? AND player = ? AND game = ?"),
    putBest: q("INSERT INTO bests (event, player, game, score, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(event, player, game) DO UPDATE SET score = excluded.score, at = excluded.at WHERE excluded.score > bests.score"),
    myBests: q("SELECT game, score FROM bests WHERE event = ? AND player = ?"),
    setBest: q("INSERT INTO bests (event, player, game, score, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(event, player, game) DO UPDATE SET score = excluded.score, at = excluded.at"),
    g1Day: q("SELECT points FROM g1_points WHERE event = ? AND player = ? AND day = ?"),
    g1Add: q("INSERT INTO g1_points (event, player, day, points, raw, games) VALUES (?, ?, ?, ?, ?, 1) ON CONFLICT(event, player, day) DO UPDATE SET points = points + excluded.points, raw = raw + excluded.raw, games = games + 1"),
    g1Total: q("SELECT COALESCE(SUM(points), 0) AS s FROM g1_points WHERE event = ? AND player = ?")
  };

  function event() {
    const row = st.getSetting.get("event");
    return row ? JSON.parse(row.value) : defaultEvent;
  }
  function setEvent(ev) { st.putSetting.run("event", JSON.stringify(ev)); }
  function eventActive(now = Date.now()) { const e = event(); return now >= Date.parse(e.start) && now <= Date.parse(e.end); }

  function newNick() { return NICK_A[randomInt(NICK_A.length)] + " " + String(randomInt(100, 1000)); }
  function ensurePlayer(id) {
    let p = st.getPlayer.get(id);
    if (!p) { st.addPlayer.run(id, newNick(), Date.now()); p = st.getPlayer.get(id); }
    return p;
  }
  function rerollNick(id) {
    const r = st.getReroll.get(id), d = today(), n = r && r.reroll_day === d ? r.rerolls : 0;
    if (n >= 10) return null;
    const nick = newNick(); st.setNick.run(nick, d, n + 1, id); return nick;
  }

  function createRun(player, game, state) {
    const id = randomUUID(), ev = eventActive() ? event().id : null;
    st.addRun.run(id, player, game, ev, Date.now(), JSON.stringify(state));
    return id;
  }
  function loadRun(id) { const r = st.getRun.get(id); if (!r) return null; r.state = JSON.parse(r.state); return r; }
  function saveRun(run) { st.saveRun.run(JSON.stringify(run.state), run.id); }
  function finishRun(run, score) { st.endRun.run(JSON.stringify(run.state), Date.now(), score, run.id); }
  function runsSince(player, ms) { return st.runsToday.get(player, ms).n; }

  /** Ghi điểm nếu lượt chơi thuộc đợt đang diễn ra. Trả về { counted, best, newBest }. */
  function recordBest(run, score) {
    if (!run.event || run.event !== event().id) return { counted: false, best: null, newBest: false };
    const prev = st.getBest.get(run.event, run.player, run.game);
    st.putBest.run(run.event, run.player, run.game, score, Date.now());
    const best = Math.max(score, prev ? prev.score : 0);
    return { counted: true, best, newBest: !prev || score > prev.score };
  }
  /**
   * Gian 1 "Ai là Hacker?": điểm cộng dồn trong đợt. Tối đa g1DayCap điểm mỗi ngày (mặc định 1.000);
   * Bảng vàng chung chỉ tính tối đa g1EventCap điểm cả đợt (mặc định 3.000), tab "Gian 1" hiện tổng thật.
   * counted = false (phòng bạn bè, ngoài đợt, rời ván): vẫn báo điểm ván nhưng không cộng.
   */
  const caps = () => { const e = event(); return { day: Number(e.g1DayCap ?? 1000), event: Number(e.g1EventCap ?? 3000) }; };
  function addG1(player, points, counted) {
    const ev = event(), active = eventActive(), cap = caps();
    if (!counted || !active || points <= 0) {
      const t = active ? st.g1Total.get(ev.id, player).s : 0;
      return { counted: false, added: 0, points, today: active ? ((st.g1Day.get(ev.id, player, today()) || {}).points || 0) : 0, total: t, board: Math.min(cap.event, t), caps: cap };
    }
    const d = today(), had = (st.g1Day.get(ev.id, player, d) || {}).points || 0, added = Math.max(0, Math.min(points, cap.day - had));
    st.g1Add.run(ev.id, player, d, added, points);
    const total = st.g1Total.get(ev.id, player).s, board = Math.min(cap.event, total);
    st.setBest.run(ev.id, player, "g1", board, Date.now());
    return { counted: true, added, points, today: had + added, dayFull: had + added >= cap.day, total, board, eventFull: total >= cap.event, caps: cap };
  }
  function bests(player) {
    const out = { g1: 0, g2: 0, g3: 0 };
    for (const r of st.myBests.all(event().id, player)) out[r.game] = r.score;
    return out;
  }

  function leaderboard(tab, player, limit = 50) {
    const ev = event().id, byGame = GAMES.includes(tab);
    const rows = tab === "g1" ? db.prepare(` -- tab Gian 1: tổng tích lũy thật (không giới hạn cả đợt)
      SELECT g.player AS id, p.nick AS nick, SUM(g.points) AS score, 0 AS last
      FROM g1_points g JOIN players p ON p.id = g.player
      WHERE g.event = ? AND p.banned = 0 GROUP BY g.player HAVING score > 0 ORDER BY score DESC`).all(ev) : db.prepare(`
      SELECT b.player AS id, p.nick AS nick, SUM(b.score) AS score, MAX(b.at) AS last
      FROM bests b JOIN players p ON p.id = b.player
      WHERE b.event = ? AND p.banned = 0 ${byGame ? "AND b.game = ?" : ""}
      GROUP BY b.player ORDER BY score DESC, last ASC`).all(...(byGame ? [ev, tab] : [ev]));
    const ranked = rows.map((r, i) => ({ rank: i + 1, id: r.id, nick: r.nick, score: r.score }));
    const me = ranked.find(r => r.id === player) || null;
    return { tab, rows: ranked.slice(0, limit).map(r => ({ rank: r.rank, nick: r.nick, score: r.score, me: r.id === player })), me: me ? { rank: me.rank, score: me.score } : null, players: ranked.length, ranked };
  }

  return { st, event, setEvent, eventActive, ensurePlayer, rerollNick, createRun, loadRun, saveRun, finishRun, runsSince, recordBest, bests, leaderboard, addG1, caps, setBan: (id, b) => st.setBan.run(b ? 1 : 0, id) };
}
