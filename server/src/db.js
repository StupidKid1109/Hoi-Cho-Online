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
  `);
  return db;
}
