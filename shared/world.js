// Bố cục khu hội chợ, dùng chung cho máy chủ và giao diện (cả bản Three.js lẫn bản CSS 3D).
// Đơn vị: px của sân (WORLD × WORLD). Hướng: y tăng là đi về phía nam (phía cổng chào).
// r: góc xoay (độ) của công trình; mặt trước quay theo hướng (−sin r, cos r).
//
// Đổi bố cục ở đây thì cả hai phía cùng đổi. Máy chủ dùng WORLD, SPAWN và SEATS (để giữ chỗ ngồi).

export const WORLD = 2400;
export const CENTER = { x: 1200, y: 1200 };
export const GATE = { x: 1200, y: 2050 };                  // cổng chào, phía nam
export const SPAWN = { x: 1200, y: 2230 };                 // chỗ người chơi xuất hiện, ngay ngoài cổng

// Ba gian ở ba phía còn lại, mặt quay vào giữa sân; Bảng vàng và hai gian sắp mở ở các góc
export const SPOTS = {
  g1: { x: 500, y: 1200, r: -90 },    // phía tây
  g2: { x: 1200, y: 500, r: 0 },      // phía bắc
  g3: { x: 1900, y: 1200, r: 90 },    // phía đông
  board: { x: 560, y: 1840, r: -135 } // góc tây nam
};
export const LOCKED = [
  { id: "s4", name: "Gian 4", x: 560, y: 560, r: -45 },   // góc tây bắc
  { id: "s5", name: "Gian 5", x: 1840, y: 560, r: 45 }    // góc đông bắc
];

export const PLAZA_R = 500;    // sân trống ở giữa (px)
export const FAIR_R = 960;     // khu lát gạch của hội chợ (px)

/* ---------- Chỗ ngồi ---------- */
// Vòng trong: 8 ghế băng, mỗi ghế 3 chỗ, nằm giữa các lối đi tới cổng và 3 gian, quay vào giữa.
// Vòng ngoài: 4 bàn ở 4 hướng chéo, mỗi bàn 4 ghế đẩu.
// Mỗi chỗ ngồi: x, y (px), face (góc quay mặt, radian, theo quy ước atan2(dx, dy)), h (độ cao mặt ghế, đơn vị 3D),
// group (ghế băng hoặc bàn chứa chỗ ngồi này).
const BENCH_R = 330, BENCH_SEAT_GAP = 70;
const TABLE_R = 600;
export const BENCHES = [], TABLES = [], SEATS = [];
for (let k = 0; k < 8; k++) {
  const th = (k * 45 + 22.5) * Math.PI / 180, cx = CENTER.x + Math.cos(th) * BENCH_R, cy = CENTER.y + Math.sin(th) * BENCH_R;
  const tx = -Math.sin(th), ty = Math.cos(th);           // hướng dọc theo ghế (tiếp tuyến)
  const face = Math.atan2(-Math.cos(th), -Math.sin(th));  // quay mặt vào giữa sân
  const seats = [];
  for (const o of [-1, 0, 1]) { seats.push(SEATS.length); SEATS.push({ x: cx + tx * o * BENCH_SEAT_GAP, y: cy + ty * o * BENCH_SEAT_GAP, face, h: 0.55, group: "b" + k }); }
  BENCHES.push({ id: "b" + k, x: cx, y: cy, th, seats });
}
for (let k = 0; k < 4; k++) {
  const th = (k * 90 + 45) * Math.PI / 180, cx = CENTER.x + Math.cos(th) * TABLE_R, cy = CENTER.y + Math.sin(th) * TABLE_R;
  const seats = [];
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const x = cx + dx * 75, y = cy + dy * 75;
    seats.push(SEATS.length); SEATS.push({ x, y, face: Math.atan2(cx - x, cy - y), h: 0.46, group: "t" + k });
  }
  TABLES.push({ id: "t" + k, x: cx, y: cy, th, seats });
}

/** Chỗ người chơi đứng trước một gian (hoặc Bảng vàng) để mở gian đó. */
export function standPoint(id) {
  const sp = SPOTS[id], r = sp.r * Math.PI / 180, dist = id === "board" ? 140 : 190;
  return { x: sp.x - Math.sin(r) * dist, y: sp.y + Math.cos(r) * dist };
}

/** Vật cản khi đi lại: [x, y, bán kính] (px). Ghế không chặn đường để đi tới ngồi được. */
export const BLOCK = [
  ...Object.values(SPOTS).map(s => [s.x, s.y, s === SPOTS.board ? 110 : 140]),
  ...LOCKED.map(s => [s.x, s.y, 110]),
  ...TABLES.map(t => [t.x, t.y, 45])
];
