// Bố cục khu hội chợ, dùng chung cho máy chủ và giao diện (cả bản Three.js lẫn bản CSS 3D).
// Đơn vị: px của sân (WORLD × WORLD). Hướng: y tăng là đi về phía nam (phía cổng chào).
// r: góc xoay (độ) của công trình; mặt trước quay theo hướng (−sin r, cos r).
//
// Đổi bố cục ở đây thì cả hai phía cùng đổi. Máy chủ dùng WORLD, SPAWN và SEATS (để giữ chỗ ngồi).
//
// SCALE: độ rộng của sân so với bố cục gốc 2400 px. Khoảng cách giữa các công trình nhân SCALE,
// còn kích thước đồ vật (ghế, bàn, khoảng cách giữa các chỗ ngồi, vật cản) giữ nguyên.

export const SCALE = 3;
const L = v => v * SCALE;                                   // đổi khoảng cách bố cục
export const WORLD = L(2400);
export const CENTER = { x: L(1200), y: L(1200) };
export const GATE = { x: CENTER.x, y: CENTER.y + L(850) };  // cổng chào, phía nam
export const SPAWN = { x: CENTER.x, y: GATE.y + 300 };      // chỗ người chơi xuất hiện, ngay ngoài cổng

// Ba gian ở ba phía còn lại, mặt quay vào giữa sân; Bảng vàng và hai gian sắp mở ở các góc
const at = (dx, dy, r, extra) => ({ x: CENTER.x + L(dx), y: CENTER.y + L(dy), r, ...extra });
export const SPOTS = {
  g1: at(-700, 0, -90),       // phía tây
  g2: at(0, -700, 0),         // phía bắc
  g3: at(700, 0, 90),         // phía đông
  board: at(-640, 640, -135), // góc tây nam
  cafe: at(-640, -640, -45)   // góc tây bắc: quán cà phê (không gian riêng có nhạc)
};
export const LOCKED = [
  at(640, -640, 45, { id: "s5", name: "Gian 5" })      // góc đông bắc
];

export const PLAZA_R = L(500);    // sân trống ở giữa (px)
export const FAIR_R = L(960);     // khu lát gạch của hội chợ (px)

/* ---------- Chỗ ngồi ---------- */
// Vòng trong: 16 ghế băng, mỗi ghế 3 chỗ, quay vào giữa, chừa trống 4 lối đi tới cổng và 3 gian.
// Vòng ngoài: 8 bàn tròn, mỗi bàn 4 ghế đẩu.
// Mỗi chỗ ngồi: x, y (px), face (góc quay mặt, radian, theo quy ước atan2(dx, dy)), h (độ cao mặt ghế, đơn vị 3D),
// group (ghế băng hoặc bàn chứa chỗ ngồi này).
const BENCH_R = L(330), BENCH_SEAT_GAP = 70, BENCH_N = 16;
const TABLE_R = L(600), TABLE_N = 8;
export const BENCHES = [], TABLES = [], SEATS = [];
for (let k = 0; k < BENCH_N; k++) {
  const th = (k + 0.5) * (2 * Math.PI / BENCH_N), cx = CENTER.x + Math.cos(th) * BENCH_R, cy = CENTER.y + Math.sin(th) * BENCH_R;
  const tx = -Math.sin(th), ty = Math.cos(th);           // hướng dọc theo ghế (tiếp tuyến)
  const face = Math.atan2(-Math.cos(th), -Math.sin(th));  // quay mặt vào giữa sân
  const seats = [];
  for (const o of [-1, 0, 1]) { seats.push(SEATS.length); SEATS.push({ x: cx + tx * o * BENCH_SEAT_GAP, y: cy + ty * o * BENCH_SEAT_GAP, face, h: 0.55, group: "b" + k }); }
  BENCHES.push({ id: "b" + k, x: cx, y: cy, th, seats });
}
for (let k = 0; k < TABLE_N; k++) {
  const th = (k + 0.5) * (2 * Math.PI / TABLE_N), cx = CENTER.x + Math.cos(th) * TABLE_R, cy = CENTER.y + Math.sin(th) * TABLE_R;
  const seats = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const x = cx + dx * 75, y = cy + dy * 75;
    seats.push(SEATS.length); SEATS.push({ x, y, face: Math.atan2(cx - x, cy - y), h: 0.46, group: "t" + k });
  }
  TABLES.push({ id: "t" + k, x: cx, y: cy, th, seats });
}

// Gian hàng lớn (nhà triển lãm mái ngói): nửa bề ngang, nửa bề sâu (px), tính cả bậc thềm phía trước
export const PAVILION = { hw: 640, hd: 345, scale: 1.5 }; // hw: nửa bề ngang vùng cản (quầy chợ đêm rộng khoảng 12 m)

/** Chỗ người chơi đứng trước một gian (hoặc Bảng vàng) để mở gian đó. */
export function standPoint(id) {
  const sp = SPOTS[id], r = sp.r * Math.PI / 180, dist = id === "board" ? 140 : id === "cafe" ? 300 : PAVILION.hd + 150;
  return { x: sp.x - Math.sin(r) * dist, y: sp.y + Math.cos(r) * dist };
}

/** Vật cản khi đi lại: [x, y, bán kính] (px). Ghế không chặn đường để đi tới ngồi được. */
// Gian hàng: một vòng giữa và hai vòng ở hai cánh để phủ hết bề ngang
const pavBlock = s => { const r = s.r * Math.PI / 180, lx = Math.cos(r), ly = Math.sin(r), o = PAVILION.hw - 220;
  return [[s.x, s.y, PAVILION.hd + 10], [s.x + lx * o, s.y + ly * o, 230], [s.x - lx * o, s.y - ly * o, 230]]; };
export const BLOCK = [
  [SPOTS.board.x, SPOTS.board.y, 110],
  [SPOTS.cafe.x, SPOTS.cafe.y, 260],
  ...["g1", "g2", "g3"].flatMap(id => pavBlock(SPOTS[id])),
  ...LOCKED.map(s => [s.x, s.y, 110]),
  ...TABLES.map(t => [t.x, t.y, 45])
];

/* ---------- Không gian riêng của gian hàng (phòng chờ 3D) ---------- */
// Mỗi phòng chờ là một không gian riêng rộng ROOM.w × ROOM.h px (100 px = 1 đơn vị 3D), cửa ở cạnh dưới (phía máy quay).
export const BOOTH_ROOM = { w: 1200, h: 900, door: { x: 600, y: 820 }, margin: 70 };
// Phòng chờ đấu phòng Gian 1, Gian 2: rộng gấp đôi (mỗi cạnh ×1,41) cho 20–50 người
export const MATCH_ROOM = { w: 1700, h: 1270, door: { x: 850, y: 1185 }, margin: 70 };
// Quán cà phê: tối đa bao nhiêu người một phòng (đông hơn thì mở thêm phòng)
export const CAFE_MAX = 50;
// Quán cà phê dùng mô hình "Low Poly Restaurant Interior Scene" (MarkoJantti, CC BY 4.0, client/public/models/cafe).
// Mô hình đã tách thành vỏ quán (tường, sàn, quầy, kính) và 11 cụm bàn ghế (g0..g10, toạ độ so với tâm cụm).
// Vỏ quán phóng 1,25 lần và kéo rộng thêm CF = 1,45 lần theo chiều ngang (diện tích gấp đôi, trần giữ nguyên);
// bàn ghế giữ đúng cỡ (1,25 lần), đặt lại thưa ra và lùi xa màn chiếu. Toạ độ "vỏ" (mét, trước khi kéo) đổi sang px bằng cpx().
const CS = 1.25, CF = 1.45, COX = -8.6, COZ = -1.2, CK = CS * CF * 100;
const cpx = (x, z) => ({ x: Math.round((x - COX) * CK), y: Math.round((z - COZ) * CK) });
// Cụm bàn ghế: tâm gốc trong mô hình (from), chỗ đặt mới theo toạ độ vỏ (to), ghế (toạ độ gốc), mặt bàn (toạ độ gốc, bán kính m)
const CAFE_GROUPS = [
  { id: "g0", from: [-0.013, 3.818], to: [-0.3, 3.3], cross: true },
  { id: "g1", from: [-2.08, 5.12], to: [-2.9, 5.2], cross: true },
  { id: "g2", from: [-1.798, 7.63], to: [-2.9, 7.8], cross: true },
  { id: "g3", from: [-3.269, 3.452], to: [-2.5, 3.1], seats: [[-3.82, 3.45], [-2.72, 3.45]] },
  { id: "g4", from: [-5.848, 3.929], to: [-5.0, 3.5], seats: [[-6.097, 3.064], [-5.358, 3.796], [-5.845, 4.755]] },
  { id: "g5", from: [-3.955, 5.619], to: [-4.85, 5.6], seats: [[-3.716, 4.996], [-4.465, 5.331], [-3.404, 5.925], [-4.17, 6.193]], tops: [[-3.85, 5.3], [-4.06, 5.94]] },
  { id: "g6", from: [-4.18, 8.017], to: [-2.3, 9.9], seats: [[-4.471, 7.638], [-3.642, 7.645], [-3.855, 8.478]] },
  { id: "g7", from: [0.316, 6.14], to: [-1.0, 6.3], seats: [[0.044, 5.698], [0.044, 6.613], [0.73, 5.63], [0.73, 6.61]], tops: [[0.316, 5.95], [0.316, 6.33]] },
  { id: "g8", from: [0.317, 8.711], to: [-0.9, 8.7], seats: [[0.044, 8.268], [0.044, 9.182], [0.73, 8.2], [0.73, 9.18]], tops: [[0.317, 8.52], [0.317, 8.9]] },
  { id: "g9", from: [-1.744, 10.767], to: [-0.5, 11.4], seats: [[-1.83, 10.107], [-2.255, 10.673], [-1.105, 10.772], [-1.584, 11.291]], tops: [[-1.62, 10.6], [-1.87, 10.93]] },
  { id: "g10", from: [-4.16, 2.16], to: [-4.16, 2.02], seats: [[-5.16, 2.16], [-4.16, 2.16], [-3.16, 2.16]], bar: true, tops: [] }
];
/** Toạ độ gốc (x, z) thuộc cụm G đổi sang px của phòng: dời theo tâm mới, giữ đúng cỡ bàn ghế. */
const gpx = (G, x, z) => { const c = cpx(G.to[0], G.to[1]); return { x: Math.round(c.x + (x - G.from[0]) * CS * 100), y: Math.round(c.y + (z - G.from[1]) * CS * 100) }; };
export const CAFE_ROOM = {
  w: Math.round((1.45 - COX) * CK), h: Math.round((14.0 - COZ) * CK), margin: 40,
  door: cpx(0.0, 0.1),                                   // cửa ra vào ở tường sau, cạnh quầy bar
  model: { url: "models/cafe/quan.gltf", scale: CS, stretch: CF, ox: COX, oz: COZ, credit: "Mô hình quán: “Low Poly Restaurant Interior Scene” của MarkoJantti (Sketchfab), giấy phép CC BY 4.0",
    groups: CAFE_GROUPS.map(G => ({ id: G.id, from: G.from, ...cpx(G.to[0], G.to[1]) })) },
  // vùng đi lại được (đa giác theo sàn trong nhà, chừa quầy bar và mặt kính bo cong)
  walk: [[-1.7, -0.6], [0.75, -0.6], [0.75, 13.3], [0.2, 13.1], [-0.5, 12.75], [-1.2, 12.0], [-2.2, 11.0], [-3.2, 10.0], [-4.2, 9.0], [-4.7, 8.0], [-5.2, 7.0], [-5.7, 6.0], [-6.2, 5.0], [-6.2, 3.5], [-6.45, 3.0], [-6.45, 1.85], [-1.7, 1.85]].map(([x, z]) => cpx(x, z)),
  // hai cột trắng giữa quán (không đi xuyên, máy quay không lọt vào)
  posts: [[-2.25, 1.75], [-2.25, 6.4]].map(([x, z]) => ({ ...cpx(x, z), r: 60 })),
  // mặt bàn (không đi xuyên qua): tâm và bán kính px
  tables: CAFE_GROUPS.flatMap(G => (G.tops || [G.from]).map(([x, z]) => ({ ...gpx(G, x, z), r: 50 }))),
  // màn chiếu dán trên tường gỗ dài (x = 1,11 m), quay vào trong phòng
  screen: { ...cpx(1.07, 7.4), rot: -Math.PI / 2, w: 6.0, h: 3.375, cy: 2.2 }
};
/** Điểm (x, y) px có nằm trong đa giác không. */
export function inPoly(x, y, poly) {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}
// 39 chỗ ngồi đúng vị trí ghế trong mô hình (đo từ ảnh chụp từ trên xuống): ghế quanh 10 bàn và 3 ghế cao ở quầy, dời theo cụm.
// face: hướng mặt khi ngồi (quay vào bàn / quầy, quy ước atan2(dx, dy)), h: độ cao mặt ghế (đơn vị 3D, đã phóng).
export const CAFE_SEATS = [];
for (const G of CAFE_GROUPS) {
  const list = G.cross ? [[0.62, 0], [-0.62, 0], [0, 0.62], [0, -0.62]].map(([dx, dz]) => [G.from[0] + dx, G.from[1] + dz]) : G.seats;
  for (const [x, z] of list) {
    const p = gpx(G, x, z), t = G.bar ? gpx(G, x, z - 1) : gpx(G, G.from[0], G.from[1]);
    CAFE_SEATS.push({ x: p.x, y: p.y, face: Math.atan2(t.x - p.x, t.y - p.y), h: (G.bar ? 0.73 : 0.49) * CS });
  }
}
/** Không gian (kích thước, cửa) của phòng: quán cà phê hoặc phòng chờ các gian. */
export const roomOf = game => game === "cafe" ? CAFE_ROOM : game === "g1" || game === "g2" ? MATCH_ROOM : BOOTH_ROOM;
