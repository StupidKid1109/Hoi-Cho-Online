// Lưu trữ bằng SQLite có sẵn trong Node 22 (node:sqlite), không cần cài thêm.
// Khi số người chơi lớn có thể chuyển sang PostgreSQL/MySQL, các câu lệnh SQL giữ gần như nguyên.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function openDb(file) {
  if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY, nick TEXT NOT NULL, created INTEGER NOT NULL,
      banned INTEGER NOT NULL DEFAULT 0, reroll_day TEXT, rerolls INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, player TEXT NOT NULL, game TEXT NOT NULL, event TEXT,
      started INTEGER NOT NULL, state TEXT NOT NULL, finished INTEGER, score INTEGER
    );
    CREATE INDEX IF NOT EXISTS runs_player ON runs(player, started);
    CREATE TABLE IF NOT EXISTS bests (
      event TEXT NOT NULL, player TEXT NOT NULL, game TEXT NOT NULL, score INTEGER NOT NULL, at INTEGER NOT NULL,
      PRIMARY KEY (event, player, game)
    );
    CREATE TABLE IF NOT EXISTS chat (
      id INTEGER PRIMARY KEY AUTOINCREMENT, khu INTEGER NOT NULL, player TEXT NOT NULL, nick TEXT NOT NULL,
      text TEXT NOT NULL, ts INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL, reporter TEXT NOT NULL, ts INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open', UNIQUE (chat_id, reporter)
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    -- Gian 1 "Ai là Hacker?": từng ván (để tính điểm, cán bộ xem lại khi có khiếu nại) và điểm tích lũy theo ngày trong đợt
    CREATE TABLE IF NOT EXISTS hacker_games (
      id TEXT PRIMARY KEY, mode TEXT NOT NULL, civ TEXT NOT NULL, hacker TEXT NOT NULL, players TEXT NOT NULL, rounds TEXT NOT NULL,
      result TEXT NOT NULL, started INTEGER NOT NULL, ended INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS g1_points (
      event TEXT NOT NULL, player TEXT NOT NULL, day TEXT NOT NULL, points INTEGER NOT NULL, raw INTEGER NOT NULL DEFAULT 0, games INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (event, player, day)
    );
  `);
  // Thêm cột cho bản cũ: giới tính nhân vật, tên xin đặt (chờ quản trị viên duyệt)
  const cols = new Set(db.prepare("PRAGMA table_info(players)").all().map(c => c.name));
  for (const [c, t] of [["gender", "TEXT"], ["look", "TEXT"], ["name_req", "TEXT"], ["name_state", "TEXT"], ["name_note", "TEXT"], ["name_at", "INTEGER"], ["name_tries", "INTEGER NOT NULL DEFAULT 0"], ["name_day", "TEXT"]])
    if (!cols.has(c)) db.exec("ALTER TABLE players ADD COLUMN " + c + " " + t);
  db.exec("CREATE INDEX IF NOT EXISTS players_name_state ON players(name_state, name_at)");
  return db;
}
