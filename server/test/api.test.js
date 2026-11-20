// Kiểm thử máy chủ: chạy bằng `npm test` trong thư mục server.
import { test, before, after } from "node:test";
import { SPAWN, SEATS, WORLD, roomOf, CAFE_SEATS } from "../../shared/world.js";
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

test("Gian 1, Gian 2 chỉ chơi theo phòng: không chơi một mình qua API để lấy điểm", async () => {
  const t = await login("solo-a");
  for (const game of ["g1", "g2"]) {
    const r = await call("/api/runs", { token: t, method: "POST", body: { game } });
    assert.equal(r.status, 400); assert.match(r.data.error, /theo phòng/);
  }
  const m = await call("/api/match"); // tình trạng phòng chờ công khai
  assert.equal(m.status, 200); assert.equal(m.data.min, 20); assert.equal(m.data.max, 50); assert.equal(m.data.g1.n, 0);
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
  // hai người chơi Gian 3 một đoạn ngắn (khai số khung hình không vượt thời gian thực)
  const play = async (id, frames) => {
    const t = await login(id), r = (await call("/api/runs", { token: t, method: "POST", body: { game: "g3" } })).data;
    await new Promise(res => setTimeout(res, frames / 60 * 1000 + 100));
    return { t, fin: (await call(`/api/runs/${r.runId}/finish`, { token: t, method: "POST", body: { inputs: [], frames } })).data };
  };
  const a = await play("board-a", 40), b = await play("board-b", 12);
  assert.ok(a.fin.score > b.fin.score && b.fin.score > 0);
  const lb = await call("/api/leaderboard?tab=all", { token: b.t });
  assert.equal(lb.status, 200); assert.ok(lb.data.rows.length >= 2); assert.ok(lb.data.me.rank >= 2);
  const scores = lb.data.rows.map(r => r.score); assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
  const g3 = await call("/api/leaderboard?tab=g3", { token: a.t }); assert.ok(g3.data.rows.some(r => r.me && r.score === a.fin.score));
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

test("Đấu phòng Gian 1, Gian 2: đủ người mới bắt đầu, chơi cùng đề, chấm và xếp hạng ở máy chủ", async () => {
  // Phòng nhỏ, chạy nhanh để thử: tối thiểu 3, tối đa 4 người
  const mapp = createApp({ ...cfg, matchMin: 3, matchMax: 4, matchCountdown: 250, matchSpeed: 0.025 });
  await new Promise(r => mapp.server.listen(0, "127.0.0.1", r));
  const mbase = "http://127.0.0.1:" + mapp.server.address().port;
  const tok = async id => (await (await fetch(mbase + "/api/auth", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ devId: id }) })).json()).token;
  const open = async id => {
    const ws = new WebSocket(mbase.replace("http", "ws") + "/ws?khu=1&token=" + encodeURIComponent(await tok(id))), inbox = [];
    ws.onmessage = e => inbox.push(JSON.parse(e.data));
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const waitFor = (pred, ms = 4000) => new Promise((res, rej) => { const t0 = Date.now(); const f = () => { const m = inbox.find(pred); if (m) return res(m); if (Date.now() - t0 > ms) return rej(new Error(id + ": hết giờ chờ tin nhắn " + pred.toString().slice(0, 80) + " | đã nhận: " + inbox.map(x => x.t).join(","))); setTimeout(f, 15); }; f(); });
    return { ws, inbox, waitFor, send: o => ws.send(JSON.stringify(o)) };
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const cards = JSON.parse(readFileSync(new URL("../content/cards.json", import.meta.url))).cards;
  const puzzles = JSON.parse(readFileSync(new URL("../content/rebus.json", import.meta.url))).puzzles;
  const [a, b, c, d, e] = [await open("match-a"), await open("match-b"), await open("match-c"), await open("match-d"), await open("match-e")];
  try {

  // --- Gian 1 ---
  a.send({ t: "mjoin", g: "g1" }); b.send({ t: "mjoin", g: "g1" }); await wait(120);
  // không gian riêng của gian: thấy nhau, đi lại, chào nhau
  const sp = b.inbox.find(m => m.t === "mspace");
  assert.ok(sp && sp.you.n && sp.peers.length === 1, "người vào sau thấy người đã ở trong gian");
  assert.ok(a.inbox.find(m => m.t === "mpjoin" && m.peer.n === sp.you.n), "người cũ được báo có người mới vào");
  a.send({ t: "mpos", x: 300, y: 99999 }); a.send({ t: "memote", e: 0 }); await wait(180);
  const mv = b.inbox.find(m => m.t === "mposes");
  assert.ok(mv && mv.p.some(q => q[1] === 300 && q[2] === roomOf("g1").h - roomOf("g1").margin), "đi lại được, giới hạn trong phòng");
  assert.ok(b.inbox.find(m => m.t === "memote" && m.e === 0), "chào nhau trong gian");
  const l2 = [...b.inbox].reverse().find(m => m.t === "mlobby");
  assert.equal(l2.n, 2); assert.equal(l2.min, 3); assert.equal(l2.startIn, null, "2 người: chưa đếm ngược");
  c.send({ t: "mjoin", g: "g1" });
  const l3 = await c.waitFor(m => m.t === "mlobby" && m.n === 3);
  assert.ok(l3.startIn > 0, "đủ 3 người: bắt đầu đếm ngược");
  await a.waitFor(m => m.t === "mstart");
  d.send({ t: "mjoin", g: "g1" });
  const ld = await d.waitFor(m => m.t === "mlobby");
  assert.equal(ld.n, 1, "người đến sau vào phòng chờ mới");
  // A trả lời đúng mọi câu, B trả lời sai mọi câu, C không trả lời
  const answered = new Set();
  const play = setInterval(() => {
    for (const m of a.inbox) if (m.t === "mround" && m.g === "g1" && !answered.has(m.k)) {
      answered.add(m.k); const card = cards.find(x => x.text === m.card.text);
      assert.ok(!("scam" in m.card), "đáp án không được gửi xuống trước");
      a.send({ t: "mans", k: m.k, a: card.scam }); b.send({ t: "mans", k: m.k, a: !card.scam });
    }
  }, 10);
  const [ea, eb, ec] = await Promise.all([a.waitFor(m => m.t === "mend", 20000), b.waitFor(m => m.t === "mend", 20000), c.waitFor(m => m.t === "mend", 20000)]);
  clearInterval(play);
  assert.equal(ea.n, 3); assert.equal(ea.rank, 1); assert.ok(ea.result.score >= 10 * 500, "A đúng 10/10");
  assert.equal(eb.result.score, 0); assert.equal(ec.result.score, 0);
  assert.equal(ea.result.stats.ok, 10); assert.equal(eb.result.stats.ok, 0);
  assert.ok(ea.top[0].score === ea.result.score && ea.result.counted, "ghi vào Bảng vàng");
  const rv = a.inbox.find(m => m.t === "mreveal" && m.g === "g1");
  assert.ok(typeof rv.why === "string" && rv.top.length === 3 && rv.pctScam >= 0, "mỗi câu có đáp án, giải thích, tỉ lệ chọn, top 3");

  // --- Phòng đủ tối đa (4) thì đóng cửa: người thứ 5 vào phòng chờ mới ---
  for (const x of [a, b, c, d, e]) x.inbox.length = 0;
  for (const x of [a, b, c, d, e]) x.send({ t: "mjoin", g: "g2" });
  const s4 = await a.waitFor(m => m.t === "mstart" && m.g === "g2");
  assert.equal(s4.n, 4, "phòng không vượt quá số người tối đa");
  const le = [...e.inbox].reverse().find(m => m.t === "mlobby" && m.g === "g2");
  assert.ok(!e.inbox.some(m => m.t === "mstart") && le && le.n < 4, "người thứ 5 chờ ở phòng mới");
  assert.ok(e.inbox.some(m => m.t === "mspace") , "người thứ 5 vào không gian của phòng chờ mới");
  for (const x of [a, b, c, d, e]) x.send({ t: "mleave" });
  await wait(100);

  // --- Gian 2 ---
  for (const x of [a, b, c, d, e]) x.inbox.length = 0;
  for (const x of [a, b, c]) x.send({ t: "mjoin", g: "g2" });
  await a.waitFor(m => m.t === "mstart" && m.g === "g2");
  const done = new Set();
  const play2 = setInterval(() => {
    for (const m of a.inbox) if (m.t === "mround" && m.g === "g2" && !done.has(m.k)) {
      done.add(m.k);
      const pz = puzzles.find(p => p.pics.join() === m.pics.join());
      a.send({ t: "mguess", k: m.k, text: "SAI ROI" });                    // đoán sai trước
      setTimeout(() => a.send({ t: "mguess", k: m.k, text: pz.name }), 300); // rồi đoán đúng
      b.send({ t: "mhint", k: m.k });
      setTimeout(() => b.send({ t: "mguess", k: m.k, text: pz.name }), 380); // B đoán đúng sau A
    }
  }, 10);
  const [fa, fb, fc] = await Promise.all([a.waitFor(m => m.t === "mend" && m.g === "g2", 20000), b.waitFor(m => m.t === "mend" && m.g === "g2", 20000), c.waitFor(m => m.t === "mend" && m.g === "g2", 20000)]);
  clearInterval(play2);
  assert.ok(a.inbox.some(m => m.t === "mguess" && m.ok === false), "đoán sai thì được thử lại");
  assert.ok(a.inbox.some(m => m.t === "mguess" && m.ok && m.place === 1), "A đoán đúng đầu tiên");
  assert.ok(b.inbox.some(m => m.t === "mhint" && typeof m.letter === "string"), "gợi ý mở một chữ");
  assert.ok(fa.result.score > fb.result.score && fb.result.score > 0 && fc.result.score === 0, "đúng trước được nhiều điểm hơn");
  assert.equal(fa.rank, 1); assert.equal(fa.result.stats.ok, fa.result.stats.total);
  } finally { // luôn dọn dẹp để kiểm thử không treo khi có lỗi
    for (const x of [a, b, c, d, e]) x.ws.close();
    await mapp.close();
  }
});

test("Quản trị: đổi đợt thưởng và xuất danh sách Bảng vàng", async () => {
  const ev = { id: "dot-2", name: "Hội chợ Hè", start: "2026-01-01T00:00:00+07:00", end: "2030-01-01T00:00:00+07:00", prizes: [["Hạng 1", "Quà"]] };
  assert.equal((await call("/api/admin/event", { method: "PUT", body: ev, admin: "admin-test" })).status, 200);
  assert.equal((await call("/api/event")).data.name, "Hội chợ Hè");
  const csv = await call("/api/admin/winners.csv", { admin: "admin-test" });
  assert.match(csv.data, /hang,biet_danh/);
});

test("Phòng chờ có chat (có lọc); quán cà phê: vào không gian riêng, nghe nhạc quản trị viên bật", async () => {
  const tok = async id => (await call("/api/auth", { method: "POST", body: { devId: id } })).data.token;
  const open = async id => {
    const ws = new WebSocket(base.replace("http", "ws") + "/ws?khu=2&token=" + encodeURIComponent(await tok(id))), inbox = [];
    ws.onmessage = e => inbox.push(JSON.parse(e.data));
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    return { ws, inbox, send: o => ws.send(JSON.stringify(o)) };
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const [a, b] = [await open("cafe-a"), await open("cafe-b")];
  try {
    // chat trong phòng chờ Gian 1
    a.send({ t: "mjoin", g: "g1" }); b.send({ t: "mjoin", g: "g1" }); await wait(200);
    a.send({ t: "mchat", text: "Chào cả phòng" }); await wait(150);
    const m = b.inbox.find(x => x.t === "mchat");
    assert.ok(m && m.g === "g1" && m.text === "Chào cả phòng" && m.n === a.inbox.find(x => x.t === "mspace").you.n, "người cùng phòng chờ nhận được tin");
    b.send({ t: "mchat", text: "gọi 0912345678 nhé" }); await wait(150);
    assert.ok(b.inbox.find(x => x.t === "msys"), "số điện thoại bị chặn");
    assert.ok(!a.inbox.find(x => x.t === "mchat" && /0912/.test(x.text)), "tin bị chặn không tới người khác");
    a.send({ t: "mchat", text: "nhanh quá" }); await wait(120);
    assert.ok(a.inbox.find(x => x.t === "msys" && /nhanh/.test(x.text)), "chống gửi liên tục");

    // quán cà phê: chưa bật nhạc
    const tracks = (await call("/api/admin/music", { admin: "admin-test" })).data.tracks;
    assert.ok(tracks.length >= 1, "có sẵn nhạc mẫu");
    a.send({ t: "mjoin", g: "cafe" }); await wait(200);
    assert.ok(a.inbox.find(x => x.t === "mspace" && x.g === "cafe"), "vào không gian quán");
    assert.equal(a.inbox.filter(x => x.t === "cmusic").at(-1).file, null, "chưa có nhạc");
    assert.ok(b.inbox.find(x => x.t === "mpleave" && x.g === "g1"), "rời phòng chờ Gian 1 khi vào quán");
    // quản trị viên bật nhạc: người trong quán nhận được ngay, người vào sau cũng nhận
    assert.equal((await call("/api/admin/music", { method: "PUT", body: { file: "../x.mp3" }, admin: "admin-test" })).status, 404, "không cho đường dẫn lạ");
    assert.equal((await call("/api/admin/music", { method: "PUT", body: { file: tracks[0].file } })).status, 403, "phải là quản trị viên");
    await call("/api/admin/music", { method: "PUT", body: { file: tracks[0].file, volume: 0.6 }, admin: "admin-test" }); await wait(100);
    const cm = a.inbox.filter(x => x.t === "cmusic").at(-1);
    assert.ok(cm.file === tracks[0].file && cm.startedAt > 0 && cm.volume === 0.6, "đang trong quán thì nhận lệnh bật nhạc");
    b.send({ t: "mjoin", g: "cafe" }); await wait(200);
    assert.equal(b.inbox.filter(x => x.t === "cmusic").at(-1).file, tracks[0].file, "vào sau vẫn nghe đúng bài");
    b.send({ t: "mchat", text: "Cà phê ngon quá" }); await wait(120);
    assert.ok(a.inbox.find(x => x.t === "mchat" && x.g === "cafe"), "chat trong quán");
    // ghế trong quán: mỗi ghế một người, đi khỏi ghế thì nhả ghế
    const an = a.inbox.filter(x => x.t === "mspace" && x.g === "cafe").at(-1).you.n;
    a.send({ t: "msit", s: 0 }); await wait(150);
    assert.ok(b.inbox.find(x => x.t === "msit" && x.n === an && x.s === 0), "người khác thấy A ngồi ghế 0");
    b.send({ t: "msit", s: 0 }); await wait(400);
    assert.ok(b.inbox.find(x => x.t === "msitno" && x.s === 0), "không ngồi chồng lên người khác");
    a.send({ t: "mpos", x: CAFE_SEATS[0].x - 200, y: CAFE_SEATS[0].y }); await wait(150);
    assert.ok(b.inbox.find(x => x.t === "msit" && x.n === an && x.s === -1), "đi khỏi ghế thì đứng dậy");
    b.send({ t: "msit", s: 0 }); await wait(150);
    assert.ok(a.inbox.find(x => x.t === "msit" && x.s === 0 && x.n !== an), "ghế trống thì người khác ngồi được");
    b.send({ t: "msit", s: 999 }); await wait(350);
    assert.equal((await call("/api/match")).data.cafe.n, 2, "đếm số người trong quán");
    const st = (await fetch(base + "/api/music/file/" + tracks[0].file, { headers: { range: "bytes=0-99" } }));
    assert.equal(st.status, 206); assert.equal((await st.arrayBuffer()).byteLength, 100, "phát nhạc có hỗ trợ tua (Range)");
    assert.equal((await fetch(base + "/api/music/file/..%2Fdata.db")).status, 404);
    await call("/api/admin/music", { method: "PUT", body: { file: null }, admin: "admin-test" }); await wait(100);
    assert.equal(b.inbox.filter(x => x.t === "cmusic").at(-1).file, null, "tắt nhạc");
    // link YouTube: phát bằng trình phát nhúng, cả quán cùng một đoạn
    assert.equal((await call("/api/admin/music/youtube", { method: "POST", body: { url: "https://evil.com/watch?v=dQw4w9WgXcQ" }, admin: "admin-test" })).status, 400, "chỉ nhận link YouTube");
    const add = await call("/api/admin/music/youtube", { method: "POST", body: { url: "https://youtu.be/dQw4w9WgXcQ?t=5", title: "Bài thử" }, admin: "admin-test" });
    assert.equal(add.data.id, "dQw4w9WgXcQ"); assert.equal(add.data.youtube[0].title, "Bài thử");
    assert.equal((await call("/api/admin/music", { method: "PUT", body: { yt: "aaaaaaaaaaa" }, admin: "admin-test" })).status, 404, "chỉ phát video trong danh sách");
    await call("/api/admin/music", { method: "PUT", body: { yt: "dQw4w9WgXcQ" }, admin: "admin-test" }); await wait(100);
    const ym = a.inbox.filter(x => x.t === "cmusic").at(-1);
    assert.ok(ym.yt === "dQw4w9WgXcQ" && ym.file === null && ym.title === "Bài thử" && ym.startedAt > 0, "người trong quán nhận lệnh phát YouTube");
    await call("/api/admin/music/youtube/delete", { method: "POST", body: { id: "dQw4w9WgXcQ" }, admin: "admin-test" }); await wait(100);
    assert.equal(a.inbox.filter(x => x.t === "cmusic").at(-1).yt, null, "xóa video đang phát thì tắt");
    // nhạc nền cả game: thư viện riêng, tách khỏi nhạc quán; quản trị viên tải file âm thanh lên
    const bg0 = (await call("/api/match")).data.bgm;
    assert.ok(bg0.on && bg0.file === "nhac-mau-thu-gian.wav", "nhạc nền mặc định: bài mẫu");
    const bl0 = (await call("/api/admin/bgm", { admin: "admin-test" })).data.tracks;
    assert.deepEqual(bl0.map(t => t.file), ["nhac-mau-thu-gian.wav"], "thư viện nhạc nền riêng (chỉ có bài mẫu)");
    assert.equal((await call("/api/admin/bgm", { method: "PUT", body: { file: "../x.mp3" }, admin: "admin-test" })).status, 404);
    const wav = await (await fetch(base + "/api/bgm/file/nhac-mau-thu-gian.wav")).arrayBuffer();
    assert.ok(wav.byteLength > 1000, "phát file nhạc nền qua /api/bgm/file");
    const up = await (await fetch(base + "/api/admin/bgm/upload?name=" + encodeURIComponent("Nhạc nền 2.wav"), { method: "POST", headers: { "x-admin-key": "admin-test", "content-type": "application/octet-stream" }, body: Buffer.from(wav) })).json();
    assert.ok(up.file && up.tracks.length === 2, "tải file nhạc nền lên");
    const cafeOnly = await (await fetch(base + "/api/admin/music/upload?name=bai-cua-quan.wav", { method: "POST", headers: { "x-admin-key": "admin-test", "content-type": "application/octet-stream" }, body: Buffer.from(wav) })).json();
    assert.ok(!(await call("/api/admin/music", { admin: "admin-test" })).data.tracks.some(t => t.file === up.file), "nhạc nền không lẫn sang nhạc quán");
    assert.equal((await call("/api/admin/bgm", { method: "PUT", body: { file: cafeOnly.file }, admin: "admin-test" })).status, 404, "không chọn được bài của quán làm nhạc nền");
    await call("/api/admin/bgm", { method: "PUT", body: { files: ["nhac-mau-thu-gian.wav", up.file], shuffle: true, volume: 0.3 }, admin: "admin-test" });
    const bg2 = (await call("/api/match")).data.bgm;
    assert.deepEqual(bg2.files, ["nhac-mau-thu-gian.wav", up.file]); assert.ok(bg2.shuffle && bg2.volume === 0.3);
    await call("/api/admin/bgm", { method: "PUT", body: { on: false }, admin: "admin-test" });
    assert.equal((await call("/api/match")).data.bgm.on, false, "tắt nhạc nền");
    await call("/api/admin/bgm/delete", { method: "POST", body: { file: up.file }, admin: "admin-test" });
    assert.deepEqual((await call("/api/match")).data.bgm.files, ["nhac-mau-thu-gian.wav"], "xóa bài thì bỏ khỏi danh sách phát");
    assert.equal((await call("/api/admin/music/fetch", { method: "POST", body: { url: "https://x.mp3" }, admin: "admin-test" })).status, 404, "đã bỏ thêm nhạc bằng link");
  } finally { for (const x of [a, b]) x.ws.close(); }
});
