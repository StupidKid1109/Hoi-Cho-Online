// Thử tải: N người chơi ảo cùng vào MỘT khu, đi lại liên tục, thỉnh thoảng chat, ngồi ghế.
// Tự khởi động một máy chủ riêng (cổng và cơ sở dữ liệu tạm), đo:
//   - CPU và bộ nhớ của máy chủ
//   - số tin nhắn và dung lượng mỗi người nhận được mỗi giây
//   - độ trễ từ lúc một người bước đi tới lúc người khác thấy
//
// Chạy:  cd server && npm run loadtest            (mặc định 100 người, 30 giây)
//        node tools/loadtest.mjs 150 60           (150 người, 60 giây)
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEATS, CENTER } from "../../shared/world.js";

const N = Number(process.argv[2]) || 100, SECONDS = Number(process.argv[3]) || 30, PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = "http://127.0.0.1:" + PORT, SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const tmp = mkdtempSync(join(tmpdir(), "hoicho-load-"));
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---- khởi động máy chủ ----
const srv = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/index.js"], {
  cwd: SERVER_DIR, stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", DB_FILE: join(tmp, "load.db"), DEV_LOGIN: "1", ADMIN_KEY: "", SESSION_SECRET: "load-test", KHU_CAPACITY: String(Math.max(N, 100)), TRUST_PROXY: "1", SERVE_CLIENT: "0", MATCH_SPEED: "0.1" }
});
let srvLog = ""; srv.stdout.on("data", d => { srvLog += d; }); srv.stderr.on("data", d => { srvLog += d; });
for (let i = 0; i < 100 && !srvLog.includes("đang chạy"); i++) await wait(100);

// CPU của tiến trình máy chủ (đọc /proc trên Linux; máy khác thì bỏ qua)
const ticksPerSec = 100;
function cpuTicks() { try { const f = readFileSync("/proc/" + srv.pid + "/stat", "utf8").split(") ")[1].split(" "); return Number(f[11]) + Number(f[12]); } catch (e) { return null; } }
function rssMB() { try { return Number(readFileSync("/proc/" + srv.pid + "/status", "utf8").match(/VmRSS:\s+(\d+)/)[1]) / 1024; } catch (e) { return null; } }

// ---- người chơi ảo ----
const sentAt = new Map(); // "n:x:y" -> thời điểm gửi, để đo độ trễ (n: số thứ tự người chơi trong khu)
const lat = [];
let joined = 0, fullErr = 0, msgs = 0, bytes = 0, chats = 0, sits = 0, sitno = 0;

async function bot(i) {
  // mỗi người một địa chỉ IP giả (máy chủ đặt TRUST_PROXY=1 như khi chạy sau Caddy)
  const r = await fetch(BASE + "/api/auth", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": "10.0." + (i >> 8) + "." + (i & 255) }, body: JSON.stringify({ devId: "load-" + i }) });
  const { token } = await r.json();
  if (!token) throw new Error("Đăng nhập thất bại: HTTP " + r.status);
  const ws = new WebSocket(BASE.replace("http", "ws") + "/ws?khu=1&token=" + encodeURIComponent(token));
  const me = { i, token, id: null, x: CENTER.x + (Math.random() - 0.5) * 3000, y: CENTER.y + (Math.random() - 0.5) * 3000, a: Math.random() * 6.28, ws, seat: -1 };
  ws.onmessage = e => {
    msgs++; bytes += e.data.length;
    const m = JSON.parse(e.data);
    if (m.t === "welcome") { me.id = m.you.id; me.n = m.you.n; joined++; }
    else if (m.t === "full") fullErr++;
    else if (m.t === "sitno") sitno++;
    if (i === 0) { // người số 0 đo độ trễ
      const list = m.t === "poses" ? m.p.map(([id, x, y]) => ({ id, x, y })) : [];
      for (const p of list) { const k = p.id + ":" + p.x + ":" + p.y, t = sentAt.get(k); if (t) { lat.push(performance.now() - t); sentAt.delete(k); } }
    }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  return me;
}

console.log(`Thử tải: ${N} người chơi trong 1 khu, ${SECONDS} giây...`);
const bots = [];
for (let i = 0; i < N; i += 20) bots.push(...await Promise.all(Array.from({ length: Math.min(20, N - i) }, (_, k) => bot(i + k))));
await wait(500);

const t0 = performance.now(), c0 = cpuTicks(); msgs = 0; bytes = 0;
// đi lại: mỗi người gửi vị trí 8 lần/giây (như trình duyệt), thỉnh thoảng chat, ngồi ghế
const timers = bots.map(b => setInterval(() => {
  if (b.ws.readyState !== 1) return;
  if (b.seat >= 0) { if (Math.random() < 0.01) { b.seat = -1; b.ws.send(JSON.stringify({ t: "sit", s: -1 })); } return; }
  b.a += (Math.random() - 0.5) * 0.6; b.x += Math.cos(b.a) * 60; b.y += Math.sin(b.a) * 60;
  if (Math.hypot(b.x - CENTER.x, b.y - CENTER.y) > 2600) b.a += Math.PI;
  const x = Math.round(b.x), y = Math.round(b.y);
  sentAt.set(b.n + ":" + x + ":" + y, performance.now());
  b.ws.send(JSON.stringify({ t: "pos", x, y }));
  if (Math.random() < 0.004) { chats++; b.ws.send(JSON.stringify({ t: "chat", text: "Xin chào mọi người " + b.i })); }
  if (Math.random() < 0.003) { const s = Math.floor(Math.random() * SEATS.length); b.seat = s; sits++; b.ws.send(JSON.stringify({ t: "sit", s })); }
}, 125));
await wait(SECONDS * 1000);
timers.forEach(clearInterval);
const dt = (performance.now() - t0) / 1000, c1 = cpuTicks();

lat.sort((a, b) => a - b);
const pct = q => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * q))].toFixed(0) + " ms" : "–";
console.log("Vào được khu:        " + joined + "/" + N + (fullErr ? "  (bị báo đầy: " + fullErr + ")" : ""));
if (c0 !== null) console.log("CPU máy chủ:         " + ((c1 - c0) / ticksPerSec / dt * 100).toFixed(0) + "% của 1 nhân");
const mem = rssMB(); if (mem) console.log("Bộ nhớ máy chủ:      " + mem.toFixed(0) + " MB");
console.log("Tin nhận/người/giây: " + (msgs / N / dt).toFixed(1));
console.log("Dữ liệu/người/giây:  " + (bytes / N / dt / 1024).toFixed(1) + " KB");
console.log("Độ trễ thấy nhau:    trung vị " + pct(0.5) + ", 95% dưới " + pct(0.95) + "  (" + lat.length + " mẫu)");
console.log("Chat đã gửi: " + chats + " | lượt ngồi: " + sits + " | ghế đã có người: " + sitno);

// ---- Đấu phòng: cả N người vào Gian 1 (phòng tối đa 50 người), trả lời ngẫu nhiên; ván chạy nhanh gấp 10 lần ----
let ends = 0, rounds = 0, starts = 0; const roomSizes = [];
for (const b of bots) b.ws.addEventListener("message", e => {
  const m = JSON.parse(e.data);
  if (m.t === "mstart") { starts++; if (b.i % 50 === 0) roomSizes.push(m.n); }
  else if (m.t === "mround") { rounds++; setTimeout(() => b.ws.readyState === 1 && b.ws.send(JSON.stringify({ t: "mans", k: m.k, a: Math.random() < 0.5 })), Math.random() * m.dur * 0.8); }
  else if (m.t === "mend") ends++;
});
const m0 = performance.now(), mc0 = cpuTicks();
for (const b of bots) b.ws.send(JSON.stringify({ t: "mjoin", g: "g1" }));
while (ends < N && performance.now() - m0 < 120000) await wait(200);
const mdt = (performance.now() - m0) / 1000, mc1 = cpuTicks();
console.log("\nĐấu phòng Gian 1:     " + starts + " người vào " + Math.ceil(starts / 50) + " phòng (cỡ phòng: " + [...new Set(roomSizes)].join(", ") + " người), " + ends + "/" + N + " người nhận kết quả");
console.log("                      " + rounds + " lượt câu hỏi gửi đi trong " + mdt.toFixed(1) + " giây" + (mc0 !== null ? " | CPU máy chủ " + ((mc1 - mc0) / ticksPerSec / mdt * 100).toFixed(0) + "%" : ""));

// ---- Cả N người cùng gọi API: chơi một đoạn Gian 3 rồi mở Bảng vàng ----
const reqLat = []; let httpErr = 0;
async function call(b, path, body) {
  const t = performance.now();
  const r = await fetch(BASE + path, { method: body ? "POST" : "GET", headers: { "content-type": "application/json", authorization: "Bearer " + b.token }, body: body ? JSON.stringify(body) : undefined });
  reqLat.push(performance.now() - t);
  if (!r.ok) httpErr++;
  return r.json();
}
const runs = await Promise.all(bots.map(b => call(b, "/api/runs", { game: "g3" })));
await wait(700);
const h0 = performance.now(), hc0 = cpuTicks();
await Promise.all(bots.map(async (b, i) => {
  await call(b, "/api/me");
  await call(b, "/api/runs/" + runs[i].runId + "/finish", { inputs: [[5, 2], [20, -1]], frames: 36 });
  await call(b, "/api/leaderboard?tab=all");
  await call(b, "/api/khu");
}));
const hdt = (performance.now() - h0) / 1000, hc1 = cpuTicks();
reqLat.sort((a, b) => a - b);
const rq = q => reqLat[Math.min(reqLat.length - 1, Math.floor(reqLat.length * q))].toFixed(0) + " ms";
console.log("\nCùng gọi API:         " + reqLat.length + " yêu cầu, lỗi: " + httpErr + " | " + (reqLat.length / Math.max(hdt, 0.001)).toFixed(0) + " yêu cầu/giây");
console.log("Thời gian phản hồi:  trung vị " + rq(0.5) + ", 95% dưới " + rq(0.95) + (hc0 !== null ? " | CPU máy chủ lúc đó " + ((hc1 - hc0) / ticksPerSec / Math.max(hdt, 0.001) * 100).toFixed(0) + "%" : ""));

bots.forEach(b => b.ws.close());
await wait(300);
srv.kill(); rmSync(tmp, { recursive: true, force: true });
process.exit(0);
