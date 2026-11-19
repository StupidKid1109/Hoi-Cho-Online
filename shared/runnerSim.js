// Mô phỏng tất định của Gian 3 "Đường về an toàn".
// Giao diện dùng để vẽ, máy chủ dùng để chạy lại từ seed + chuỗi thao tác và tự tính điểm,
// nên người chơi không thể tự sửa điểm. Hai bên phải dùng đúng file này.

export const FPS = 60;
export const DT = 1 / FPS;
export const MAX_FRAMES = FPS * 60 * 10; // tối đa 10 phút một lượt
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

export function createSim(seed) {
  return {
    r: rng(seed), frame: 0, lane: 1, air: 0, duck: 0, lives: 3, shield: false, inv: 0, dist: 0, pts: 0,
    coins: 0, stars: 0, t: 0, since: 0, objs: [], nextId: 1, tips: {}, events: [], over: false
  };
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
  const v = Math.min(1500, 620 + 22 * s.t), mv = v * DT;
  s.dist += v * DT / 20; s.since += mv;
  if (s.since >= ROAD.GAP) { s.since = 0; spawn(s); }
  const keep = [];
  for (const o of s.objs) {
    o.y += mv;
    if (o.lane === s.lane && Math.abs(o.y - ROAD.PY) < 60) {
      if (o.kind === "obs") {
        const how = OBSTACLES[o.ob][3];
        if (s.inv > 0 || (how === "low" && airborne(s)) || (how === "high" && s.duck > 0)) { keep.push(o); continue; } // nhảy qua / cúi qua
        if (s.shield) { s.shield = false; s.inv = 0.6; s.events.push({ type: "shield", obj: o }); }
        else { s.lives--; s.inv = 1.2; s.tips[o.ob] = true; s.events.push({ type: "hit", obj: o }); }
      } else if (o.kind === "coin") { s.coins++; s.pts += 10; s.events.push({ type: "coin", obj: o }); }
      else if (o.kind === "star") { s.stars++; s.pts += 50; s.events.push({ type: "star", obj: o }); }
      else { s.shield = true; s.events.push({ type: "helmet", obj: o }); }
      continue;
    }
    if (o.y > ROAD.L + 80) { s.events.push({ type: "gone", obj: o }); continue; }
    keep.push(o);
  }
  s.objs = keep;
  if (s.lives <= 0) s.over = true;
}

export const score = s => Math.floor(s.dist) + s.pts;

/**
 * Chạy lại cả lượt chơi. inputs: [[frame, d], ...] theo thứ tự frame tăng dần.
 * Trả về kết quả mà máy chủ coi là đúng.
 */
export function replay(seed, inputs, frames) {
  const s = createSim(seed);
  const total = Math.min(Math.max(0, frames | 0), MAX_FRAMES);
  let i = 0;
  while (s.frame < total && !s.over) {
    while (i < inputs.length && inputs[i][0] <= s.frame) { act(s, inputs[i][1]); i++; }
    step(s);
    s.events.length = 0;
  }
  return { score: score(s), dist: Math.floor(s.dist), coins: s.coins, stars: s.stars, frames: s.frame, over: s.over, tips: Object.keys(s.tips).map(Number) };
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
