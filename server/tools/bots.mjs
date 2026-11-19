// Người chơi ảo để thử trò chơi khi đông người.
// Cần máy chủ đang chạy ở chế độ thử (DEV_LOGIN=1, ví dụ bấm đúp chay-thu.cmd).
//
//   node tools/bots.mjs [số người] [khu] [địa chỉ máy chủ]
//   node tools/bots.mjs 60 1 http://localhost:8787     (mặc định)
//
// Người ảo đi dạo quanh sân, ghé gian hàng, tìm ghế trống ngồi rồi đứng dậy, thỉnh thoảng chào và chat.
// Nhấn Ctrl+C (hoặc đóng cửa sổ) để cho tất cả rời khu.
import { CENTER, PLAZA_R, FAIR_R, SEATS, SPOTS, BLOCK, standPoint } from "../../shared/world.js";

const N = Number(process.argv[2]) || 60, KHU = Number(process.argv[3]) || 1;
const BASE = (process.argv[4] || "http://localhost:8787").replace(/\/$/, "");
const SPEED = 450, STEP_MS = 125; // giống người thật: khoảng 8 lần gửi vị trí mỗi giây
const LINES = ["Chào cả nhà 👋", "Gian nào dễ nhất vậy mọi người?", "Mình vừa chơi Gian 3, vui ghê", "Có ai ngồi uống trà không?", "Hội chợ đẹp quá!",
  "Cố lên mọi người!", "Mình đang ở gần cổng nè", "Gian 1 nhiều tin lừa đảo ghê", "Ai lên Bảng vàng chưa?", "Đèn lồng lung linh quá", "Hẹn gặp ở Bảng vàng 🏆", "Cảm ơn nha 🙏"];
const REPLIES = ["Chào bạn! 👋", "Chào nha 😄", "Hello bạn ơi", "Chào bạn, chơi vui nhé!"];
const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)];
const wait = ms => new Promise(r => setTimeout(r, ms));

const seatOcc = new Map(); // ghế -> mã người ngồi (theo tin từ máy chủ)
const botIds = new Set();
let lastReply = 0;

function blockPush(p) {
  for (const [bx, by, br] of BLOCK) { const dx = p.x - bx, dy = p.y - by, d = Math.hypot(dx, dy); if (d < br && d > 0) { p.x = bx + dx / d * br; p.y = by + dy / d * br; } }
}
/** Chọn nơi đi tiếp: dạo trong sân (phần lớn), ghé gian hàng, hoặc tìm ghế trống. */
function nextGoal(b) {
  const r = Math.random();
  if (r < 0.2) {
    const free = SEATS.map((s, i) => i).filter(i => !seatOcc.has(i));
    if (free.length) { const i = free.sort((a, c) => Math.hypot(SEATS[a].x - b.x, SEATS[a].y - b.y) - Math.hypot(SEATS[c].x - b.x, SEATS[c].y - b.y))[Math.floor(Math.random() * Math.min(6, free.length))]; return { x: SEATS[i].x, y: SEATS[i].y, seat: i }; }
  }
  if (r < 0.35) { const p = standPoint(pick(Object.keys(SPOTS))); return { x: p.x + rnd(-120, 120), y: p.y + rnd(-120, 120), idle: rnd(4000, 10000) }; }
  const a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * (Math.random() < 0.7 ? PLAZA_R : FAIR_R * 0.85);
  return { x: CENTER.x + Math.cos(a) * d, y: CENTER.y + Math.sin(a) * d, idle: rnd(1500, 6000) };
}

async function makeBot(i) {
  const r = await fetch(BASE + "/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ devId: "nguoi-ao-" + i }) })
    .catch(() => { throw new Error("Không kết nối được máy chủ " + BASE + ". Hãy chạy chay-thu.cmd trước và để cửa sổ máy chủ mở."); });
  const data = await r.json().catch(() => ({}));
  if (!data.token) throw new Error(r.status === 401 ? "Máy chủ chưa bật chế độ thử (cần DEV_LOGIN=1, ví dụ chạy bằng chay-thu.cmd)" : "Đăng nhập lỗi: " + (data.error || r.status));
  const ws = new WebSocket(BASE.replace(/^http/, "ws") + "/ws?khu=" + KHU + "&token=" + encodeURIComponent(data.token));
  const a = rnd(0, Math.PI * 2), d = rnd(0, PLAZA_R * 1.4);
  const b = { i, ws, id: null, x: CENTER.x + Math.cos(a) * d, y: CENTER.y + Math.sin(a) * d, goal: null, until: Date.now() + rnd(0, 4000), seat: -1, nextChat: Date.now() + rnd(20000, 180000), nextEmote: Date.now() + rnd(8000, 40000) };
  ws.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (m.t === "welcome") { b.id = m.you.id; botIds.add(b.id); for (const p of m.peers) if (p.seat >= 0) seatOcc.set(p.seat, p.id); }
    else if (m.t === "sit") { for (const [k, v] of seatOcc) if (v === m.id) seatOcc.delete(k); if (m.s >= 0) seatOcc.set(m.s, m.id); }
    else if (m.t === "leave") { for (const [k, v] of seatOcc) if (v === m.id) seatOcc.delete(k); }
    else if (m.t === "sitno") { b.seat = -1; b.goal = null; b.until = Date.now() + 500; }
    else if (m.t === "chat" && b.i === 0 && !botIds.has(m.m.pid) && /chào|chao|hello|hi\b/i.test(m.m.text) && Date.now() - lastReply > 4000) {
      // người thật chào thì một người ảo chào lại
      lastReply = Date.now();
      const replier = bots[Math.floor(Math.random() * bots.length)];
      setTimeout(() => { if (replier.ws.readyState === 1) { replier.ws.send(JSON.stringify({ t: "chat", text: pick(REPLIES) })); replier.ws.send(JSON.stringify({ t: "emote", e: 0 })); } }, rnd(1000, 2500));
    }
  };
  ws.onclose = () => { b.closed = true; };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("Không kết nối được WebSocket tới " + BASE)); });
  return b;
}

function stepBot(b, now) {
  if (b.closed || b.ws.readyState !== 1) return;
  const send = o => b.ws.send(JSON.stringify(o));
  if (now > b.nextEmote) { send({ t: "emote", e: Math.floor(Math.random() * 4) }); b.nextEmote = now + rnd(20000, 70000); }
  if (now > b.nextChat) { send({ t: "chat", text: pick(LINES) }); b.nextChat = now + rnd(90000, 240000); }
  if (b.seat >= 0) { // đang ngồi: hết giờ thì đứng dậy, bước ra
    if (now > b.until) { send({ t: "sit", s: -1 }); const se = SEATS[b.seat]; b.x = se.x + Math.sin(se.face) * 55; b.y = se.y + Math.cos(se.face) * 55; b.seat = -1; b.goal = null; b.until = now + rnd(500, 2000); }
    return;
  }
  if (now < b.until) return; // đang đứng chơi
  if (!b.goal) b.goal = nextGoal(b);
  const g = b.goal;
  if (g.seat !== undefined && seatOcc.has(g.seat) && seatOcc.get(g.seat) !== b.id) { b.goal = null; return; } // ghế vừa có người
  const dx = g.x - b.x, dy = g.y - b.y, d = Math.hypot(dx, dy), stepLen = SPEED * STEP_MS / 1000;
  if (d <= stepLen) {
    b.x = g.x; b.y = g.y;
    send({ t: "pos", x: Math.round(b.x), y: Math.round(b.y) });
    if (g.seat !== undefined) { b.seat = g.seat; seatOcc.set(g.seat, b.id); send({ t: "sit", s: g.seat }); b.until = now + rnd(15000, 45000); }
    else b.until = now + (g.idle || 2000);
    b.goal = null;
    return;
  }
  b.x += dx / d * stepLen; b.y += dy / d * stepLen; blockPush(b);
  send({ t: "pos", x: Math.round(b.x), y: Math.round(b.y) });
}

const bots = [];
console.log(`Đang cho ${N} người ảo vào khu ${KHU} (${BASE})...`);
try {
  for (let i = 0; i < N; i += 10) bots.push(...await Promise.all(Array.from({ length: Math.min(10, N - i) }, (_, k) => makeBot(i + k))));
} catch (e) {
  console.error("Lỗi: " + e.message);
  bots.forEach(b => b.ws.close());
  process.exit(1);
}
console.log(`Đã vào: ${bots.length} người. Mở trò chơi, chọn khu ${KHU} để gặp họ. Nhấn Ctrl+C để cho tất cả rời khu.`);
const loop = setInterval(() => { const now = Date.now(); for (const b of bots) stepBot(b, now); }, STEP_MS);
const status = setInterval(() => {
  const on = bots.filter(b => !b.closed).length, sit = bots.filter(b => b.seat >= 0).length;
  console.log(`[${new Date().toLocaleTimeString("vi-VN")}] đang trong khu: ${on} người ảo, đang ngồi: ${sit}`);
  if (!on) { console.log("Mất kết nối với máy chủ."); process.exit(1); }
}, 15000);
const quit = async () => { clearInterval(loop); clearInterval(status); bots.forEach(b => { try { b.ws.close(); } catch (e) { /* bỏ qua */ } }); await wait(300); console.log("Người ảo đã rời khu."); process.exit(0); };
process.on("SIGINT", quit); process.on("SIGTERM", quit);
