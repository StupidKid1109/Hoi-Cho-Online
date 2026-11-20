// Kiểm thử Gian 1 "Ai là Hacker?" (server/src/hacker.js): chia vai, mô tả, bỏ phiếu, đoán từ, thắng thua, điểm và giới hạn điểm.
// Chạy trực tiếp bộ máy ván chơi với kết nối giả, thời gian rút ngắn (hackerSpeed nhỏ).
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";
import { makeStore } from "../src/store.js";
import { makeHacker, fold } from "../src/hacker.js";

const PAIR = { civ: "Mã OTP", hacker: "Mật khẩu", knowledge: "Không bao giờ đọc OTP cho ai." };
const wait = ms => new Promise(r => setTimeout(r, ms));
const EVENT = { id: "dot-thu", name: "Đợt thử", start: new Date(Date.now() - 864e5).toISOString(), end: new Date(Date.now() + 864e5).toISOString(), prizes: [] };

function setup({ devLogin = true, speed = 0.01 } = {}) {
  const db = openDb(":memory:"), store = makeStore(db, EVENT), scores = [];
  const hk = makeHacker({ config: { devLogin, hackerSpeed: speed }, db, content: () => ({ hacker: { pairs: [PAIR] } }),
    onScore: (pid, points, counted) => { const r = store.addG1(pid, points, counted); scores.push({ pid, points, counted, r }); return r; } });
  const conns = new Map();
  const conn = id => {
    const inbox = [];
    const c = { pid: id, nick: "Người " + id, open: true, inbox, conn: { sendJSON: o => inbox.push(o), send: s => inbox.push(JSON.parse(s)) } };
    c.send = m => hk.onMessage(c, m);
    c.last = t => [...inbox].reverse().find(m => m.t === t);
    c.waitFor = (pred, ms = 5000) => new Promise((res, rej) => { const t0 = Date.now(); const f = () => { const m = inbox.find(pred); if (m) return res(m); if (Date.now() - t0 > ms) return rej(new Error(id + ": hết giờ chờ " + pred.toString().slice(0, 90) + " | đã nhận: " + inbox.map(x => x.t).join(","))); setTimeout(f, 3); }; f(); });
    conns.set(id, c); return c;
  };
  return { db, store, hk, scores, conn, conns };
}
/** Tạo phòng bạn bè n người rồi bắt đầu; trả về người chơi kèm số ghế, vai (suy ra từ từ khóa được chia). */
async function friendGame(S, n, prefix = "p") {
  const ps = Array.from({ length: n }, (_, i) => S.conn(prefix + i));
  ps[0].send({ t: "hk:create" });
  const code = ps[0].last("hk:room").code;
  for (const p of ps.slice(1)) p.send({ t: "hk:join", code });
  ps[0].send({ t: "hk:start" });
  for (const p of ps) { const d = await p.waitFor(m => m.t === "hk:deal"); p.n = d.you; p.word = d.word; p.hacker = d.word === PAIR.hacker; p.deal = d; }
  return ps;
}
/** Tự động mô tả mỗi khi tới lượt (câu hợp lệ). */
function autoDescribe(ps) {
  const seen = new Set();
  const t = setInterval(() => { for (const p of ps) for (const m of p.inbox) if (m.t === "hk:turn" && m.n === p.n && !seen.has(m.round + ":" + m.n)) { seen.add(m.round + ":" + m.n); p.send({ t: "hk:desc", text: "Cái này liên quan tới điện thoại" }); } }, 2);
  return () => clearInterval(t);
}
const voteRound = async (ps, round, pick, revote = false) => {
  for (const p of ps) await p.waitFor(m => m.t === "hk:vote" && m.round === round && m.revote === revote);
  for (const p of ps) { const target = pick(p); if (target) p.send({ t: "hk:vote", n: target.n }); }
};

test("chia vai: 4–7 người có 1 Hacker, 8 người có 2 Hacker cùng từ; không ai biết vai hay từ của người khác", async () => {
  for (const n of [4, 5, 7, 8]) {
    const S = setup(), ps = await friendGame(S, n, "c" + n);
    const hk = ps.filter(p => p.hacker);
    assert.equal(hk.length, n === 8 ? 2 : 1, n + " người");
    for (const p of ps) {
      assert.ok([PAIR.civ, PAIR.hacker].includes(p.word));
      assert.ok(p.deal.players.every(q => q.hacker === undefined), "danh sách người chơi không có vai");
      assert.ok(!JSON.stringify(p.deal).includes(p.hacker ? PAIR.civ : PAIR.hacker), "không nhận được từ của phe kia");
      assert.ok(!("role" in p.deal) && !("hacker" in p.deal), "không gửi vai");
    }
    for (const p of ps) p.send({ t: "hk:leave" });
  }
});

test("câu mô tả chứa từ khóa (bỏ dấu, không phân biệt hoa thường) bị từ chối; hết giờ thì bỏ lượt", async () => {
  const S = setup(), ps = await friendGame(S, 4, "d");
  const first = ps.find(p => p.n === 1);
  await first.waitFor(m => m.t === "hk:turn" && m.n === 1);
  first.send({ t: "hk:desc", text: (first.hacker ? "mat KHAU" : "ma  otp") + " của tôi" });
  assert.ok(first.last("hk:descno"), "chứa từ khóa: từ chối");
  first.send({ t: "hk:desc", text: "gọi 0912345678 nhé" });
  assert.match(first.last("hk:descno").text, /số điện thoại|chứa/, "qua bộ lọc chat");
  first.send({ t: "hk:desc", text: "x".repeat(81) });
  assert.match(first.last("hk:descno").text, /80/);
  const other = ps.find(p => p.n === 2); other.send({ t: "hk:desc", text: "chưa tới lượt tôi" });
  first.send({ t: "hk:desc", text: "Thứ bí mật chỉ mình biết" });
  const d = await other.waitFor(m => m.t === "hk:desc" && m.n === 1);
  assert.equal(d.text, "Thứ bí mật chỉ mình biết");
  assert.ok(!ps.some(p => p.inbox.some(m => m.t === "hk:desc" && m.text === "chưa tới lượt tôi")), "chưa tới lượt thì không nhận");
  const skip = await other.waitFor(m => m.t === "hk:desc" && m.n === 2 && m.text === null, 3000);
  assert.ok(skip, "hết 30 giây không gõ: bỏ lượt");
  for (const p of ps) p.send({ t: "hk:leave" });
  assert.equal(fold("Mã  OTP!"), "MAOTP");
});

test("Công dân thắng: bỏ phiếu trúng Hacker, Hacker đoán sai; điểm +100 và +50, Hacker 0", async () => {
  const S = setup(), ps = await friendGame(S, 5, "e"), stop = autoDescribe(ps);
  const H = ps.find(p => p.hacker), civ = ps.filter(p => !p.hacker);
  await voteRound(ps, 1, p => p.hacker ? civ[0] : p === civ[3] ? civ[0] : H); // 3 Công dân chọn Hacker, 1 chọn nhầm
  const out = await H.waitFor(m => m.t === "hk:out");
  assert.equal(out.n, H.n); assert.equal(out.hacker, true, "bị loại thì lộ vai");
  await H.waitFor(m => m.t === "hk:guess" && m.n === H.n);
  H.send({ t: "hk:guess", text: "Mật khẩu" });
  const end = await civ[0].waitFor(m => m.t === "hk:end");
  stop();
  assert.equal(end.result, "civ"); assert.equal(end.civ, PAIR.civ); assert.equal(end.hacker, PAIR.hacker); assert.ok(end.knowledge);
  const pts = Object.fromEntries(end.roles.map(r => [r.n, r.points]));
  assert.equal(pts[H.n], 0);
  for (const c of civ.slice(0, 3)) assert.equal(pts[c.n], 150, "chọn trúng Hacker: 100 + 50");
  assert.equal(pts[civ[3].n], 100, "chọn nhầm: chỉ 100");
  assert.ok(S.scores.every(s => s.counted === false), "phòng bạn bè không tính điểm");
});

test("Hacker bị loại đoán trúng từ (bỏ dấu): phe Hacker thắng, người đoán 300; Công dân giữ 50 điểm bỏ phiếu trúng", async () => {
  const S = setup(), ps = await friendGame(S, 4, "f"), stop = autoDescribe(ps);
  const H = ps.find(p => p.hacker), civ = ps.filter(p => !p.hacker);
  await voteRound(ps, 1, p => p.hacker ? civ[0] : H);
  await H.waitFor(m => m.t === "hk:guess");
  H.send({ t: "hk:guess", text: "ma otp" });
  const end = await H.waitFor(m => m.t === "hk:end"); stop();
  assert.equal(end.result, "hacker"); assert.equal(end.guesser, H.n);
  const pts = Object.fromEntries(end.roles.map(r => [r.n, r.points]));
  assert.equal(pts[H.n], 300);
  for (const c of civ) assert.equal(pts[c.n], 50);
});

test("hòa phiếu: bỏ phiếu lại giữa những người hòa; vẫn hòa thì không ai bị loại, sang vòng mới", async () => {
  const S = setup(), ps = await friendGame(S, 4, "g"), stop = autoDescribe(ps);
  const by = n => ps.find(p => p.n === n);
  await voteRound(ps, 1, p => by(p.n % 4 + 1)); // 1→2, 2→3, 3→4, 4→1: hòa 4 người
  const tie = await ps[0].waitFor(m => m.t === "hk:tie");
  assert.deepEqual([...tie.tied].sort(), [1, 2, 3, 4]);
  await voteRound(ps, 1, p => by(p.n % 4 + 1), true);
  await ps[0].waitFor(m => m.t === "hk:nobody" && m.round === 1);
  await ps[0].waitFor(m => m.t === "hk:turn" && m.round === 2);
  assert.ok(!ps[0].inbox.some(m => m.t === "hk:out"), "không ai bị loại");
  stop(); for (const p of ps) p.send({ t: "hk:leave" });
});

test("hết 10 vòng chưa phân thắng thua: ván hòa, không ai được điểm thắng", async () => {
  const S = setup({ speed: 0.004 }), ps = await friendGame(S, 4, "h"), stop = autoDescribe(ps);
  const end = await ps[0].waitFor(m => m.t === "hk:end", 15000); stop(); // không ai bỏ phiếu
  assert.equal(end.result, "draw"); assert.equal(end.rounds, 10);
  assert.ok(end.roles.every(r => r.points === 0));
});

test("Hacker chỉ thắng khi còn đúng 2 người (ván 1 Hacker)", async () => {
  const S = setup(), ps = await friendGame(S, 4, "i"), stop = autoDescribe(ps);
  const H = ps.find(p => p.hacker), civ = ps.filter(p => !p.hacker);
  await voteRound(ps, 1, p => p === civ[0] ? civ[1] : civ[0]);
  const o1 = await H.waitFor(m => m.t === "hk:out" && m.round === 1);
  assert.equal(o1.n, civ[0].n); assert.equal(o1.hacker, false);
  await H.waitFor(m => m.t === "hk:turn" && m.round === 2); // còn 3 người: ván tiếp tục
  const alive = ps.filter(p => p !== civ[0]);
  await voteRound(alive, 2, p => p === civ[1] ? civ[2] : civ[1]);
  const end = await H.waitFor(m => m.t === "hk:end"); stop();
  assert.equal(end.result, "hacker");
  const pts = Object.fromEntries(end.roles.map(r => [r.n, r.points]));
  assert.equal(pts[H.n], 200); assert.equal(pts[civ[0].n], 0); assert.equal(pts[civ[1].n], 0);
});

test("ván 2 Hacker: loại Hacker thứ nhất đoán sai thì ván tiếp tục; Hacker chọn Hacker kia không được +50; còn 3 người gồm 2 Hacker vẫn tiếp tục", async () => {
  const S = setup({ speed: 0.006 }), ps = await friendGame(S, 8, "j"), stop = autoDescribe(ps);
  const [H1, H2] = ps.filter(p => p.hacker), civ = ps.filter(p => !p.hacker);
  // vòng 1: mọi người (cả H2) chọn H1
  await voteRound(ps, 1, p => p === H1 ? civ[0] : H1);
  await H1.waitFor(m => m.t === "hk:guess" && m.n === H1.n);
  H1.send({ t: "hk:guess", text: "sai" });
  await H2.waitFor(m => m.t === "hk:turn" && m.round === 2);
  assert.ok(!H2.inbox.some(m => m.t === "hk:end"), "còn Hacker thứ hai: ván tiếp tục");
  // vòng 2: mọi người còn lại chọn H2 → Công dân thắng
  const rest = ps.filter(p => p !== H1);
  await voteRound(rest, 2, p => p === H2 ? civ[0] : H2);
  await H2.waitFor(m => m.t === "hk:guess" && m.n === H2.n); H2.send({ t: "hk:guess", text: "sai nữa" });
  const e1 = await civ[0].waitFor(m => m.t === "hk:end");
  assert.equal(e1.result, "civ");
  const r1 = Object.fromEntries(e1.roles.map(r => [r.n, r]));
  assert.equal(r1[H2.n].hits, 0, "Hacker chọn Hacker kia: không được +50"); assert.equal(r1[H2.n].points, 0);
  assert.equal(r1[civ[1].n].points, 200, "Công dân chọn trúng Hacker cả 2 vòng: 100 + 50 + 50");
  // ván khác: loại dần Công dân tới khi còn 3 người (2 Hacker + 1 Công dân), rồi còn 2 người
  const S2 = setup({ speed: 0.006 }), qs = await friendGame(S2, 8, "k"), stop2 = autoDescribe(qs);
  const hs = qs.filter(p => p.hacker), cs = qs.filter(p => !p.hacker);
  let aliveList = qs.slice();
  for (let r = 1; r <= 5; r++) {
    const victim = cs[r - 1], helper = cs[r] || hs[0];
    await voteRound(aliveList, r, p => p === victim ? helper : victim);
    await qs[0].waitFor(m => m.t === "hk:out" && m.round === r);
    aliveList = aliveList.filter(p => p !== victim);
  }
  await hs[0].waitFor(m => m.t === "hk:turn" && m.round === 6);
  assert.equal(aliveList.length, 3); assert.ok(!hs[0].inbox.some(m => m.t === "hk:end"), "3 người gồm 2 Hacker: vẫn tiếp tục");
  await voteRound(aliveList, 6, p => p === cs[5] ? hs[0] : cs[5]);
  const end = await hs[0].waitFor(m => m.t === "hk:end"); stop(); stop2();
  assert.equal(end.result, "hacker");
  const pts = Object.fromEntries(end.roles.map(r => [r.n, r.points]));
  for (const h of hs) assert.equal(pts[h.n], 200);
  assert.equal(S.db.prepare("SELECT COUNT(*) n FROM hacker_games").get().n, 1, "lưu ván để xem lại khi có khiếu nại");
});

test("rời ván giữa chừng: 0 điểm cả ván; mất kết nối quá 30 giây bị coi là rời ván", async () => {
  const S = setup(), ps = await friendGame(S, 5, "l"), stop = autoDescribe(ps);
  const H = ps.find(p => p.hacker), civ = ps.filter(p => !p.hacker);
  civ[3].send({ t: "hk:leave" });
  const lf = await H.waitFor(m => m.t === "hk:left");
  assert.equal(lf.n, civ[3].n);
  civ[2].open = false; S.hk.onClose(civ[2]); // mất kết nối
  await H.waitFor(m => m.t === "hk:left" && m.n === civ[2].n, 3000);
  const alive = [H, civ[0], civ[1]];
  await voteRound(alive, 1, p => p.hacker ? civ[0] : H);
  await H.waitFor(m => m.t === "hk:guess"); H.send({ t: "hk:guess", text: "sai" });
  const end = await civ[0].waitFor(m => m.t === "hk:end"); stop();
  const pts = Object.fromEntries(end.roles.map(r => [r.n, r.points]));
  assert.equal(end.result, "civ"); assert.equal(pts[civ[3].n], 0, "tự thoát: 0 điểm"); assert.equal(pts[civ[2].n], 0, "rớt mạng quá hạn: 0 điểm");
  assert.equal(pts[civ[0].n], 150);
});

test("ghép ngẫu nhiên: đủ 8 người bắt đầu ngay, từ 4 người chờ 30 giây rồi bắt đầu; ván ghép ngẫu nhiên mới tính điểm", async () => {
  const S = setup();
  const q = Array.from({ length: 4 }, (_, i) => S.conn("q" + i));
  for (const p of q) p.send({ t: "hk:queue" });
  const st = q[3].last("hk:queue");
  assert.equal(st.n, 4); assert.ok(st.startIn > 0, "đủ 4 người: đếm 30 giây");
  for (const p of q) await p.waitFor(m => m.t === "hk:deal" && m.mode === "random");
  const r8 = Array.from({ length: 9 }, (_, i) => S.conn("r" + i));
  for (const p of r8) p.send({ t: "hk:queue" });
  for (const p of r8.slice(0, 8)) assert.ok(p.inbox.some(m => m.t === "hk:deal"), "đủ 8: bắt đầu ngay");
  assert.ok(!r8[8].inbox.some(m => m.t === "hk:deal") && r8[8].last("hk:queue").n === 1, "người thứ 9 chờ ván sau");
  // chơi nhanh ván 4 người tới khi kết thúc để xem điểm có được tính
  for (const p of q) { const d = p.inbox.find(m => m.t === "hk:deal"); p.n = d.you; p.hacker = d.word === PAIR.hacker; }
  const stop = autoDescribe(q), H = q.find(p => p.hacker), civ = q.filter(p => !p.hacker);
  await voteRound(q, 1, p => p.hacker ? civ[0] : H);
  await H.waitFor(m => m.t === "hk:guess"); H.send({ t: "hk:guess", text: "sai" });
  const end = await civ[0].waitFor(m => m.t === "hk:end"); stop();
  assert.ok(end.score.counted && end.score.added === 150, "ghép ngẫu nhiên: cộng vào Bảng vàng");
  for (const p of r8) p.send({ t: "hk:leave" });
});

test("giới hạn điểm Gian 1: 1.000 mỗi ngày; Bảng vàng chung tối đa theo cấu hình đợt, tab Gian 1 hiện tổng thật", () => {
  const db = openDb(":memory:"), store = makeStore(db, EVENT);
  store.ensurePlayer("u1"); store.ensurePlayer("u2");
  let r; for (let i = 0; i < 5; i++) r = store.addG1("u1", 300, true);
  assert.equal(r.today, 1000); assert.equal(r.added, 0); assert.ok(r.dayFull);
  assert.equal(store.bests("u1").g1, 1000);
  store.setEvent({ ...EVENT, g1DayCap: 5000, g1EventCap: 1500 });
  r = store.addG1("u1", 300, true); r = store.addG1("u1", 300, true);
  assert.equal(r.total, 1600); assert.equal(r.board, 1500); assert.equal(store.bests("u1").g1, 1500, "Bảng vàng chung giới hạn cả đợt");
  assert.equal(store.leaderboard("g1", "u1").me.score, 1600, "tab Gian 1: tổng tích lũy thật");
  assert.equal(store.leaderboard("all", "u1").me.score, 1500);
  assert.equal(store.addG1("u2", 300, false).added, 0, "không tính (phòng bạn bè): không cộng");
});

test("không thêm được người chơi ảo khi DEV_LOGIN=0", async () => {
  const S = setup({ devLogin: false }), a = S.conn("z");
  a.send({ t: "hk:create" }); a.send({ t: "hk:bot" });
  assert.match(a.last("hk:err").text, /chính thức/);
  assert.equal(a.last("hk:room").players.length, 1);
  const D = setup({ devLogin: true }), b = D.conn("y");
  b.send({ t: "hk:create" }); b.send({ t: "hk:bot" });
  assert.equal(b.last("hk:room").players.length, 2, "chạy thử thì thêm được");
});
