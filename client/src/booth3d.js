// Không gian riêng bên trong mỗi gian hàng (Three.js): phòng theo chủ đề của gian, màn hình lớn báo số người,
// người chơi cùng phòng chờ đi lại, chào nhau. Toạ độ theo px của phòng (BOOTH_ROOM, quán: CAFE_ROOM trong shared/world.js), 100 px = 1 đơn vị.
import * as THREE from "three";
import { CSS3DRenderer, CSS3DObject } from "three/examples/jsm/renderers/CSS3DRenderer.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { esc } from "./ui.js";
import { initialQuality } from "./gfx/webgl.js";
import { createRenderer, setMaxAniso, canvasTex, emojiSprite, glowTex, blobTex, rrect, fitText, disposeTree, FONT } from "./gfx/kit.js";
import { peerLook, characterGeometry, characterMaterial, animateCharacter } from "./gfx/character.js";
import { CAFE_SEATS, roomOf, inPoly } from "../../shared/world.js";

const U = 100;
/** Khoảng cách từ điểm (x, y) tới đoạn thẳng a–b (px). */
function segDist(x, y, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / l)) : 0;
  return Math.hypot(x - a.x - t * dx, y - a.y - t * dy);
}
const SPEED = 420; // px/giây
const NAME_MAX = 10;
const EMO = ["👋", "🙏", "👏", "🎉"];
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

/*
 * Mô hình phòng chờ (Sketchfab, CC BY 4.0, đã chuẩn bị sẵn trong client/public/models/phong-cho, ghi công ở GIAY-PHEP.txt):
 *  g1 "Hacker Room low poly" (Pudding_King): xoay cạnh dài ra sau, phóng đều 3,2 lần cho vừa phòng chờ, nhân vật phóng theo (k);
 *     áp phích trên tường thay bằng áp phích chống lừa đảo, chữ "HACKER" bỏ đi, màn hình đếm người treo vào chỗ đó.
 *  g2 "Scifi Tron Studio | Baked" (ida61xq): trường quay đèn đã "nướng" sẵn (vật liệu không cần ánh sáng), màn hình đếm người đặt vào khung màn hình sân khấu.
 *  g3 "Cartoon Lowpoly Small City Free Pack" (antonmoek): đứng giữa ngã tư, màn hình đếm người dựng thành biển quảng cáo.
 * Toạ độ mô hình: cx, cz (tâm đặt vào giữa phòng), floor (mặt sàn), đơn vị gốc của mô hình; scale đổi ra mét. Nạp lỗi thì giữ phòng tự dựng.
 */
const ROOM_MODELS = {
  g1: { url: "models/phong-cho/hacker.glb", scale: 3.2, rotY: -Math.PI / 2, k: 1.6, widen: 1.414, posters: true, hide: ["texttype"], walls: true, ceil: 6.8, light: 0x9a7cff, bg: 0x0b0b10, screen: { xAbs: 7.4, zAbs: 0.35, rot: -Math.PI / 2, cy: 4.3, w: 6.8, h: 2.7 } },
  g2: { url: "models/phong-cho/tron.glb", scale: 0.56, cx: 0, cz: 0, floor: 0, z: -8.3, basic: true, bg: 0x00030a, screen: { zAbs: -9.75, cy: 3.4, w: 10, h: 4.7 } },
  g3: { url: "models/phong-cho/pho.glb", scale: 0.012, cx: -435, cz: -454, floor: -115, bg: 0xbfe3f2, billboard: true, clearSpawn: true, screen: { zAbs: -4.2, cy: 2.6, w: 5.6, h: 2.1 } }
};
const POSTER_MATS = ["giant_robot", "swaarden", "shower", "whale", "astronaut", "blood_forest"];
const ANTI_SCAM = ["Không chia sẻ mã OTP", "Cảnh giác cuộc gọi lạ", "Không bấm đường link lạ", "Xác minh trước khi chuyển tiền", "Bảo vệ thông tin cá nhân", "Nghi lừa đảo: báo ngay công an"];

// Chủ đề từng gian
const THEMES = {
  g1: { wall: "#f6dcdc", trim: "#c8102e", floorA: "#fff4ec", floorB: "#f7d9d3", posters: ["Không chia sẻ mã OTP", "Xác minh trước khi chuyển tiền", "Cảnh giác tin nhắn lạ"], props: ["🛡️", "📱", "🔒"] },
  g2: { wall: "#dcf1e5", trim: "#0f8a5f", floorA: "#fffaf0", floorB: "#e3f3e8", posters: ["🌊 + 🗡️ = ?", "🛕 + 1️⃣ + 🏛️ = ?", "🐉 + 🌊 = ?"], props: ["🖼️", "🔤", "💡"] },
  cafe: { wall: "#f3e2c8", trim: "#7a4a2a", floorA: "#a8743f", floorB: "#94612f", posters: ["☕ Cà phê sữa đá", "Trò chuyện lịch sự, vui vẻ", "🎵 Nhạc do ban tổ chức chọn"], props: ["☕", "🥐", "🎶"] },
  g3: { wall: "#dbe8fb", trim: "#2563eb", floorA: "#3b3f4a", floorB: "#3b3f4a", posters: ["Đội mũ bảo hiểm khi đi xe", "Đã uống rượu bia, không lái xe", "Dừng lại khi đèn đỏ"], props: ["🛵", "🚦", "⛑️"] }
};

/**
 * Mở không gian của gian `game` trong `container`.
 * solo: không có phòng chờ (Gian 3). send: gửi tin máy chủ (đi lại, chào). Trả về các hàm điều khiển.
 */
export async function openRoom({ container, game, title, nick, solo, send }) {
  const T = THEMES[game] || THEMES.g1;
  // kích thước phòng: quán cà phê rộng hơn (mô hình nội thất riêng), các gian dùng phòng chờ chung
  const R = roomOf(game), W = R.w / U, H = R.h / U, M = R.margin, CAFE = !!R.model;
  const wx = x => (x - R.w / 2) / U, wz = y => (y - R.h / 2) / U;
  const TABLES = R.tables || [], POSTS = R.posts || [];
  const RM = CAFE ? null : ROOM_MODELS[game] || null, OBST = []; // mô hình phòng chờ; vật cản (hình chữ nhật px) tính từ mô hình khi nạp xong
  const K = CAFE ? R.model.scale : RM && RM.k ? RM.k : 1; // mô hình nội thất phóng to nên nhân vật, tầm mắt, tốc độ cũng phóng theo cho cân
  /** Điểm (x, y) px có đứng được không: trong phòng; quán thì trong sàn đi lại hoặc ngay cạnh một ghế. */
  const nearSeat = (x, y) => CAFE_SEATS.some(se => Math.hypot(se.x - x, se.y - y) < 45);
  const walkable = (x, y) => (CAFE && nearSeat(x, y)) || x >= M && x <= R.w - M && y >= M && y <= R.h - M && (!R.walk || inPoly(x, y, R.walk) || CAFE_SEATS.some(se => Math.hypot(se.x - x, se.y - y) < 40)) && !TABLES.some(tb => Math.hypot(tb.x - x, tb.y - y) < tb.r) && !POSTS.some(c => Math.hypot(c.x - x, c.y - y) < c.r) && !OBST.some(r => x > r[0] && x < r[2] && y > r[1] && y < r[3]);
  const q = initialQuality(), renderer = createRenderer(Math.min(q, 1), { alpha: game === "cafe" }); // phòng nhỏ: không cần mức cao; quán: nền trong suốt được để khoét chỗ video
  renderer.shadowMap.enabled = false; setMaxAniso(renderer);
  container.appendChild(renderer.domElement);
  const labels = document.createElement("div"); labels.className = "lbl3"; container.appendChild(labels);
  const scene = new THREE.Scene(), bgColor = new THREE.Color(T.wall).multiplyScalar(0.55);
  if (game === "cafe") renderer.setClearColor(bgColor, 1); else scene.background = bgColor; // quán: màu nền vẽ bằng clear để chỗ khoét giữ trong suốt
  const camera = new THREE.PerspectiveCamera(52, 1, 0.3, 80);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a7a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5); sun.position.set(-4, 9, 6); scene.add(sun);

  /* ---------- Phòng ---------- */
  const anim = [], notes = [], seatPick = [];
  const wallMat = new THREE.MeshLambertMaterial({ color: T.wall }), trimMat = new THREE.MeshLambertMaterial({ color: T.trim });
  const nProc = scene.children.length; // từ đây: đồ của phòng tự dựng (bỏ đi khi nạp được mô hình phòng chờ)
  if (CAFE) buildCafeModel(); else {
  const floorTex = canvasTex(256, 256, (g, w, h) => {
    if (game === "g3") { // mặt đường có vạch
      g.fillStyle = T.floorA; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { g.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.12)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(w / 2 - 4, 0, 8, h / 2);
    } else if (game === "cafe") { // sàn ván gỗ
      for (let j = 0; j < 8; j++) { g.fillStyle = j % 2 ? T.floorA : T.floorB; g.fillRect(0, j * h / 8, w, h / 8); g.fillStyle = "rgba(60,30,10,.35)"; g.fillRect(0, j * h / 8, w, 2); g.fillRect(((j * 97) % 200) + 20, j * h / 8, 2, h / 8); }
      for (let i = 0; i < 600; i++) { g.fillStyle = "rgba(60,30,10,.08)"; g.fillRect(Math.random() * w, Math.random() * h, 6, 1); }
    } else { const n = 4, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? T.floorB : T.floorA; g.fillRect(i * s, j * s, s, s); } }
  }, { repeat: game === "g3" ? [3, 3] : [6, 4.5] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 5, 0.2), wallMat); back.position.set(0, 2.5, -H / 2 - 0.1); scene.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5, H), wallMat); side.position.set(sx * (W / 2 + 0.1), 2.5, 0); scene.add(side);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, H), trimMat); trim.position.set(sx * (W / 2 + 0.1), 4.9, 0); scene.add(trim);
  }
  const btrim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.25, 0.24), trimMat); btrim.position.set(0, 4.9, -H / 2 - 0.1); scene.add(btrim);
  // thảm lối vào ở cửa
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), new THREE.MeshLambertMaterial({ color: T.trim })); mat.rotation.x = -Math.PI / 2; mat.position.set(wx(R.door.x), 0.03, wz(R.door.y) + 0.3); scene.add(mat);
  }

  // màn hình lớn trên tường sau: tên gian, số người, đếm ngược
  // Quán cà phê: màn hình lớn tỉ lệ 16:9 (video YouTube lấp đầy); các gian khác: màn hình bảng tin dài
  // Màn hình nằm trong nhóm `sg` (gốc ở chân tường, mặt quay theo +z của nhóm): gian thường ở tường sau, quán ở tường gỗ dài
  const RS = RM && RM.screen;
  const BIG = CAFE, SW = CAFE ? R.screen.w : RS ? RS.w : 6.4, SH = CAFE ? R.screen.h : RS ? RS.h : 2.4, SY = CAFE ? R.screen.cy : RS ? RS.cy : 1.95;
  const sg = new THREE.Group(); scene.add(sg);
  if (CAFE) { sg.position.set(wx(R.screen.x), 0, wz(R.screen.y)); sg.rotation.y = R.screen.rot; }
  else { sg.position.set(RS && RS.xAbs != null ? RS.xAbs : 0, 0, RS && RS.zAbs != null ? RS.zAbs : -H / 2); if (RS && RS.rot) sg.rotation.y = RS.rot; }
  sg.updateMatrixWorld(true);
  const sN = new THREE.Vector3(0, 0, 1).applyQuaternion(sg.quaternion), sC = sg.localToWorld(new THREE.Vector3(0, SY, 0)); // pháp tuyến, tâm màn hình
  const scr = document.createElement("canvas"); scr.width = 1024; scr.height = BIG ? 576 : Math.round(1024 * SH / SW);
  const scrTex = new THREE.CanvasTexture(scr); scrTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }));
  screen.position.set(0, SY, 0.1); sg.add(screen);
  // "Lỗ" trong suốt đúng chỗ màn hình: video (HTML) nằm sau khung vẽ 3D, lộ ra qua lỗ này; người, đồ vật đứng trước vẫn che được video
  const scrMat = screen.material, holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending }); // tách hẳn khỏi tường để không nhấp nháy vệt đen khi xoay
  const frame = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.3, SH + 0.3, 0.12), new THREE.MeshLambertMaterial({ color: 0x1d1f24 })); frame.position.set(0, SY, 0.02); sg.add(frame);
  function drawScreen(big, line1, line2) {
    const g = scr.getContext("2d"), w = scr.width, h = scr.height;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#14182a"); gr.addColorStop(1, "#24294a"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = T.trim; g.lineWidth = 10; rrect(g, 10, 10, w - 20, h - 20, 26); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    const k = h / 384, oy = BIG ? 40 : 0;
    g.fillStyle = "#ffc533"; fitText(g, title.toUpperCase(), w / 2, 64 * k + (BIG ? -10 : 0), w - 120, 50 * (BIG ? 1.2 : 1), 900);
    g.fillStyle = "#ffffff"; fitText(g, big, w / 2, 178 * k - oy, w - 120, 120 * (BIG ? 1.15 : 1), 900);
    g.fillStyle = "#cfe3ff"; fitText(g, line1, w / 2, 276 * k - oy, w - 120, 46 * (BIG ? 1.2 : 1), 800);
    g.fillStyle = "rgba(255,255,255,.7)"; fitText(g, line2 || "", w / 2, 334 * k - oy, w - 120, 32 * (BIG ? 1.2 : 1), 600);
    scrTex.needsUpdate = true;
  }
  /** Màn hình đang chiếu video (khung video YouTube đặt chồng lên): chỉ vẽ nền tối, viền và nốt nhạc hai bên. */
  function drawVideoFrame() {
    const g = scr.getContext("2d"), w = scr.width, h = scr.height;
    g.fillStyle = "#07080c"; g.fillRect(0, 0, w, h);
    g.strokeStyle = T.trim; g.lineWidth = 10; rrect(g, 10, 10, w - 20, h - 20, 26); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle"; g.font = "64px " + FONT; g.fillStyle = "#ffc533";
    g.fillText("♪", 80, h / 2 - 50); g.fillText("♫", w - 80, h / 2 + 40); g.fillText("♫", 80, h / 2 + 60); g.fillText("♪", w - 80, h / 2 - 60);
    scrTex.needsUpdate = true;
  }
  drawScreen(solo ? "SẴN SÀNG" : "…", solo ? "Bấm “Bắt đầu chạy” khi đã sẵn sàng" : "Đang vào phòng chờ", "");

  if (!CAFE) {
  // áp phích hai bên tường
  T.posters.forEach((text, i) => {
    const tex = canvasTex(512, 320, (g, w, h) => {
      g.fillStyle = "#fffdf6"; rrect(g, 6, 6, w - 12, h - 12, 20); g.fill();
      g.strokeStyle = T.trim; g.lineWidth = 12; rrect(g, 12, 12, w - 24, h - 24, 16); g.stroke();
      g.fillStyle = T.trim; g.textAlign = "center"; g.textBaseline = "middle";
      const words = text.split(" "), lines = []; let cur = "";
      g.font = "900 54px " + FONT;
      for (const wd of words) { const t = cur ? cur + " " + wd : wd; if (g.measureText(t).width > w - 80 && cur) { lines.push(cur); cur = wd; } else cur = t; }
      lines.push(cur);
      lines.forEach((ln, k) => fitText(g, ln, w / 2, h / 2 + (k - (lines.length - 1) / 2) * 62, w - 60, 54));
    });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.375), new THREE.MeshLambertMaterial({ map: tex }));
    const sx = i === 2 ? 1 : -1, z = i === 2 ? -0.6 : (i === 0 ? -2 : 1);
    p.position.set(sx * (W / 2 - 0.01), 1.8, z); p.rotation.y = -sx * Math.PI / 2; scene.add(p);
  });
  // đồ trang trí: emoji lớn trên bục ở các góc, đèn lồng treo
  [[-W / 2 + 1.1, -H / 2 + 1.1], [W / 2 - 1.1, -H / 2 + 1.1], [W / 2 - 1.1, H / 2 - 1.6]].forEach(([x, z], i) => {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 20), trimMat); ped.position.set(x, 0.25, z); scene.add(ped);
    const sp = emojiSprite(T.props[i], 1.1); sp.position.set(x, 1.2, z); scene.add(sp); anim.push({ o: sp, y: 1.2, p: i });
  });
  if (game === "g3") { // cọc tiêu và vạch qua đường
    for (let i = 0; i < 4; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 12), new THREE.MeshLambertMaterial({ color: 0xff7a00 })); cone.position.set(-W / 2 + 0.6, 0.27, -1.5 + i * 0.9); scene.add(cone); }
    for (let i = 0; i < 6; i++) { const z = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.6), new THREE.MeshBasicMaterial({ color: 0xf4f1e8 })); z.rotation.x = -Math.PI / 2; z.position.set(-1.5 + i * 0.6, 0.03, 2.6); scene.add(z); }
  }
  }
  // quán cà phê: loa hai bên màn hình, nốt nhạc bay khi đang phát nhạc
  const SPX = SW / 2 + 0.75;
  if (CAFE) {
    const dark = new THREE.MeshLambertMaterial({ color: 0x2b2420 });
    for (const sx of [-1, 1]) {
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.45), dark); spk.position.set(sx * SPX, SY - 0.3, 0.25); sg.add(spk);
      for (const [y, r] of [[SY - 0.05, 0.17], [SY - 0.5, 0.1]]) { const cone = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshLambertMaterial({ color: 0x777777 })); cone.position.set(sx * SPX, y, 0.48); sg.add(cone); }
      for (let i = 0; i < 3; i++) { const n = emojiSprite(i % 2 ? "🎵" : "🎶", 0.4); n.visible = false; sg.add(n); notes.push({ o: n, sx, p: i / 3 + (sx > 0 ? 0.15 : 0) }); }
    }
  }
  let musicOn = false;
  if (!CAFE) {
  // đèn lồng treo dọc hai tường bên (không che màn hình lớn)
  const lanGeo = new THREE.SphereGeometry(0.2, 12, 10), lanMat = game === "cafe" ? new THREE.MeshLambertMaterial({ color: 0xffd58a, emissive: 0xffb347, emissiveIntensity: 0.9 }) : new THREE.MeshLambertMaterial({ color: 0xe01b3c, emissive: 0xff3a1a, emissiveIntensity: 0.6 });
  const lanPos = [];
  for (const sx of [-1, 1]) for (const z of [-2.8, -0.6, 1.6]) lanPos.push([sx * (W / 2 - 0.45), 2.75, z]);
  lanPos.forEach(([x, y, z], i) => { const l = new THREE.Mesh(lanGeo, lanMat); l.scale.y = 1.25; l.position.set(x, y, z); scene.add(l); anim.push({ o: l, swing: true, p: i }); });
  const glowGeo = new THREE.BufferGeometry(); glowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lanPos.flat()), 3));
  scene.add(new THREE.Points(glowGeo, new THREE.PointsMaterial({ map: glowTex(), color: 0xff9a3c, size: 1.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  // nền ngoài cửa (để không thấy khoảng trống khi máy quay lùi ra)
  const outside = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshLambertMaterial({ color: new THREE.Color(T.trim).lerp(new THREE.Color(0x2a2230), 0.6) }));
  outside.rotation.x = -Math.PI / 2; outside.position.set(0, -0.02, 10); scene.add(outside);
  }
  if (RM) loadRoomModel(scene.children.slice(nProc).filter(o => o !== sg));

  /** Nạp mô hình phòng chờ của gian (ROOM_MODELS), thay phòng tự dựng; tính vật cản để không đi xuyên đồ đạc. */
  const posterMeshes = [];
  function loadRoomModel(proc) {
    new GLTFLoader().load(new URL(RM.url, document.baseURI).href, gl => {
      if (closed) return;
      const root = new THREE.Group(), src = gl.scene, list = [];
      src.updateMatrixWorld(true);
      src.traverse(m => {
        if (!m.isMesh) return;
        const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld); // gom về toạ độ mô hình để dời từng món
        const sm = m.material;
        let mat = RM.basic // trường quay: ánh sáng đã nướng vào ảnh, vẽ thẳng không cần đèn
          ? new THREE.MeshBasicMaterial({ map: sm.emissiveMap || sm.map, color: sm.emissiveMap ? 0xffffff : sm.color, alphaTest: sm.alphaTest || 0, side: THREE.DoubleSide })
          : new THREE.MeshLambertMaterial({ map: sm.map, color: sm.color, alphaTest: sm.alphaTest || (sm.transparent ? 0.4 : 0), side: sm.side });
        const pi = RM.posters ? POSTER_MATS.findIndex(n => (sm.name || "").startsWith(n)) : -1;
        if (pi >= 0) { const pt = posterTex(ANTI_SCAM[pi], pi); mat = new THREE.MeshLambertMaterial({ map: pt, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: 0.35, side: THREE.DoubleSide }); } // áp phích gốc: thay bằng áp phích chống lừa đảo, hơi sáng như có đèn rọi
        if (RM.hide && RM.hide.some(h => (m.name || "").startsWith(h))) return;
        const nm = new THREE.Mesh(g, mat); nm.name = m.name; root.add(nm); list.push(nm); if (pi >= 0) posterMeshes.push(nm);
      });
      const k = RM.scale; root.scale.setScalar(k);
      if (RM.rotY != null) { // xoay rồi đặt tâm mô hình vào giữa phòng
        root.rotation.y = RM.rotY; root.updateMatrixWorld(true);
        const bx = new THREE.Box3().setFromObject(root), c = bx.getCenter(new THREE.Vector3());
        root.position.set(-c.x, 0, -c.z);
        if (RM.widen) widenRoom(root, list, RM.widen);
      } else root.position.set(-RM.cx * k, -RM.floor * k, -RM.cz * k + (RM.z || 0));
      if (RM.walls) { // phòng gốc chỉ có hai vách (cắt bổ): dựng thêm vách trái; phía trước để trống
        const wm = new THREE.MeshLambertMaterial({ color: 0x15151c });
        const wa = new THREE.Mesh(new THREE.BoxGeometry(0.2, RM.ceil + 0.8, H + 0.6), wm); wa.position.set(-W / 2 - 0.2, (RM.ceil + 0.8) / 2, 0); scene.add(wa);
        const fl = new THREE.Mesh(new THREE.PlaneGeometry(60, 40), new THREE.MeshLambertMaterial({ color: 0x101016 })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, -0.03, 10); scene.add(fl); // phía trước để mở như sân khấu (máy quay lùi ra được)
      }
      scene.add(root);
      proc.forEach(o => scene.remove(o));
      scene.background = new THREE.Color(RM.bg);
      if (RM.light) { for (const x of [-W / 4, W / 4]) { const l = new THREE.PointLight(RM.light, 1.4, 12, 1.2); l.position.set(x, 2.6, 0); scene.add(l); } }
      if (RM.billboard) { // biển quảng cáo: hai cột và mặt sau cho màn hình đếm người
        const post = new THREE.MeshLambertMaterial({ color: 0x5b6470 });
        for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, SY, 10), post); c.position.set(sx * (SW / 2 - 0.4), SY / 2, -0.1); sg.add(c); }
        const back = new THREE.Mesh(new THREE.BoxGeometry(SW + 0.4, SH + 0.4, 0.1), post); back.position.set(0, SY, -0.06); sg.add(back);
      }
      if (RM.clearSpawn) { // dọn xe cộ, đồ vật ngay chỗ người chơi vào phòng (quanh cửa)
        root.updateMatrixWorld(true);
        const bz = new THREE.Box3(), dz = new THREE.Box3(new THREE.Vector3(wx(R.door.x) - 2.2, -1, wz(R.door.y) - 3.2), new THREE.Vector3(wx(R.door.x) + 2.2, 5, wz(R.door.y) + 1.5)), s3 = new THREE.Vector3();
        for (const m of [...list]) { bz.setFromObject(m); bz.getSize(s3); if (s3.y > 0.25 && s3.x < 6 && s3.z < 6 && bz.intersectsBox(dz)) { root.remove(m); list.splice(list.indexOf(m), 1); } }
      }
      // vật cản: đồ đứng trên sàn cao quá 0,3 m (bàn, ghế, sân khấu, nhà, xe, cây); bỏ sàn, tường dài, đồ treo cao
      root.updateMatrixWorld(true);
      const b = new THREE.Box3(), sz = new THREE.Vector3(), pad = 22;
      for (const m of list) {
        b.setFromObject(m); b.getSize(sz);
        if (b.max.y < 0.35 || b.min.y > 1.8 || sz.y < 0.3 || sz.x > 14 || sz.z > 14) continue;
        if (Math.min(sz.x, sz.z) < 0.35 && Math.max(sz.x, sz.z) > 3) continue;
        const r = [b.min.x * U + R.w / 2 - pad, b.min.z * U + R.h / 2 - pad, b.max.x * U + R.w / 2 + pad, b.max.z * U + R.h / 2 + pad];
        if (r[2] < 0 || r[0] > R.w || r[3] < 0 || r[1] > R.h) continue;
        OBST.push(r);
      }
    }, undefined, e => console.warn("Không nạp được mô hình phòng chờ, dùng phòng tự dựng", e));
  }
  /**
   * Nới phòng rộng ra F lần theo chiều ngang mà không phóng to đồ đạc: tường, sàn kéo dãn; đồ đạc gom theo cụm chạm nhau,
   * dời tâm cụm ra theo tỉ lệ; cụm sát tường (tranh, máy lạnh, màn hình treo) giữ nguyên khoảng cách tới tường.
   */
  function widenRoom(root, list, F) {
    root.updateMatrixWorld(true);
    for (const m of list) { m.geometry.applyMatrix4(root.matrixWorld); m.geometry.computeBoundingBox(); }
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1);
    const bb = list.map(m => m.geometry.boundingBox), all = new THREE.Box3(); bb.forEach(b => all.union(b));
    const size = b => b.getSize(new THREE.Vector3());
    const shell = bb.map(b => { const v = size(b); return (v.x > 5 && v.z > 5 && v.y < 1) || ((v.x > 5 || v.z > 5) && v.y > 5); });
    const flat = bb.map(b => { const v = size(b); return Math.min(v.x, v.z) < 0.15 && v.y > 0.8; });
    const par = list.map((_, i) => i), find = i => par[i] === i ? i : (par[i] = find(par[i]));
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      if (shell[i] || shell[j] || flat[i] || flat[j]) continue;
      if (bb[i].clone().expandByScalar(0.08).intersectsBox(bb[j])) par[find(i)] = find(j);
    }
    // dời tâm cụm: cụm sát tường thì mặt sát tường đi theo mặt tường (tường giãn F lần nên mặt tường cũ ở p dời tới p·F)
    const shift = (c, mn, mx, lo, hi) => mx > hi - 1.5 ? mx * (F - 1) : mn < lo + 1.5 ? mn * (F - 1) : c * (F - 1);
    const groups = new Map();
    list.forEach((m, i) => {
      if (shell[i]) { m.geometry.scale(F, 1, F); return; }
      const k = find(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i);
    });
    for (const ids of groups.values()) {
      const C = new THREE.Box3(); ids.forEach(i => C.union(bb[i])); const c = C.getCenter(new THREE.Vector3());
      const dx = shift(c.x, C.min.x, C.max.x, all.min.x, all.max.x), dz = shift(c.z, C.min.z, C.max.z, all.min.z, all.max.z);
      ids.forEach(i => list[i].geometry.translate(dx, 0, dz));
    }
  }
  /** Áp phích chống lừa đảo (thay tranh gốc trong phòng): giấy in bóng, khung, minh hoạ, khẩu hiệu, ô thông tin. */
  function posterTex(text, i) {
    const C = [["#b91c1c", "#ef4444"], ["#1e3a8a", "#3b82f6"], ["#065f46", "#10b981"], ["#9a3412", "#f97316"], ["#5b21b6", "#8b5cf6"], ["#9f1239", "#f43f5e"]][i % 6];
    const ICON = ["🔐", "📞", "🔗", "💸", "🪪", "👮"][i % 6], SUB = ["Mã OTP là chìa khoá tài khoản của bạn", "Không làm theo người lạ qua điện thoại", "Tin nhắn trúng thưởng thường là bẫy", "Gọi lại người thân để xác minh", "Không gửi ảnh CCCD cho người lạ", "Gọi 113 hoặc đến công an phường"][i % 6];
    const t = canvasTex(512, 720, (g, w, h) => {
      // nền: dải màu đậm phía trên, giấy kem phía dưới, hoạ tiết sọc chéo mờ
      const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, C[0]); bg.addColorStop(0.5, C[1]); bg.addColorStop(0.5, "#fff8ec"); bg.addColorStop(1, "#f3e6cf");
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.save(); g.globalAlpha = 0.08; g.strokeStyle = "#fff"; g.lineWidth = 18; for (let x = -h; x < w; x += 52) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h * 0.5, h * 0.5); g.stroke(); } g.restore();
      // biển cảnh báo tam giác
      g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(w / 2, 34); g.lineTo(w / 2 + 44, 108); g.lineTo(w / 2 - 44, 108); g.closePath(); g.fill();
      g.fillStyle = "#1f1a17"; g.font = "900 46px " + FONT; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("!", w / 2, 84);
      g.fillStyle = "#fff"; g.font = "900 54px " + FONT; g.fillText("CẢNH GIÁC", w / 2, 156);
      g.font = "800 26px " + FONT; g.fillStyle = "rgba(255,255,255,.88)"; g.fillText("LỪA ĐẢO QUA MẠNG", w / 2, 200);
      // vòng tròn minh hoạ nổi giữa hai nửa
      g.save(); g.shadowColor = "rgba(0,0,0,.35)"; g.shadowBlur = 24; g.shadowOffsetY = 8; g.fillStyle = "#fff"; g.beginPath(); g.arc(w / 2, 330, 92, 0, Math.PI * 2); g.fill(); g.restore();
      g.lineWidth = 10; g.strokeStyle = C[1]; g.beginPath(); g.arc(w / 2, 330, 84, 0, Math.PI * 2); g.stroke();
      g.font = "100px " + FONT; g.fillText(ICON, w / 2, 336);
      // khẩu hiệu
      g.fillStyle = C[0]; g.font = "900 40px " + FONT;
      const words = text.toUpperCase().split(" "), lines = []; let cur = "";
      for (const wd of words) { const tt = cur ? cur + " " + wd : wd; if (g.measureText(tt).width > w - 60 && cur) { lines.push(cur); cur = wd; } else cur = tt; }
      lines.push(cur); lines.forEach((ln, k) => fitText(g, ln, w / 2, 478 + k * 46, w - 50, 40));
      g.fillStyle = "#5b4636"; g.font = "700 22px " + FONT; fitText(g, SUB, w / 2, 488 + lines.length * 46, w - 60, 22, 700);
      // dải chân trang
      g.fillStyle = C[0]; g.fillRect(0, h - 64, w, 64);
      g.fillStyle = "#fff"; g.font = "800 20px " + FONT; g.fillText("Hội chợ online · Tuyên truyền phòng chống lừa đảo", w / 2, h - 32);
      // viền khung gỗ và lớp bóng giấy in
      g.lineWidth = 16; g.strokeStyle = "#3a2a1c"; g.strokeRect(8, 8, w - 16, h - 16);
      g.lineWidth = 3; g.strokeStyle = "rgba(255,255,255,.5)"; g.strokeRect(19, 19, w - 38, h - 38);
      const gl = g.createLinearGradient(0, 0, w, h); gl.addColorStop(0, "rgba(255,255,255,.18)"); gl.addColorStop(0.35, "rgba(255,255,255,0)"); gl.addColorStop(1, "rgba(0,0,0,.12)");
      g.fillStyle = gl; g.fillRect(16, 16, w - 32, h - 32);
    });
    return t;
  }


  /** Quán cà phê: nội thất là mô hình "Low Poly Restaurant Interior Scene" (MarkoJantti, CC BY 4.0), ghế bấm được để ngồi. */
  function buildCafeModel() {
    // sàn tạm (thấy ngay khi mô hình còn đang tải; nạp lỗi thì vẫn đi lại được)
    const tmp = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshLambertMaterial({ color: 0x9b6a3c })); tmp.rotation.x = -Math.PI / 2; tmp.position.y = -0.01; scene.add(tmp);
    const md = R.model, url = new URL(md.url, document.baseURI).href;
    new GLTFLoader().load(url, g => {
      if (closed) { disposeTree(g.scene); return; }
      const o = g.scene, mats = new Map();
      o.traverse(m => {
        if (!m.isMesh) return;
        if (m.material && m.material.name === "material") { m.visible = false; return; } // phông nền xanh khổng lồ bao quanh: bỏ
        const src = m.material;
        if (!mats.has(src)) mats.set(src, new THREE.MeshLambertMaterial({ map: src.map, color: src.color, transparent: src.transparent, opacity: src.opacity, alphaTest: src.map && src.transparent ? 0.3 : 0, depthWrite: !(src.transparent && !src.map), side: src.side }));
        m.material = mats.get(src); src.dispose();
      });
      // vỏ quán: phóng 1,25 lần, kéo rộng thêm theo chiều ngang (trần giữ nguyên); cụm bàn ghế: đúng cỡ, đặt theo CAFE_ROOM.model.groups
      const k = md.scale * md.stretch, shell = o.getObjectByName("shell");
      if (shell) { shell.scale.set(k, md.scale, k); shell.position.set(-md.ox * k - W / 2, 0, -md.oz * k - H / 2); }
      for (const gr of md.groups) { const n = o.getObjectByName(gr.id); if (n) { n.scale.setScalar(md.scale); n.position.set(wx(gr.x), 0, wz(gr.y)); } }
      scene.add(o); scene.remove(tmp); tmp.geometry.dispose();
    }, undefined, e => console.warn("Không nạp được mô hình quán", e));
    // đèn ấm trong quán
    for (const z of [-H / 4, H / 4]) { const warm = new THREE.PointLight(0xffc98a, 1.0, 16, 1.2); warm.position.set(0, 3.5, z); scene.add(warm); }
    // ghế ngồi được: hình trụ ẩn đặt đúng chỗ ghế trong mô hình để bấm chọn
    const pickGeo = new THREE.CylinderGeometry(0.32, 0.32, 1, 10), pickMat = new THREE.MeshBasicMaterial();
    CAFE_SEATS.forEach((se, i) => { const c = new THREE.Mesh(pickGeo, pickMat); c.scale.y = se.h + 0.3; c.position.set(wx(se.x), (se.h + 0.3) / 2, wz(se.y)); c.visible = false; c.userData.seat = i; scene.add(c); seatPick.push(c); });
  }

  /* ---------- Nhân vật ---------- */
  const shadowGeo = new THREE.PlaneGeometry(0.9, 0.9); shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false });
  const people = new Map(); // khoá: "me" hoặc số thứ tự n
  function addPerson(key, name, x, y, mine, gd) {
    if (people.has(key)) removePerson(key);
    const root = new THREE.Group(), m = characterMaterial(), body = new THREE.Mesh(characterGeometry(mine ? 7 : hash(name), mine || peerLook(gd), gd), m), sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.position.y = 0.05; root.add(sh, body); root.scale.setScalar(K); scene.add(root);
    const el = document.createElement("div"); el.className = "l3 av";
    el.innerHTML = '<div class="avt' + (mine ? " mine" : "") + '"><span class="bub"></span><span class="nm">' + esc(name) + (mine ? " (bạn)" : "") + "</span></div>";
    labels.appendChild(el);
    const a = { root, body, mat: m, el, x, y, tx: x, ty: y, face: 0, phase: Math.random() * 6, wave: 0, hop: 0 };
    people.set(key, a); return a;
  }
  function removePerson(key) {
    const a = people.get(key); if (!a) return;
    scene.remove(a.root); a.body.geometry.dispose(); a.mat.dispose(); a.el.remove(); people.delete(key);
  }
  function bubble(a, emo) { const b = a.el.querySelector(".bub"); b.textContent = emo; b.classList.add("on"); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("on"), 2200); a.wave = 1.6; a.hop = 1; }
  /** Bong bóng chat trên đầu (chữ nhỏ, hiện lâu hơn). */
  function sayBubble(a, text) {
    const b = a.el.querySelector(".bub"); b.innerHTML = '<span class="txt">' + esc(text.length > 60 ? text.slice(0, 59) + "…" : text) + "</span>";
    b.classList.add("on"); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("on"), 5000); a.talk = 5;
  }

  const me = addPerson("me", nick, R.door.x, R.door.y, true);
  me.face = CAFE ? 0 : Math.PI; // quay mặt vào phòng (gian: về phía màn hình lớn; quán: từ cửa nhìn vào trong)
  let target = null, sentAt = 0, sentX = -1, sentY = -1, mySeat = -1, pendingSeat = -1;
  const keys = {}, joy = { x: 0, y: 0 };
  const seatOcc = new Map(); // ghế -> khoá người ngồi ("me" hoặc n)

  /* ---------- Góc nhìn giống sảnh: thứ ba sát sau vai / thứ nhất; kéo để nhìn quanh ---------- */
  const VIEW = { eye: 0.98 * K, dist: 3.6 * (1 + (K - 1) / 2), side: 0.5 * K, height: 1.6 * K };
  let view = (() => { try { return localStorage.getItem("hc_view") === "first" ? "first" : "third"; } catch (e) { return "third"; } })();
  let yaw = CAFE ? 180 : 0, lookPitch = -8, viewBlend = view === "third" ? 1 : 0; // yaw 0: nhìn về tường có màn hình lớn

  // nút trên màn hình: đổi góc nhìn, cần điều khiển, Ngồi / Đứng dậy
  const ui = document.createElement("div"); ui.className = "room-ui";
  ui.innerHTML = '<button class="viewbtn rv" type="button" aria-label="Đổi góc nhìn"></button><div class="joy rj"><i></i></div><button class="sitp rs" type="button" hidden></button>';
  container.appendChild(ui);
  const vbtn = ui.querySelector(".rv"), joyEl = ui.querySelector(".rj"), knob = joyEl.firstElementChild, sitBtn = ui.querySelector(".rs");
  const drawView = () => { vbtn.innerHTML = view === "first" ? "👁️<span>Thứ nhất</span>" : "🎥<span>Thứ ba</span>"; };
  const toggleView = () => { view = view === "first" ? "third" : "first"; try { localStorage.setItem("hc_view", view); } catch (e) { /* bỏ qua */ } drawView(); };
  drawView(); vbtn.onclick = e => { e.stopPropagation(); toggleView(); };
  { let id = null, cx = 0, cy = 0; const R = 46;
    const mv = e => { let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } knob.style.transform = "translate(" + dx + "px," + dy + "px)"; joy.x = dx / R; joy.y = dy / R; };
    joyEl.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); id = e.pointerId; const r = joyEl.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { joyEl.setPointerCapture(id); } catch (_) { /* bỏ qua */ } mv(e); joyEl.classList.add("on"); });
    joyEl.addEventListener("pointermove", e => { if (e.pointerId === id) mv(e); });
    const end = e => { if (e.pointerId !== id) return; id = null; joy.x = joy.y = 0; knob.style.transform = ""; joyEl.classList.remove("on"); };
    joyEl.addEventListener("pointerup", end); joyEl.addEventListener("pointercancel", end); }

  /* ---------- Ghế (quán cà phê) ---------- */
  const canSit = game === "cafe" && !solo;
  let sitOk = false, sitSentAt = 0; // máy chủ đã xác nhận mình ngồi chưa (chưa thì gửi lại)
  function sitAt(i) { if (!canSit || i < 0) return; const o = seatOcc.get(i); if (o && o !== "me") return; pendingSeat = i; const se = CAFE_SEATS[i]; target = { x: se.x, y: se.y, seat: i, path: findPath(me.x, me.y, se.x, se.y) }; }
  /* Tìm đường vòng qua bàn, cột, đồ đạc (A* trên lưới 20 px), để chạm ghế hoặc chạm sàn ở xa không bị kẹt sau vật cản. */
  const GS = 20, GW = Math.ceil(R.w / GS), GH = Math.ceil(R.h / GS);
  let grid = null, gridObst = -1;
  function findPath(sx, sy, tx, ty) {
    if (!grid || gridObst !== OBST.length) { grid = new Uint8Array(GW * GH); gridObst = OBST.length; for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid[j * GW + i] = walkable(i * GS + GS / 2, j * GS + GS / 2) ? 1 : 0; }
    const cell = (x, y) => Math.max(0, Math.min(GW - 1, Math.floor(x / GS))) + Math.max(0, Math.min(GH - 1, Math.floor(y / GS))) * GW;
    const s0 = cell(sx, sy), t0 = cell(tx, ty);
    if (s0 === t0) return [];
    const g = new Float32Array(GW * GH).fill(1e9), from = new Int32Array(GW * GH).fill(-1), open = [s0], closed = new Uint8Array(GW * GH);
    const h = c => Math.hypot(c % GW - t0 % GW, ((c / GW) | 0) - ((t0 / GW) | 0));
    g[s0] = 0; let n = 0;
    while (open.length && n++ < 20000) {
      let bi = 0; for (let k = 1; k < open.length; k++) if (g[open[k]] + h(open[k]) < g[open[bi]] + h(open[bi])) bi = k;
      const c = open.splice(bi, 1)[0]; if (c === t0) break; if (closed[c]) continue; closed[c] = 1;
      const cx = c % GW, cy = (c / GW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= GW || y >= GH) continue;
        const nc = y * GW + x; if (!grid[nc] && nc !== t0) continue;
        if (dx && dy && (!grid[cy * GW + x] || !grid[y * GW + cx])) continue; // không lách chéo qua góc vật cản
        const ng = g[c] + (dx && dy ? 1.414 : 1); if (ng < g[nc]) { g[nc] = ng; from[nc] = c; open.push(nc); }
      }
    }
    if (from[t0] < 0) return [];
    const pts = []; for (let c = from[t0]; c !== s0 && c >= 0; c = from[c]) pts.push({ x: (c % GW) * GS + GS / 2, y: ((c / GW) | 0) * GS + GS / 2 });
    pts.reverse();
    // rút gọn: bỏ các điểm đi thẳng tới được
    const clear = (a, b) => { const d = Math.hypot(b.x - a.x, b.y - a.y), st = Math.ceil(d / 10); for (let k = 1; k < st; k++) if (!walkable(a.x + (b.x - a.x) * k / st, a.y + (b.y - a.y) * k / st)) return false; return true; };
    const out = []; let cur = { x: sx, y: sy };
    for (let k = 0; k < pts.length; k++) { const nx = pts[k + 1] || { x: tx, y: ty }; if (!clear(cur, nx)) { out.push(pts[k]); cur = pts[k]; } }
    return out;
  }
  function standUp() { if (mySeat < 0) return; seatOcc.delete(mySeat); mySeat = -1; send({ t: "msit", s: -1 }); }
  function nearestFreeSeat() { let best = -1, bd = 110; CAFE_SEATS.forEach((se, i) => { if (seatOcc.has(i)) return; const d = Math.hypot(se.x - me.x, se.y - me.y); if (d < bd) { bd = d; best = i; } }); return best; }
  sitBtn.onclick = e => { e.stopPropagation(); if (mySeat >= 0) standUp(); else sitAt(nearestFreeSeat()); };

  /* ---------- Điều khiển: kéo để nhìn, chạm sàn (hoặc ghế) để đi tới, W A S D / cần điều khiển, Shift chạy ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let down = null;
  const onDown = e => { down = { x: e.clientX, y: e.clientY, yaw, pitch: lookPitch, drag: false }; };
  const onMove = e => {
    if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y;
    if (!down.drag && Math.abs(dx) + Math.abs(dy) > 10) down.drag = true;
    if (down.drag) { yaw = down.yaw - dx * 0.3; lookPitch = Math.max(view === "first" ? -75 : -40, Math.min(view === "first" ? 75 : 35, down.pitch + dy * 0.25)); }
  };
  const onUp = e => {
    if (!down) return; const d = down; down = null; if (d.drag) return;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (canSit) { const h = ray.intersectObjects(seatPick, false)[0]; if (h) return sitAt(h.object.userData.seat); }
    if (ray.ray.intersectPlane(plane, hit)) { standUp(); pendingSeat = -1; const tx = Math.max(M, Math.min(R.w - M, hit.x * U + R.w / 2)), ty = Math.max(M, Math.min(R.h - M, hit.z * U + R.h / 2)); target = { x: tx, y: ty, path: walkable(tx, ty) ? findPath(me.x, me.y, tx, ty) : [] }; }
  };
  const onKey = e => {
    if (!active || e.target.tagName === "INPUT") return;
    const k = e.key.toLowerCase();
    if (e.type === "keydown" && !e.repeat && k === "v") return toggleView();
    if (e.type === "keydown" && !e.repeat && k === "e" && canSit) return sitBtn.onclick(e);
    keys[k] = e.type === "keydown";
  };
  renderer.domElement.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp);
  document.addEventListener("keydown", onKey); document.addEventListener("keyup", onKey);

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 62 : 52; camera.updateProjectionMatrix();
    if (css) css.setSize(w, h);
  }
  const ro = new ResizeObserver(resize); ro.observe(container);
  // Khung video (YouTube) gắn lên màn hình lớn bằng CSS 3D: phần tử HTML được biến đổi khớp đúng vị trí màn hình trong cảnh
  let css = null, cssObj = null;
  const VID_W = 640, VID_H = 360, VID_WORLD = SW; // 16:9, lấp đầy màn hình lớn của quán
  let cinema = false; // "Xem to": máy quay đứng trước màn hình, màn hình lấp gần kín khung nhìn
  resize();

  /* ---------- Vòng vẽ ---------- */
  let raf = 0, last = null, t = 0, active = true, closed = false, topView = false;
  const v3 = new THREE.Vector3(), look = new THREE.Vector3();
  let onCinema = null;
  function setCinemaInt(on) { cinema = on; ui.classList.toggle("cine", on); if (onCinema) onCinema(on); }
  function poseSeat(a, seat, dt) {
    const se = seat >= 0 ? CAFE_SEATS[seat] : null;
    a.sitAmt = (a.sitAmt || 0) + ((se ? 1 : 0) - (a.sitAmt || 0)) * Math.min(1, dt * 8);
    if (se) { a.lastSitH = se.h / K - 0.36; const dd = ((se.face - a.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a.face += dd * Math.min(1, dt * 12); }
    return (a.lastSitH || 0) * a.sitAmt;
  }
  function loop(ts) {
    const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000); last = ts; t += dt;
    // đi lại theo hướng máy quay
    const Y = yaw * Math.PI / 180, fx = -Math.sin(Y), fy = -Math.cos(Y), rx = Math.cos(Y), ry = -Math.sin(Y);
    const kx = Math.max(-1, Math.min(1, (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x)), ky = Math.max(-1, Math.min(1, (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joy.y));
    const ox = me.x, oy = me.y, n = Math.hypot(kx, ky);
    if (n > 0.15) {
      target = null; pendingSeat = -1; standUp(); if (cinema) setCinemaInt(false);
      const sp = SPEED * K * (keys.shift ? 1.6 : 1) * Math.min(1, n);
      me.x += (rx * kx - fx * ky) / n * sp * dt; me.y += (ry * kx - fy * ky) / n * sp * dt;
    } else if (target) {
      if (target.path && target.path.length) { // đi theo đường vòng
        const w = target.path[0], wd = Math.hypot(w.x - me.x, w.y - me.y);
        if (wd < 8) target.path.shift(); else { const k = Math.min(wd, SPEED * K * dt) / wd; me.x += (w.x - me.x) * k; me.y += (w.y - me.y) * k; }
      } else {
      const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy);
      if (d < 4) { if (target.seat != null && pendingSeat === target.seat && !seatOcc.has(target.seat)) { mySeat = target.seat; seatOcc.set(mySeat, "me"); sitOk = false; sitSentAt = ts; send({ t: "msit", s: mySeat }); } target = null; pendingSeat = -1; }
      else { const k = Math.min(d, SPEED * K * dt) / d; me.x += dx * k; me.y += dy * k; }
      if (target && target.seat != null && d < 70) { me.x = target.x; me.y = target.y; } // gần tới ghế: vào thẳng chỗ ngồi (ghế sát bàn không bị bàn chặn)
      }
    }
    me.x = Math.max(M, Math.min(R.w - M, me.x)); me.y = Math.max(M, Math.min(R.h - M, me.y));
    if (!walkable(me.x, me.y) && walkable(ox, oy)) { // chạm tường / quầy: trượt dọc theo một trục, không được thì đứng lại (đang kẹt trong vật cản thì cho đi ra)
      if (walkable(me.x, oy)) me.y = oy; else if (walkable(ox, me.y)) me.x = ox; else { me.x = ox; me.y = oy; }
      if (target && target.seat == null && Math.hypot(me.x - ox, me.y - oy) < 0.5) target = null;
    }
    if (mySeat >= 0 && !sitOk && ts - sitSentAt > 1200) { sitSentAt = ts; send({ t: "msit", s: mySeat }); } // máy chủ chưa nhận lệnh ngồi: gửi lại
    if (!solo && (Math.abs(me.x - sentX) > 2 || Math.abs(me.y - sentY) > 2) && ts - sentAt > 110) { sentAt = ts; sentX = me.x; sentY = me.y; send({ t: "mpos", x: Math.round(me.x), y: Math.round(me.y) }); }
    // nút Ngồi / Đứng dậy
    if (canSit) {
      const near = mySeat >= 0 ? -2 : (!target ? nearestFreeSeat() : -1), want = near === -2 ? "🚶 Đứng dậy" : near >= 0 ? "🪑 Ngồi" + (matchMedia("(hover: hover)").matches ? " <kbd>E</kbd>" : "") : "";
      if (sitBtn.dataset.w !== want) { sitBtn.dataset.w = want; sitBtn.innerHTML = want; sitBtn.hidden = !want; }
    }
    // nhân vật
    for (const [key, a] of people) {
      let dx, dy;
      if (key === "me") { dx = me.x - ox; dy = me.y - oy; }
      else { const px = a.x, py = a.y, d = Math.hypot(a.tx - a.x, a.ty - a.y); if (d > 600) { a.x = a.tx; a.y = a.ty; } else { const k = Math.min(1, dt * 10); a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; } dx = a.x - px; dy = a.y - py; }
      const seat = key === "me" ? mySeat : (a.seat ?? -1);
      const walking = seat < 0 && Math.abs(dx) + Math.abs(dy) > 0.3;
      a.root.position.set(wx(a.x), 0, wz(a.y));
      if (walking) { const want = Math.atan2(dx, dy), dd = ((want - a.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a.face += dd * Math.min(1, dt * 12); }
      const sitY = poseSeat(a, seat, dt);
      a.body.rotation.y = a.face; a.phase += dt * (walking ? 11 : 2.2); a.hop = Math.max(0, a.hop - dt * 2.5);
      a.body.position.y = (walking ? Math.abs(Math.cos(a.phase)) * 0.05 : 0) + Math.sin(a.hop * Math.PI) * 0.22 + sitY;
      a.body.position.x = -Math.sin(a.face) * 0.12 * (a.sitAmt || 0); a.body.position.z = -Math.cos(a.face) * 0.12 * (a.sitAmt || 0);
      animateCharacter(a, walking, dt);
    }
    // máy quay: thứ ba sát sau vai, hoặc thứ nhất ở mắt nhân vật; không lọt ra sau tường
    viewBlend += ((view === "third" ? 1 : 0) - viewBlend) * Math.min(1, dt * 8);
    const LP = lookPitch * Math.PI / 180, px = wx(me.x), pz = wz(me.y), eyeY = mySeat >= 0 ? CAFE_SEATS[mySeat].h + VIEW.eye * 0.62 : VIEW.eye;
    const back = VIEW.dist * Math.cos(LP * 0.6), up3 = VIEW.height - Math.sin(LP) * VIEW.dist * 0.55;
    let cx = px - fx * back * viewBlend + rx * VIEW.side * viewBlend, cy = eyeY + (Math.max(0.35, eyeY - VIEW.eye + up3) - eyeY) * viewBlend, cz = pz - fy * back * viewBlend + ry * VIEW.side * viewBlend;
    cx = Math.max(-W / 2 + 0.25, Math.min(W / 2 - 0.25, cx)); cz = Math.max(-H / 2 + 0.25, Math.min(H / 2 + (CAFE ? -0.25 : 6), cz)); cy = Math.min(CAFE ? 3.7 : RM && RM.ceil ? RM.ceil : 4.6, cy);
    if (R.walk && viewBlend > 0.01) { // quán: máy quay không lọt ra sau tường / ngoài kính — kéo lại gần nhân vật cho tới khi vào trong sàn
      const P = (k) => [(px + (cx - px) * k) * U + R.w / 2, (pz + (cz - pz) * k) * U + R.h / 2];
      const ok = k => { const [x, y] = P(k); if (!inPoly(x, y, R.walk)) return false; for (let i = 0, j = R.walk.length - 1; i < R.walk.length; j = i++) if (segDist(x, y, R.walk[i], R.walk[j]) < 35) return false; return !POSTS.some(c => Math.hypot(c.x - x, c.y - y) < c.r + 20); }; // chừa khoảng cách với tường, cột sát kính
      if (!ok(1)) { let lo = 0, hi = 1; for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; } cx = px + (cx - px) * lo; cz = pz + (cz - pz) * lo; }
    }
    const ahead = 3.6;
    look.set(px + fx * Math.cos(LP) * ahead + rx * VIEW.side * viewBlend * 0.5, eyeY + Math.sin(LP) * ahead + 0.15 * viewBlend, pz + fy * Math.cos(LP) * ahead + ry * VIEW.side * viewBlend * 0.5);
    if (cinema) { // xem to: đứng trước màn hình nhìn thẳng, lùi vừa đủ để màn hình lấp kín bề ngang khung nhìn
      const hf = Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect), d = Math.min((SW / 2 + 0.15) / Math.tan(hf), CAFE ? W - 1 : H + 5) + 0.1;
      cx = sC.x + sN.x * d; cy = SY; cz = sC.z + sN.z * d; look.copy(sC);
    }
    if (topView) { cx = 0; cy = Math.max(W, H) * 1.7; cz = 0.01; look.set(0, 0, 0); } // chụp thử từ trên xuống (window.__roomView(0, 0, 0, "top"))
    camera.position.set(cx, cy, cz);
    camera.lookAt(look);
    const tooClose = Math.hypot(cx - px, cz - pz) < 0.9 * K && !cinema; // máy quay bị tường đẩy sát người: ẩn nhân vật mình cho khỏi che hết
    me.root.visible = !(viewBlend < 0.25 || tooClose); me.el.style.display = viewBlend < 0.25 || tooClose ? "none" : "";
    for (const nt of notes) {
      nt.o.visible = musicOn;
      if (musicOn) { const k = (t * 0.45 + nt.p) % 1; nt.o.position.set(nt.sx * (SPX + Math.sin(k * 6 + nt.p * 9) * 0.3), SY + 0.3 + k * 1.2, 0.6 + k * 0.6); nt.o.material.opacity = 1 - k; }
    }
    for (const o of anim) { if (o.swing) o.o.rotation.z = Math.sin(t * 2.3 + o.p) * 0.12; else o.o.position.y = o.y + Math.sin(t * 2.4 + o.p) * 0.1; }
    const vidOn = !!(cssObj && cssObj.element.isConnected && !cssObj.element.hidden);
    screen.material = vidOn ? holeMat : scrMat;
    renderer.render(scene, camera);
    if (vidOn) css.render(scene, camera);
    // nhãn tên: chỉ hiện 10 người gần mình nhất (và người đang chào) cho đỡ rối
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const near = [...people.values()].sort((p1, p2) => Math.hypot(p1.x - me.x, p1.y - me.y) - Math.hypot(p2.x - me.x, p2.y - me.y));
    near.forEach((a, i) => {
      v3.set(a.root.position.x, (1.45 + (a.lastSitH || 0) * (a.sitAmt || 0)) * K, a.root.position.z).project(camera);
      a.talk = Math.max(0, (a.talk || 0) - dt);
      const on = (i <= NAME_MAX || a.wave > 0 || a.talk > 0) && v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2;
      a.el.style.visibility = on ? "visible" : "hidden";
      if (on) a.el.style.transform = "translate3d(" + Math.round((v3.x + 1) / 2 * w) + "px," + Math.round((1 - v3.y) / 2 * h) + "px,0)";
    });
    if (active) raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);
  // hỗ trợ chụp thử: đặt chỗ đứng, hướng nhìn, góc nhìn (giống window.__hubView ở sảnh)
  window.__roomSit = i => sitAt(i); // hỗ trợ kiểm thử: như chạm vào ghế i
  window.__roomDbg = () => ({ posters: posterMeshes.map(m => { const b = new THREE.Box3().setFromObject(m), c = b.getCenter(new THREE.Vector3()); return [Math.round(c.x * U + R.w / 2), Math.round(c.z * U + R.h / 2), +c.y.toFixed(1)]; }), mySeat, sitOk, me: [Math.round(me.x), Math.round(me.y)], peers: [...people].filter(([k]) => k !== "me").map(([k, a]) => [k, a.seat ?? -1, a.sitAmt || 0]) }); // hỗ trợ kiểm thử
  window.__roomView = (x, y, yw, v, p) => { if (v === "top") { topView = true; renderer.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), 5.0)]; return; } me.x = x; me.y = y; target = null; if (yw != null) yaw = yw; if (v) { view = v; viewBlend = v === "third" ? 1 : 0; drawView(); } if (p != null) lookPitch = p; };

  return {
    /** Tin "mspace": mình và những người đang ở trong gian. */
    setSpace(m) {
      for (const k of [...people.keys()]) if (k !== "me") removePerson(k);
      me.x = m.you.x; me.y = m.you.y; target = null; mySeat = -1; seatOcc.clear();
      for (const p of m.peers) { const a = addPerson(p.n, p.nick, p.x, p.y, false, p.gd); a.seat = p.seat ?? -1; if (a.seat >= 0) seatOcc.set(a.seat, p.n); }
    },
    addPeer(p) { const a = addPerson(p.n, p.nick, p.x, p.y, false, p.gd); a.seat = p.seat ?? -1; },
    removePeer(n) { for (const [s, k] of seatOcc) if (k === n) seatOcc.delete(s); removePerson(n); },
    /** Tin "msit": người số n ngồi ghế s (-1: đứng dậy). */
    sit(n, s, myN) {
      if (n === myN) { if (s >= 0 && s === mySeat) sitOk = true; if (s < 0 && mySeat >= 0 && sitOk) { seatOcc.delete(mySeat); mySeat = -1; } return; }
      const a = people.get(n); if (!a) return;
      if (a.seat >= 0 && seatOcc.get(a.seat) === n) seatOcc.delete(a.seat);
      a.seat = s; if (s >= 0) { seatOcc.set(s, n); if (mySeat === s) { mySeat = -1; } if (pendingSeat === s) { pendingSeat = -1; target = null; } }
    },
    /** Tin "msitno": ghế vừa có người khác ngồi. */
    sitRejected(s) { if (mySeat === s) { mySeat = -1; } if (seatOcc.get(s) === "me") seatOcc.delete(s); },
    movePeers(list, myN) { for (const [n, x, y] of list) { if (n === myN) continue; const a = people.get(n); if (a) { a.tx = x; a.ty = y; } } },
    emote(n, e) { const a = people.get(n); if (a && EMO[e]) bubble(a, EMO[e]); },
    /** Tin chat của người số n (myN: số của mình) hiện thành bong bóng trên đầu. */
    say(n, text, myN) { const a = n === myN ? me : people.get(n); if (a) sayBubble(a, text); },
    setMusicOn(on) { musicOn = on; },
    selfEmote(e) { bubble(me, EMO[e]); if (!solo) send({ t: "memote", e }); },
    /** Cập nhật màn hình lớn trên tường. */
    setScreen: drawScreen,
    setScreenVideo: drawVideoFrame,
    /** Xem to: máy quay đứng trước màn hình lớn (đi lại thì tự thoát). cb(on) báo khi tự thoát. */
    setCinema(on, cb) { onCinema = cb || onCinema; cinema = !!on; ui.classList.toggle("cine", cinema); },
    /** Đặt phần tử el (khung video 640×360) lên màn hình lớn trên tường. */
    attachScreen(el) {
      if (!css) { css = new CSS3DRenderer(); css.domElement.className = "css3"; container.insertBefore(css.domElement, renderer.domElement); /* nằm SAU khung vẽ 3D */ css.setSize(container.clientWidth || 1, container.clientHeight || 1); }
      if (cssObj) { sg.remove(cssObj); }
      el.style.width = VID_W + "px"; el.style.height = VID_H + "px";
      cssObj = new CSS3DObject(el); cssObj.scale.setScalar(VID_WORLD / VID_W); cssObj.position.set(0, SY, 0.12); sg.add(cssObj);
      el.style.pointerEvents = "none"; // CSS3DObject tự bật pointer-events: tắt đi để người chơi không bấm dừng / phát video
      return true;
    },
    count: () => people.size,
    /** Tạm dừng vẽ khi đang chơi (không tốn pin), vẽ lại khi quay về phòng. */
    setActive(on) { if (on === active) return; active = on; cancelAnimationFrame(raf); for (const k in keys) keys[k] = false; joy.x = joy.y = 0; if (on) { last = null; resize(); raf = requestAnimationFrame(loop); } },
    close() {
      cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener("keydown", onKey); document.removeEventListener("keyup", onKey);
      window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); ui.remove();
      for (const k of [...people.keys()]) removePerson(k);
      closed = true; if (cssObj) sg.remove(cssObj); if (css) css.domElement.remove();
      disposeTree(scene); renderer.dispose(); renderer.domElement.remove(); labels.remove();
    }
  };
}
