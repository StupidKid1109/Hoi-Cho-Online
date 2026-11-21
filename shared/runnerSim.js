// Mô phỏng tất định của Gian 3 "Đường về an toàn".
// Giao diện dùng để vẽ, máy chủ dùng để chạy lại từ seed + chuỗi thao tác và tự tính điểm,
// nên người chơi không thể tự sửa điểm. Hai bên phải dùng đúng file này.

export const FPS = 60;
export const DT = 1 / FPS;
export const MAX_FRAMES = FPS * 60 * 120; // chạy vô hạn tới khi hết mạng; chặn 2 giờ để máy chủ chạy lại không quá nặng
export const ROAD = { L: 2400, PY: 2230, SPAWN: 260, GAP: 560, LANES: [216, 320, 424] };

// [emoji, tên, lời nhắc, cách vượt]: "low" = rào thấp, nhảy qua được; "high" = biển treo, cúi qua được;
// "full" = vật cao, phải đổi làn.
export const OBSTACLES = [
  ["🍺", "Rượu bia", "Đã uống rượu bia thì không lái xe.", "low"],
  ["🚦", "Đèn đỏ", "Gặp đèn đỏ phải dừng lại trước vạch dừng.", "full"],
  ["📱", "Điện thoại", "Không dùng điện thoại khi đang lái xe.", "full"],
  ["🚧", "Thi công", "Giảm tốc và quan sát khi qua đoạn đường thi công.", "low"],
  ["⛔", "Ngược chiều", "Không đi vào đường cấm, đường ngược chiều.", "high"],
  ["🏁", "Đua xe", "Đua xe trái phép gây nguy hiểm cho mình và người khác.", "high"]
];

import { QUIZ } from "./trafficQuiz.js";
export { QUIZ };

// Câu hỏi luật giữa đường: câu đầu ở mét 250, sau mỗi câu chạy thêm 350 m thì tới câu sau. Hiện câu hỏi 2,5 giây rồi mới tới cổng 3 đáp án
// (mỗi làn một đáp án); xe chạy chậm lại trong lúc trả lời; đi đúng làn có đáp án đúng khi tới cổng.
export const QUIZ_FIRST = 250, QUIZ_EVERY = 350, QUIZ_READ = 150, QUIZ_OK = 100, QUIZ_STREAK = 50, QUIZ_BAD = 50;
// Nhiệm vụ trong ngày: giống nhau cho mọi người trong ngày, phải làm trong một lượt chạy, mỗi nhiệm vụ xong +200 điểm.
export const MISSION_PTS = 200;
export const MISSIONS = {
  coins: { icon: "🪙", n: [25, 40, 60], text: n => "Nhặt " + n + " xu" },
  stars: { icon: "⭐", n: [3, 5, 8], text: n => "Nhặt " + n + " ngôi sao" },
  dodge: { icon: "🛵", n: [15, 25, 40], text: n => "Vượt qua " + n + " vật cản" },
  trick: { icon: "🤸", n: [4, 8, 12], text: n => "Nhảy hoặc cúi qua " + n + " vật cản" },
  quiz: { icon: "🚦", n: [2, 3, 4], text: n => "Trả lời đúng " + n + " câu luật" },
  dist: { icon: "📏", n: [800, 1200, 1800], text: n => "Chạy được " + n + " m" },
  clean: { icon: "✨", n: [300, 500, 800], text: n => "Chạy " + n + " m không va chạm" },
  helmet: { icon: "⛑️", n: [1, 2, 3], text: n => "Nhặt " + n + " mũ bảo hiểm" }
};
/** 3 nhiệm vụ của ngày (chuỗi "YYYY-MM-DD"), ai cũng như nhau. */
export function dailyMissions(day) {
  let h = 7; for (const ch of String(day)) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  const r = rng(h), keys = Object.keys(MISSIONS), out = [];
  while (out.length < 3) { const k = keys[Math.floor(r() * keys.length)]; if (!out.some(m => m.k === k)) out.push({ k, n: MISSIONS[k].n[Math.floor(r() * 3)] }); }
  return out;
}
export const missionText = m => MISSIONS[m.k] ? MISSIONS[m.k].text(m.n) : "";
/** Tiến độ một nhiệm vụ trong lượt đang chạy. */
export function missionProgress(s, m) {
  return { coins: s.coins, stars: s.stars, dodge: s.dodged, trick: s.tricks, quiz: s.qOk, dist: Math.floor(s.dist), clean: Math.floor(s.clean), helmet: s.helmets }[m.k] || 0;
}

// Thao tác: -1 / 1 đổi làn trái / phải, 2 nhảy, -2 cúi
export const ACT = { LEFT: -1, RIGHT: 1, JUMP: 2, DUCK: -2 };
export const JUMP_FRAMES = 40;   // nhảy khoảng 0,67 giây
export const DUCK_FRAMES = 38;   // cúi khoảng 0,63 giây
const LAND_FRAMES = 3;           // mấy khung cuối khi sắp chạm đất thì không còn qua được rào

/** Bộ sinh số ngẫu nhiên tất định (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSim(seed, missions = []) {
  return {
    r: rng(seed), frame: 0, lane: 1, air: 0, duck: 0, lives: 3, shield: false, inv: 0, dist: 0, pts: 0,
    coins: 0, stars: 0, t: 0, since: 0, objs: [], nextId: 1, tips: {}, events: [], over: false,
    // câu hỏi luật, nhiệm vụ
    quiz: null, nextQuiz: QUIZ_FIRST, qUsed: [], qOk: 0, qN: 0, qStreak: 0, qWrong: {},
    dodged: 0, tricks: 0, helmets: 0, clean: 0,
    mis: (missions || []).filter(m => MISSIONS[m.k]).slice(0, 3).map(m => ({ k: m.k, n: m.n | 0, done: false }))
  };
}
/** Tốc độ đường chạy (đơn vị mô phỏng / giây). Chậm lại khi đang trả lời câu hỏi. */
export function speed(s) { const v = Math.min(1500, 620 + 22 * s.t); return s.quiz ? Math.max(650, v * 0.6) : v; }

function startQuiz(s) {
  if (s.qUsed.length >= QUIZ.length) s.qUsed = [];
  const free = QUIZ.map((_, i) => i).filter(i => !s.qUsed.includes(i));
  const q = free[Math.floor(s.r() * free.length)]; s.qUsed.push(q);
  const order = shuffle3(s.r); // order[làn] = số thứ tự đáp án (0 là đáp án đúng)
  s.quiz = { q, order, f: QUIZ_READ, gate: false };
  s.events.push({ type: "quiz", q, order });
}
function judgeQuiz(s) {
  const z = s.quiz, ok = z.order[s.lane] === 0;
  s.qN++;
  if (ok) { s.qOk++; s.pts += QUIZ_OK + QUIZ_STREAK * Math.min(s.qStreak, 4); s.qStreak++; }
  else { s.qStreak = 0; s.pts = Math.max(0, s.pts - QUIZ_BAD); s.qWrong[z.q] = true; }
  s.events.push({ type: "answer", ok, q: z.q, lane: s.lane, right: z.order.indexOf(0), streak: s.qStreak });
  s.quiz = null; s.nextQuiz = s.dist + QUIZ_EVERY; s.since = 0;
}

function shuffle3(r) { const a = [0, 1, 2]; for (let i = 2; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const PASSABLE = OBSTACLES.map((o, i) => i).filter(i => OBSTACLES[i][3] !== "full");
function spawn(s) {
  const lanes = shuffle3(s.r);
  // từ giây 14: có hàng chắn kín 3 làn, luôn có ít nhất một vật nhảy hoặc cúi qua được
  const full3 = s.t > 14 && s.r() < 0.3;
  const nObs = full3 ? 3 : s.t > 8 && s.r() < 0.38 ? 2 : 1;
  const pickupRoll = s.r(), kindRoll = s.r();
  const obs = Array.from({ length: nObs }, () => Math.floor(s.r() * OBSTACLES.length));
  if (full3 && obs.every(i => OBSTACLES[i][3] === "full")) obs[Math.floor(s.r() * 3)] = PASSABLE[Math.floor(s.r() * PASSABLE.length)];
  lanes.forEach((lane, k) => {
    let o = null;
    if (k < nObs) o = { kind: "obs", ob: obs[k] };
    else if (k === nObs && pickupRoll < 0.6) o = { kind: kindRoll < 0.1 && !s.shield ? "helmet" : kindRoll < 0.32 ? "star" : "coin" };
    if (o) { o.id = s.nextId++; o.lane = lane; o.y = ROAD.SPAWN; s.objs.push(o); s.events.push({ type: "spawn", obj: o }); }
  });
}

/** Đổi làn: d = -1 (trái) hoặc 1 (phải). */
export function steer(s, d) { if (!s.over) s.lane = Math.max(0, Math.min(2, s.lane + (d < 0 ? -1 : 1))); }

/**
 * Một thao tác của người chơi (xem ACT). Trả về true nếu thao tác có tác dụng
 * (giao diện chỉ ghi lại những thao tác có tác dụng để gửi máy chủ chạy lại).
 */
export function act(s, d) {
  if (s.over) return false;
  if (d === ACT.LEFT || d === ACT.RIGHT) { const before = s.lane; steer(s, d); return s.lane !== before; }
  if (d === ACT.JUMP) { if (s.air > 0) return false; s.duck = 0; s.air = JUMP_FRAMES; return true; }
  if (d === ACT.DUCK) { if (s.duck > 0 && s.air === 0) return false; s.air = 0; s.duck = DUCK_FRAMES; return true; } // đang nhảy thì rơi nhanh xuống cúi
  return false;
}
/** Đang ở trên không đủ cao để qua rào thấp. */
export const airborne = s => s.air > LAND_FRAMES;

/** Tiến một khung hình. Sự kiện (va chạm, nhặt đồ) được ghi vào s.events để giao diện hiển thị. */
export function step(s) {
  if (s.over) return;
  s.frame++; s.t += DT; s.inv = Math.max(0, s.inv - DT);
  if (s.air > 0) s.air--;
  if (s.duck > 0) s.duck--;
  const v = speed(s), mv = v * DT;
  s.dist += v * DT / 20; s.clean += v * DT / 20;
  // tới mốc câu hỏi: ngừng sinh vật cản, đợi đường trống (vật cản đã qua khỏi xe) rồi mới hiện câu hỏi
  const quizDue = !s.quiz && s.dist >= s.nextQuiz;
  if (quizDue && !s.objs.some(o => o.kind === "obs" && o.y < ROAD.PY + 60)) startQuiz(s);
  if (quizDue && !s.quiz) { /* đang đợi đường trống */ }
  else if (s.quiz) {
    if (!s.quiz.gate && --s.quiz.f <= 0) { // hết giờ đọc: cổng đáp án xuất hiện ở cuối đường
      s.quiz.gate = true;
      for (let l = 0; l < 3; l++) { const o = { id: s.nextId++, kind: "ans", lane: l, ans: s.quiz.order[l], q: s.quiz.q, y: ROAD.SPAWN }; s.objs.push(o); s.events.push({ type: "spawn", obj: o }); }
    }
  } else { s.since += mv; if (s.since >= ROAD.GAP) { s.since = 0; spawn(s); } }
  const keep = [];
  let judge = false;
  for (const o of s.objs) {
    o.y += mv;
    if (o.kind === "ans") { // cổng đáp án: chấm khi tới chỗ xe
      if (o.y >= ROAD.PY) { judge = true; s.events.push({ type: "ans", obj: o, mine: o.lane === s.lane }); continue; }
      keep.push(o); continue;
    }
    if (o.lane === s.lane && Math.abs(o.y - ROAD.PY) < 60) {
      if (o.kind === "obs") {
        const how = OBSTACLES[o.ob][3];
        if (s.inv > 0) { o.free = true; keep.push(o); continue; }
        if ((how === "low" && airborne(s)) || (how === "high" && s.duck > 0)) { if (!o.trick) { o.trick = true; s.tricks++; } keep.push(o); continue; } // nhảy qua / cúi qua
        if (s.shield) { s.shield = false; s.inv = 0.6; s.events.push({ type: "shield", obj: o }); }
        else { s.lives--; s.inv = 1.2; s.clean = 0; s.tips[o.ob] = true; s.events.push({ type: "hit", obj: o }); }
      } else if (o.kind === "coin") { s.coins++; s.pts += 10; s.events.push({ type: "coin", obj: o }); }
      else if (o.kind === "star") { s.stars++; s.pts += 50; s.events.push({ type: "star", obj: o }); }
      else { s.shield = true; s.helmets++; s.events.push({ type: "helmet", obj: o }); }
      continue;
    }
    if (o.kind === "obs" && !o.passed && o.y > ROAD.PY + 60) { o.passed = true; if (!o.free) s.dodged++; } // vượt qua không va chạm
    if (o.y > ROAD.L + 80) { s.events.push({ type: "gone", obj: o }); continue; }
    keep.push(o);
  }
  s.objs = keep;
  if (judge && s.quiz) judgeQuiz(s);
  for (const m of s.mis) if (!m.done && missionProgress(s, m) >= m.n) { m.done = true; s.pts += MISSION_PTS; s.events.push({ type: "mission", m }); }
  if (s.lives <= 0) s.over = true;
}

export const score = s => Math.floor(s.dist) + s.pts;

/**
 * Chạy lại cả lượt chơi. inputs: [[frame, d], ...] theo thứ tự frame tăng dần.
 * Trả về kết quả mà máy chủ coi là đúng.
 */
export function replay(seed, inputs, frames, missions = []) {
  const s = createSim(seed, missions);
  const total = Math.min(Math.max(0, frames | 0), MAX_FRAMES);
  let i = 0;
  while (s.frame < total && !s.over) {
    while (i < inputs.length && inputs[i][0] <= s.frame) { act(s, inputs[i][1]); i++; }
    step(s);
    s.events.length = 0;
  }
  return { score: score(s), dist: Math.floor(s.dist), coins: s.coins, stars: s.stars, frames: s.frame, over: s.over, tips: Object.keys(s.tips).map(Number),
    qOk: s.qOk, qN: s.qN, qWrong: Object.keys(s.qWrong).map(Number), missions: s.mis.map(m => ({ k: m.k, n: m.n, done: m.done })) };
}

/** Kiểm tra định dạng chuỗi thao tác gửi lên. */
export function validInputs(inputs) {
  if (!Array.isArray(inputs) || inputs.length > 20000) return false;
  let last = -1;
  for (const it of inputs) {
    if (!Array.isArray(it) || it.length !== 2) return false;
    const [f, d] = it;
    if (!Number.isInteger(f) || f < last || f < 0 || f > MAX_FRAMES || ![-2, -1, 1, 2].includes(d)) return false;
    last = f;
  }
  return true;
}
