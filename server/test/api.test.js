// Kiểm thử máy chủ: chạy bằng `npm test` trong thư mục server.
import { test, before, after } from "node:test";
import { SPAWN, SEATS, WORLD } from "../../shared/world.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createApp } from "../src/app.js";
import { createSim, step, steer, replay, act, validInputs, ROAD, OBSTACLES, ACT } from "../../shared/runnerSim.js";
import { blockReason, cleanText } from "../../shared/chatFilter.js";

const cfg = { port: 0, host: "127.0.0.1", sessionSecret: "test-secret", sessionDays: 1, devLogin: true, zaloAppSecret: "", adminKey: "admin-test", dbFile: ":memory:", corsOrigin: "*", khuCount: 2, khuCapacity: 5, serveClient: true };
let app, base;
const rebusContent = JSON.parse(readFileSync(new URL("../content/rebus.json", import.meta.url)));
const cards = JSON.parse(readFileSync(new URL("../content/cards.json", import.meta.url))).cards;

async function call(path, { token, method = "GET", body, admin } = {}) {
  const res = await fetch(base + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}), ...(admin ? { "x-admin-key": admin } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch (e) { data = text; }
  return { status: res.status, data };
}
const login = async id => (await call("/api/auth", { method: "POST", body: { devId: id } })).data.token;

before(async () => { app = createApp(cfg); await new Promise(r => app.server.listen(0, "127.0.0.1", r)); base = "http://127.0.0.1:" + app.server.address().port; });
after(async () => { await app.close(); });

test("bộ lọc chat chặn số điện thoại, link, OTP và che từ tục", () => {
  assert.ok(blockReason("gọi mình 0912 345 678"));
  assert.ok(blockReason("vào tangqua.vip nhé"));
  assert.ok(blockReason("gửi mã OTP đi"));
  assert.equal(blockReason("gian 3 khó quá"), null);
  assert.equal(cleanText("game vcl hay"), "game *** hay");
});

test("đăng nhập thử và từ chối khi thiếu phiên", async () => {
  assert.equal((await call("/api/me")).status, 401);
  const t = await login("nguoi-choi-a");
  const me = await call("/api/me", { token: t });
  assert.equal(me.status, 200); assert.ok(me.data.nick);
  assert.equal((await call("/api/auth", { method: "POST", body: { devId: "X!" } })).status, 401);
});

test("Gian 1: máy chủ chấm đúng/sai và giữ đáp án", async () => {
  const t = await login("swipe-a");
  const start = await call("/api/runs", { token: t, method: "POST", body: { game: "g1" } });
  assert.equal(start.status, 200);
  assert.ok(start.data.cards.length > 10);
  assert.equal(start.data.cards[0].scam, undefined, "không được lộ đáp án");
  const run = start.data.runId;
  // Trả lời đúng 3 thẻ đầu, sai thẻ thứ 4 (tra đáp án từ nội dung để kiểm thử)
  const answerFor = c => cards.find(x => x.text === c.text).scam;
  let r;
  for (let k = 0; k < 3; k++) { r = await call(`/api/runs/${run}/answer`, { token: t, method: "POST", body: { k, scam: answerFor(start.data.cards[k]) } }); assert.equal(r.data.ok, true); }
  assert.equal(r.data.score, 50 + 60 + 70);
  r = await call(`/api/runs/${run}/answer`, { token: t, method: "POST", body: { k: 3, scam: !answerFor(start.data.cards[3]) } });
  assert.equal(r.data.ok, false); assert.equal(r.data.streak, 0);
  assert.equal((await call(`/api/runs/${run}/answer`, { token: t, method: "POST", body: { k: 9, scam: true } })).status, 400, "sai thứ tự");
  const fin = await call(`/api/runs/${run}/finish`, { token: t, method: "POST" });
  assert.equal(fin.data.score, 180); assert.equal(fin.data.counted, true); assert.equal(fin.data.best, 180);
  assert.equal((await call(`/api/runs/${run}/finish`, { token: t, method: "POST" })).status, 409, "không kết thúc 2 lần");
});

test("Gian 2: đoán sai được thử lại, gợi ý trừ điểm, đúng thì cộng điểm", async () => {
  const t = await login("rebus-a");
  const start = await call("/api/runs", { token: t, method: "POST", body: { game: "g2" } });
  const run = start.data.runId;
  let p = (await call(`/api/runs/${run}/next`, { token: t, method: "POST" })).data.puzzle;
  assert.ok(p.tiles.length >= 14); assert.equal(p.name, undefined);
  const ans = rebusContent.puzzles.find(x => JSON.stringify(x.pics) === JSON.stringify(p.pics)).name;
  assert.equal((await call(`/api/runs/${run}/guess`, { token: t, method: "POST", body: { guess: "SAI" } })).data.ok, false);
  const h = await call(`/api/runs/${run}/hint`, { token: t, method: "POST" });
  assert.equal(h.data.pos, 0);
  const g = await call(`/api/runs/${run}/guess`, { token: t, method: "POST", body: { guess: ans } });
  assert.equal(g.data.ok, true); assert.ok(g.data.gain >= 300 && g.data.gain <= 350, "trừ 50 điểm vì 1 gợi ý: " + g.data.gain);
  p = (await call(`/api/runs/${run}/next`, { token: t, method: "POST" })).data.puzzle; assert.equal(p.index, 1);
  const s = await call(`/api/runs/${run}/skip`, { token: t, method: "POST" }); assert.equal(s.data.ok, false); assert.ok(s.data.name);
  const fin = await call(`/api/runs/${run}/finish`, { token: t, method: "POST" });
  assert.equal(fin.data.score, g.data.gain);
});

test("Gian 3: máy chủ chạy lại mô phỏng, không tin điểm gửi lên", async () => {
  const t = await login("runner-a");
  const start = await call("/api/runs", { token: t, method: "POST", body: { game: "g3" } });
  const { runId, seed } = start.data;
  // Người chơi tự động né vật cản trong 110 khung hình (khoảng 1,8 giây)
  const s = createSim(seed), inputs = [];
  while (s.frame < 110 && !s.over) {
    const danger = l => s.objs.some(o => o.kind === "obs" && o.lane === l && o.y > ROAD.PY - 700 && o.y < ROAD.PY + 60);
    if (danger(s.lane)) { const c = [s.lane - 1, s.lane + 1].filter(l => l >= 0 && l < 3 && !danger(l)); if (c.length) { const d = c[0] - s.lane; inputs.push([s.frame, d]); steer(s, d); } }
    step(s); s.events.length = 0;
  }
  const expected = replay(seed, inputs, s.frame);
  const fin = await call(`/api/runs/${runId}/finish`, { token: t, method: "POST", body: { inputs, frames: s.frame, score: 999999 } });
  assert.equal(fin.status, 200); assert.equal(fin.data.score, expected.score); assert.notEqual(fin.data.score, 999999);
  // Khai số khung hình dài hơn thời gian thực -> bị từ chối
  const r2 = (await call("/api/runs", { token: t, method: "POST", body: { game: "g3" } })).data;
  const bad = await call(`/api/runs/${r2.runId}/finish`, { token: t, method: "POST", body: { inputs: [], frames: 60 * 120 } });
  assert.equal(bad.status, 422);
  assert.equal((await call(`/api/runs/${r2.runId}/finish`, { token: t, method: "POST", body: { inputs: [[5, 3]], frames: 10 } })).status, 400);
});

test("Gian 3: nhảy qua rào thấp, cúi qua biển treo; máy chủ chạy lại khớp điểm", () => {
  // Đặt một vật cản ngay trước xe rồi chạy tới khi vật cản đi qua
  const trial = (ob, action) => {
    const s = createSim(1); s.objs = []; s.since = -1e9; // không sinh thêm vật cản
    s.objs.push({ id: 999, kind: "obs", ob, lane: s.lane, y: ROAD.PY - 260 });
    let frames = 0; const lives = s.lives;
    while (s.objs.some(o => o.id === 999) && frames < 120) {
      const o = s.objs.find(x => x.id === 999);
      if (action && o.y > ROAD.PY - 140 && s.air === 0 && s.duck === 0) act(s, action);
      step(s); s.events.length = 0; frames++;
    }
    return s.lives - lives; // số mạng bị mất
  };
  const low = OBSTACLES.findIndex(o => o[3] === "low"), high = OBSTACLES.findIndex(o => o[3] === "high"), full = OBSTACLES.findIndex(o => o[3] === "full");
  assert.equal(trial(low, 0), -1, "đứng yên thì tông rào thấp");
  assert.equal(trial(low, ACT.JUMP), 0, "nhảy qua rào thấp");
  assert.equal(trial(high, ACT.DUCK), 0, "cúi qua biển treo");
  assert.equal(trial(high, ACT.JUMP), -1, "nhảy thì vẫn tông biển treo");
  assert.equal(trial(full, ACT.JUMP), -1, "vật cao thì phải đổi làn");
  // đang nhảy thì không nhảy thêm được; đang nhảy vuốt xuống thì rơi nhanh để cúi
  const s = createSim(2);
  assert.equal(act(s, ACT.JUMP), true); assert.equal(act(s, ACT.JUMP), false);
  assert.equal(act(s, ACT.DUCK), true); assert.equal(s.air, 0); assert.ok(s.duck > 0);
  // hàng chắn kín 3 làn luôn có ít nhất một vật nhảy hoặc cúi qua được
  for (let seed = 1; seed < 60; seed++) {
    const r = createSim(seed); r.t = 20;
    for (let k = 0; k < 40; k++) {
      r.objs = []; r.events.length = 0; r.since = ROAD.GAP; step(r);
      const row = r.objs.filter(o => o.kind === "obs");
      if (row.length === 3) assert.ok(row.some(o => OBSTACLES[o.ob][3] !== "full"), "hàng 3 làn phải chừa đường nhảy/cúi");
    }
  }
  // chạy lại từ seed + thao tác (có nhảy, cúi) cho cùng kết quả
  const inputs = [[30, ACT.JUMP], [90, ACT.LEFT], [150, ACT.DUCK], [200, ACT.RIGHT], [260, ACT.JUMP]];
  assert.deepEqual(replay(77, inputs, 400), replay(77, inputs, 400));
  assert.ok(validInputs(inputs)); assert.ok(!validInputs([[5, 3]])); assert.ok(!validInputs([[5, -3]]));
});

test("Bảng vàng: tổng điểm cao nhất 3 gian, có thứ hạng của tôi", async () => {
  const t = await login("swipe-a");
  const lb = await call("/api/leaderboard?tab=all", { token: t });
  assert.equal(lb.status, 200); assert.ok(lb.data.rows.length >= 2); assert.ok(lb.data.me.rank >= 1);
  const scores = lb.data.rows.map(r => r.score); assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  const g1 = await call("/api/leaderboard?tab=g1", { token: t }); assert.equal(g1.data.rows[0].score, 180);
});

test("Khu hội chợ: thấy nhau, chat được lọc, báo cáo đủ 3 lần thì ẩn tin", async () => {
  const toks = await Promise.all(["chat-a", "chat-b", "chat-c", "chat-d"].map(login));
  const open = tok => new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace("http", "ws") + "/ws?khu=1&token=" + encodeURIComponent(tok)), inbox = [];
    ws.onmessage = e => inbox.push(JSON.parse(e.data)); ws.onerror = reject;
    ws.onopen = () => resolve({ ws, inbox, send: o => ws.send(JSON.stringify(o)) });
  });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const [a, b, c, d] = [await open(toks[0]), await open(toks[1]), await open(toks[2]), await open(toks[3])];
  await wait(150);
  assert.ok(d.inbox[0].t === "welcome" && d.inbox[0].peers.length === 3, "người vào sau thấy 3 người trong khu");
  a.send({ t: "pos", x: 500, y: 600 }); a.send({ t: "chat", text: "Chào cả khu, gian 3 vcl khó" });
  await wait(150);
  const got = b.inbox.find(m => m.t === "chat"); assert.ok(got); assert.equal(got.m.text, "Chào cả khu, gian 3 *** khó");
  assert.ok(b.inbox.find(m => m.t === "poses" && m.p.some(p => p[1] === 500 && p[2] === 600)), "vị trí được gom gửi theo nhịp");
  assert.ok(!a.inbox.some(m => m.t === "pos"), "không còn gửi từng bước lẻ");
  b.send({ t: "chat", text: "kết bạn mình 0912345678" }); await wait(120);
  assert.ok(b.inbox.find(m => m.t === "sys" && /số điện thoại/.test(m.text))); assert.ok(!a.inbox.find(m => m.t === "chat" && /0912/.test(m.m.text)));
  a.send({ t: "chat", text: "spam" }); await wait(120);
  assert.ok(a.inbox.find(m => m.t === "sys" && /nhanh quá/.test(m.text)), "giới hạn tốc độ chat");
  for (const x of [b, c, d]) x.send({ t: "report", id: got.m.id });
  await wait(200);
  assert.ok(a.inbox.find(m => m.t === "hide" && m.id === got.m.id), "3 báo cáo thì tin bị ẩn");
  const rep = await call("/api/admin/reports", { admin: "admin-test" }); assert.equal(rep.data.reports[0].reports, 3);
  assert.equal((await call("/api/admin/reports", { admin: "sai" })).status, 403);
  const khu = await call("/api/khu"); assert.equal(khu.data.khu[0].online, 4);
  for (const x of [a, b, c, d]) x.ws.close();
});

test("Chỗ ngồi: ngồi được, người khác thấy, không ngồi chồng, đứng dậy hoặc thoát thì nhả ghế", async () => {
  const toks = await Promise.all(["seat-a", "seat-b", "seat-c"].map(login));
  const open = tok => new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace("http", "ws") + "/ws?khu=2&token=" + encodeURIComponent(tok)), inbox = [];
    ws.onmessage = e => inbox.push(JSON.parse(e.data)); ws.onerror = reject;
    ws.onopen = () => resolve({ ws, inbox, send: o => ws.send(JSON.stringify(o)) });
  });
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const [a, b] = [await open(toks[0]), await open(toks[1])];
  await wait(120);
  assert.equal(a.inbox[0].you.x, SPAWN.x, "xuất hiện ở ngoài cổng chào");
  a.send({ t: "sit", s: 5 }); await wait(120);
  assert.ok(b.inbox.find(m => m.t === "sit" && m.s === 5), "người khác thấy A ngồi ghế 5");
  b.send({ t: "sit", s: 5 }); await wait(120);
  assert.ok(b.inbox.find(m => m.t === "sitno" && m.s === 5), "không ngồi chồng lên người khác");
  const c = await open(toks[2]); await wait(120);
  assert.equal(c.inbox[0].peers.find(p => p.x === Math.round(SEATS[5].x)).seat, 5, "người vào sau thấy A đang ngồi");
  a.send({ t: "sit", s: 99999 }); a.send({ t: "pos", x: 9999, y: -5 }); await wait(150);
  assert.ok(b.inbox.find(m => m.t === "sit" && m.s === -1), "đi khỏi ghế thì tự đứng dậy");
  assert.ok(b.inbox.find(m => m.t === "poses" && m.p.some(p => p[1] === WORLD && p[2] === 0)), "vị trí bị giới hạn trong sân");
  b.send({ t: "sit", s: 5 }); await wait(350);
  assert.ok(c.inbox.find(m => m.t === "sit" && m.s === 5 && m.id !== a.inbox[0].you.id), "ghế trống thì người khác ngồi được");
  b.ws.close(); await wait(150);
  c.send({ t: "sit", s: 5 }); await wait(150);
  assert.ok(a.inbox.filter(m => m.t === "sit" && m.s === 5).length >= 3, "thoát ra thì ghế được nhả cho người khác");
  for (const x of [a, c]) x.ws.close();
});

test("Quản trị: đổi đợt thưởng và xuất danh sách Bảng vàng", async () => {
  const ev = { id: "dot-2", name: "Hội chợ Hè", start: "2026-01-01T00:00:00+07:00", end: "2030-01-01T00:00:00+07:00", prizes: [["Hạng 1", "Quà"]] };
  assert.equal((await call("/api/admin/event", { method: "PUT", body: ev, admin: "admin-test" })).status, 200);
  assert.equal((await call("/api/event")).data.name, "Hội chợ Hè");
  const csv = await call("/api/admin/winners.csv", { admin: "admin-test" });
  assert.match(csv.data, /hang,biet_danh/);
});
