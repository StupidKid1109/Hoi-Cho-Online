// Gian 3: phần vẽ bằng Three.js. Chỉ vẽ theo trạng thái mô phỏng (g.sim), KHÔNG đổi luật mô phỏng:
// vị trí, va chạm, điểm đều do shared/runnerSim.js quyết định (máy chủ chạy lại đúng file đó).
import * as THREE from "three";
import { $ } from "../ui.js";
import { ROAD, OBSTACLES } from "../../../shared/runnerSim.js";
import { initialQuality } from "../gfx/webgl.js";
import { createRenderer, applyQuality, QualityWatch, setMaxAniso, canvasTex, glowTex, blobTex, rrect, fitText, mergeParts, waitFonts, FONT, EMOJI_FONT } from "../gfx/kit.js";

// Quy đổi tọa độ mô phỏng sang 3D: 80 đơn vị mô phỏng = 1 đơn vị Three.js; làn giữa ở x = 0; người chơi ở z = 0.
const S = 80, LANE_W = (ROAD.LANES[1] - ROAD.LANES[0]) / S;
const X = x => (x - ROAD.LANES[1]) / S, Z = y => (y - ROAD.PY) / S;
const ROAD_W = 3 * LANE_W + 0.2, WALK_W = 0.7, LEN = 44, NEAR = 6, FAR = NEAR - LEN;

let R = null; // renderer, cảnh và tài nguyên dùng lại giữa các lượt (tránh tạo nhiều ngữ cảnh WebGL)
let v = null; // trạng thái của lượt đang chơi

export function preload() { return waitFonts(); }

/* ---------------------------------------------------------------------
   DỰNG CẢNH (một lần)
   --------------------------------------------------------------------- */
function setup() {
  const q = initialQuality();
  const renderer = createRenderer(q); setMaxAniso(renderer);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe4ff);
  scene.fog = new THREE.Fog(0xd6eeff, 15, 30);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 120);
  R = { renderer, scene, camera, q, scroll: [], scenery: [], tpl: {}, labelTex: {}, ro: null, watch: null, t: 0 };
  R.watch = new QualityWatch(q, nq => { R.q = nq; applyQuality(renderer, nq); R.sun.castShadow = nq >= 1; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); }); resize(); });

  // bầu trời và đồi xa
  const skyGeo = new THREE.SphereGeometry(90, 24, 12), pos = skyGeo.attributes.position, col = new Float32Array(pos.count * 3);
  const top = new THREE.Color("#3d8ef0"), hor = new THREE.Color("#d6eeff"), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { const t = Math.max(0, pos.getY(i) / 90); c.copy(hor).lerp(top, Math.pow(t, 0.6)); col.set([c.r, c.g, c.b], i * 3); }
  skyGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  scene.add(sky); R.sky = sky;
  const hills = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const a = (i / 14 - 0.5) * Math.PI * 1.1, r = 70;
    const h = new THREE.Mesh(new THREE.SphereGeometry(10 + (i * 7) % 9, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x8cc777 : 0x74b562, fog: false, toneMapped: false }));
    h.position.set(Math.sin(a) * r, -1, -Math.cos(a) * r); h.scale.y = 0.45 + (i % 3) * 0.12; hills.add(h);
  }
  scene.add(hills);
  // mây
  for (let i = 0; i < 6; i++) {
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex(), fog: false, transparent: true, depthWrite: false, opacity: 0.9 }));
    cl.position.set(-30 + i * 12 + Math.random() * 4, 14 + Math.random() * 8, -60 - Math.random() * 10); cl.scale.set(16, 6, 1); scene.add(cl);
  }

  // ánh sáng
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f4a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(-4, 10, 4); sun.target.position.set(0, 0, -5);
  sun.castShadow = q >= 1; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 12; sc.bottom = -8; sc.near = 1; sc.far = 30;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target); R.sun = sun;

  buildRoad(scene);
  buildScenery(scene);
  buildTemplates();
  buildPlayer(scene);

  // hạt lấp lánh khi nhặt đồ
  const n = 60, sp = new Float32Array(n * 3), scol = new Float32Array(n * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sg.setAttribute("color", new THREE.BufferAttribute(scol, 3));
  const spark = new THREE.Points(sg, new THREE.PointsMaterial({ map: glowTex(), size: 0.35, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  spark.frustumCulled = false; scene.add(spark);
  R.spark = { pts: spark, list: Array.from({ length: n }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() })), next: 0 };

  R.ro = new ResizeObserver(resize);
}

function cloudTex() {
  return R.cloud || (R.cloud = canvasTex(256, 96, g => {
    g.fillStyle = "#fff";
    [[60, 60, 34], [110, 46, 42], [160, 58, 36], [200, 66, 26], [90, 70, 28]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  }, { keep: true }));
}

function resize() {
  if (!R) return;
  const el = $("road"), w = el.clientWidth || 1, h = el.clientHeight || 1;
  R.renderer.setSize(w, h, false);
  R.camera.aspect = w / h; R.camera.fov = w / h < 0.8 ? 58 : 46; R.camera.updateProjectionMatrix();
}

/* ---------- Mặt đường, vỉa hè, cỏ (cuộn bằng cách dịch kết cấu) ---------- */
function scrollPlane(scene, w, x, tex, tile, y = 0) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, LEN / tile);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, LEN), new THREE.MeshLambertMaterial({ map: tex }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, (NEAR + FAR) / 2); m.receiveShadow = true; scene.add(m);
  R.scroll.push({ tex, tile });
  return m;
}
function buildRoad(scene) {
  const lane = LANE_W / ROAD_W; // tỉ lệ một làn trên bề rộng đường
  const asphalt = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#3b3f4a"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) { g.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.12)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = "#f4f1e8"; const edge = 0.05 * w / ROAD_W; g.fillRect(edge, 0, 5, h); g.fillRect(w - edge - 5, 0, 5, h);
    g.fillStyle = "rgba(255,255,255,.9)";
    for (const k of [1, 2]) { const x = (0.1 / ROAD_W + k * lane) * w; g.fillRect(x - 3, 0, 6, h * 0.5); }
  });
  scrollPlane(scene, ROAD_W, 0, asphalt, 3.2);
  const walk = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = "#d9d4c7"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(90,80,60,.35)"; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2);
  });
  for (const sx of [-1, 1]) {
    const t = walk.clone(); t.needsUpdate = true;
    scrollPlane(scene, WALK_W, sx * (ROAD_W / 2 + WALK_W / 2), t, 0.7, 0.06);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, LEN), new THREE.MeshLambertMaterial({ color: 0xb8b2a2 }));
    curb.position.set(sx * (ROAD_W / 2 + 0.04), 0.05, (NEAR + FAR) / 2); curb.receiveShadow = true; scene.add(curb);
  }
  const grass = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = "#6fae4f"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = Math.random() < .5 ? "rgba(40,90,35,.3)" : "rgba(170,220,110,.25)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 4); }
  });
  grass.repeat.set(10, 1);
  const gm = scrollPlane(scene, 60, 0, grass, 4, -0.01);
  grass.repeat.set(15, LEN / 4);
  gm.renderOrder = -1;
}

/* ---------- Nhà ống, cây, cột đèn hai bên đường ---------- */
const HOUSE_COLORS = ["#f4d35e", "#ee964b", "#f95738", "#83c5be", "#ffddd2", "#b8e0d2", "#e9c46a", "#a3c4f3"];
function houseGeo(i) {
  const c = HOUSE_COLORS[i % HOUSE_COLORS.length], h = 1.8 + (i * 13 % 5) * 0.35, w = 1.5, d = 1.6;
  const parts = [
    [new THREE.BoxGeometry(d, h, w), c, 0, h / 2, 0],
    [new THREE.BoxGeometry(d + 0.15, 0.14, w + 0.1), "#7a3b2e", 0, h + 0.07, 0],
    [new THREE.BoxGeometry(0.05, 0.55, 0.5), "#2b4a6f", d / 2 + 0.01, 0.4, -0.3],                 // cửa
    [new THREE.BoxGeometry(0.05, 0.4, 0.38), "#cfe8ff", d / 2 + 0.01, h - 0.55, 0.3],             // cửa sổ
    [new THREE.BoxGeometry(0.05, 0.4, 0.38), "#cfe8ff", d / 2 + 0.01, h - 0.55, -0.3],
    [new THREE.BoxGeometry(0.35, 0.06, w), "#ffffff", d / 2 + 0.17, h - 0.85, 0],                  // ban công
    [new THREE.BoxGeometry(0.04, 0.28, w), "#ffffff", d / 2 + 0.33, h - 0.7, 0]
  ];
  if (i % 3 === 0) parts.push([new THREE.BoxGeometry(0.05, 0.3, 1.2), ["#c8102e", "#0f8a5f", "#2563eb"][i % 3 === 0 ? (i / 3) % 3 : 0], d / 2 + 0.03, 1.05, 0]); // biển hiệu
  const g = mergeParts(parts); parts.forEach(p => p[0].dispose()); return g;
}
function treeGeo(i) {
  const g = mergeParts([
    [new THREE.CylinderGeometry(0.07, 0.1, 0.8, 6), "#6b4423", 0, 0.4, 0],
    [new THREE.IcosahedronGeometry(0.55, 0), i % 2 ? "#3f8f3a" : "#4fa14a", 0, 1.05, 0],
    [new THREE.IcosahedronGeometry(0.38, 0), i % 2 ? "#57a84f" : "#2f7d32", 0.12, 1.45, 0.05]
  ]);
  return g;
}
function lampGeo() {
  return mergeParts([
    [new THREE.CylinderGeometry(0.04, 0.05, 2.2, 6), "#4a4f5a", 0, 1.1, 0],
    [new THREE.BoxGeometry(0.5, 0.04, 0.06), "#4a4f5a", 0.22, 2.18, 0],
    [new THREE.BoxGeometry(0.2, 0.08, 0.14), "#fff3c4", 0.44, 2.13, 0]
  ]);
}
function buildScenery(scene) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const lamp = lampGeo();
  const add = (geo, x, z, ry, keepGeo) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, 0, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
    if (keepGeo) m.userData.sharedGeo = true; scene.add(m); R.scenery.push(m);
  };
  const edge = ROAD_W / 2 + WALK_W;
  for (let k = 0; k < 12; k++) { // nhà hai bên, mặt nhà quay ra đường
    const z = NEAR - k * (LEN / 12) - 1;
    add(houseGeo(k * 2), -(edge + 1.6), z, 0); add(houseGeo(k * 2 + 1), edge + 1.6, z, Math.PI);
  }
  for (let k = 0; k < 9; k++) { const z = NEAR - k * (LEN / 9) - 2.5; add(treeGeo(k), (k % 2 ? 1 : -1) * (edge - 0.3), z, 0); }
  for (let k = 0; k < 6; k++) { const z = NEAR - k * (LEN / 6) - 0.5; add(lamp, (k % 2 ? -1 : 1) * (edge - 0.3), z, k % 2 ? 0 : Math.PI, true); }
}

/* ---------- Mẫu vật cản, vật phẩm ---------- */
function buildTemplates() {
  const P = mergeParts, B = (w, h, d) => new THREE.BoxGeometry(w, h, d), C = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n), Sp = (r, n = 10) => new THREE.SphereGeometry(r, n, n - 2);
  const stripes = (n, w, h, y, a, b) => Array.from({ length: n }, (_, i) => [B(w / n, h, 0.08), i % 2 ? a : b, -w / 2 + (i + 0.5) * w / n, y, 0]);
  const flag = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) flag.push([B(0.16, 0.16, 0.03), (r + c) % 2 ? "#111111" : "#ffffff", 0.12 + c * 0.16, 1.1 + r * 0.16, 0]);
  const obs = [
    // 0 Rượu bia: két bia và chai
    P([[B(0.9, 0.35, 0.6), "#c8102e", 0, 0.18, 0], [C(0.09, 0.11, 0.55), "#2d6a1f", -0.22, 0.62, 0], [C(0.035, 0.07, 0.22), "#2d6a1f", -0.22, 1.0, 0], [C(0.09, 0.11, 0.55), "#8a4b08", 0.05, 0.62, 0.05], [C(0.035, 0.07, 0.22), "#8a4b08", 0.05, 1.0, 0.05], [C(0.09, 0.11, 0.55), "#2d6a1f", 0.3, 0.62, -0.05], [C(0.035, 0.07, 0.22), "#2d6a1f", 0.3, 1.0, -0.05], [B(0.6, 0.12, 0.62), "#ffcc33", 0, 0.2, 0.01]]),
    // 1 Đèn đỏ: cột đèn tín hiệu, đèn đỏ sáng
    P([[C(0.05, 0.06, 1.6, 8), "#3a3d45", 0, 0.8, 0], [B(0.34, 0.9, 0.24), "#1d1f24", 0, 1.75, 0], [Sp(0.1), "#ff2b2b", 0, 2.03, 0.1], [Sp(0.09), "#5a4a10", 0, 1.75, 0.1], [Sp(0.09), "#163a1a", 0, 1.47, 0.1], [B(1.2, 0.05, 0.25), "#ffffff", 0, 0.03, 0.5]]),
    // 2 Điện thoại: điện thoại khổng lồ
    P([[B(0.62, 1.15, 0.1), "#1d1f24", 0, 0.75, 0], [B(0.54, 1.0, 0.02), "#3a86ff", 0, 0.76, 0.06], [B(0.2, 0.04, 0.02), "#111111", 0, 1.22, 0.07], [B(0.4, 0.12, 0.02), "#06d6a0", 0, 0.95, 0.075], [B(0.4, 0.12, 0.02), "#ffffff", 0, 0.75, 0.075], [B(0.12, 0.35, 0.3), "#555", 0, 0.17, -0.12, -0.4]]),
    // 3 Thi công: rào chắn sọc và cọc tiêu
    P([...stripes(6, 1.1, 0.2, 0.75, "#ffffff", "#ff7a00"), [B(0.06, 0.8, 0.06), "#666", -0.45, 0.4, 0], [B(0.06, 0.8, 0.06), "#666", 0.45, 0.4, 0], [C(0.02, 0.17, 0.5), "#ff7a00", -0.55, 0.25, 0.35], [C(0.09, 0.12, 0.08), "#ffffff", -0.55, 0.25, 0.35], [C(0.02, 0.17, 0.5), "#ff7a00", 0.55, 0.25, 0.35], [C(0.09, 0.12, 0.08), "#ffffff", 0.55, 0.25, 0.35]]),
    // 4 Ngược chiều: biển cấm đi ngược chiều
    P([[C(0.04, 0.04, 1.3, 8), "#9aa0a8", 0, 0.65, 0], [C(0.42, 0.42, 0.06, 24), "#d62828", 0, 1.5, 0, Math.PI / 2], [B(0.55, 0.12, 0.08), "#ffffff", 0, 1.5, 0.02], [C(0.45, 0.45, 0.04, 24), "#ffffff", 0, 1.5, -0.03, Math.PI / 2]]),
    // 5 Đua xe: cờ ca-rô và chồng lốp
    P([[C(0.025, 0.025, 1.7, 6), "#cccccc", 0, 0.85, 0], ...flag, [new THREE.TorusGeometry(0.22, 0.09, 6, 14), "#1b1b1b", -0.4, 0.09, 0.1, Math.PI / 2], [new THREE.TorusGeometry(0.22, 0.09, 6, 14), "#1b1b1b", -0.4, 0.27, 0.1, Math.PI / 2], [new THREE.TorusGeometry(0.22, 0.09, 6, 14), "#e63946", -0.4, 0.45, 0.1, Math.PI / 2]])
  ];
  const vmat = new THREE.MeshLambertMaterial({ vertexColors: true });
  R.tpl.obs = obs.map(geo => ({ geo, mat: vmat }));
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc533, metalness: 0.55, roughness: 0.3, emissive: 0x6b4a00, emissiveIntensity: 0.35 });
  const coin = new THREE.CylinderGeometry(0.28, 0.28, 0.07, 20); coin.rotateX(Math.PI / 2);
  const star = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.16 : 0.38; i ? star.lineTo(Math.cos(a) * r, Math.sin(a) * r) : star.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const starGeo = new THREE.ExtrudeGeometry(star, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 }); starGeo.center();
  const helmet = P([[new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), "#ffd23f", 0, 0, 0], [new THREE.CylinderGeometry(0.32, 0.32, 0.03, 18), "#ffd23f", 0, 0.01, 0], [new THREE.SphereGeometry(0.31, 14, 6, -Math.PI / 2.6, Math.PI / 1.3, Math.PI / 3.2, Math.PI / 5), "#2b2d42", 0, 0, 0], [B(0.5, 0.06, 0.04), "#e63946", 0, 0.24, 0, 0, 0, 0]]);
  R.tpl.coin = { geo: coin, mat: gold };
  R.tpl.star = { geo: starGeo, mat: new THREE.MeshStandardMaterial({ color: 0xffd93d, metalness: 0.3, roughness: 0.35, emissive: 0x8a6a00, emissiveIntensity: 0.4 }) };
  R.tpl.helmet = { geo: helmet, mat: vmat };
  R.tpl.shadow = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false });
  R.tpl.shadowGeo = new THREE.PlaneGeometry(1, 1); R.tpl.shadowGeo.rotateX(-Math.PI / 2);
}

/** Biển chữ đỏ trên vật cản, ví dụ "🍺 Rượu bia". */
function labelTex(ob) {
  if (R.labelTex[ob]) return R.labelTex[ob];
  const [e, name] = OBSTACLES[ob];
  return (R.labelTex[ob] = canvasTex(512, 144, (g, w, h) => {
    g.fillStyle = "#dc2626"; rrect(g, 6, 12, w - 12, h - 24, 54); g.fill();
    g.strokeStyle = "#ffffff"; g.lineWidth = 8; rrect(g, 12, 18, w - 24, h - 36, 48); g.stroke();
    g.textBaseline = "middle"; g.textAlign = "left";
    g.font = "72px " + EMOJI_FONT; g.fillText(e, 34, h / 2 + 5);
    g.fillStyle = "#ffffff"; g.textAlign = "center"; fitText(g, name, 300, h / 2 + 3, 300, 64, 900);
  }, { keep: true }));
}

/* ---------- Xe máy và người lái đội mũ bảo hiểm ---------- */
function buildPlayer(scene) {
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d), C = (rt, rb, h, n = 12) => new THREE.CylinderGeometry(rt, rb, h, n);
  const wheel = () => new THREE.TorusGeometry(0.17, 0.07, 8, 16);
  const geo = mergeParts([
    [wheel(), "#1b1b1b", 0, 0.24, -0.5, 0, Math.PI / 2], [wheel(), "#1b1b1b", 0, 0.24, 0.5, 0, Math.PI / 2],
    [C(0.07, 0.07, 0.1, 10), "#c0c4cc", 0, 0.24, -0.5, 0, 0, Math.PI / 2], [C(0.07, 0.07, 0.1, 10), "#c0c4cc", 0, 0.24, 0.5, 0, 0, Math.PI / 2],
    [B(0.34, 0.12, 0.7), "#2563eb", 0, 0.36, 0.05],                       // sàn để chân
    [B(0.36, 0.38, 0.42), "#2563eb", 0, 0.55, 0.38],                      // thân sau
    [B(0.3, 0.1, 0.5), "#1d1f24", 0, 0.78, 0.32],                          // yên
    [B(0.32, 0.62, 0.14), "#2563eb", 0, 0.62, -0.42, 0.25],               // ốp trước
    [B(0.2, 0.1, 0.06), "#fff7c2", 0, 0.82, -0.5],                         // đèn pha
    [C(0.025, 0.025, 0.62, 6), "#c0c4cc", 0, 1.0, -0.42, 0, 0, Math.PI / 2], // ghi đông
    [B(0.12, 0.08, 0.04), "#ff3b3b", 0, 0.62, 0.6],                        // đèn hậu
    // người lái
    [C(0.12, 0.15, 0.42, 10), "#e63946", 0, 1.08, 0.18, -0.2],             // thân
    [C(0.07, 0.07, 0.42, 8), "#264653", -0.13, 0.85, 0.0, 1.3], [C(0.07, 0.07, 0.42, 8), "#264653", 0.13, 0.85, 0.0, 1.3], // đùi
    [C(0.045, 0.045, 0.4, 6), "#e63946", -0.2, 1.08, -0.18, 1.1, 0, 0.15], [C(0.045, 0.045, 0.4, 6), "#e63946", 0.2, 1.08, -0.18, 1.1, 0, -0.15], // tay
    [new THREE.SphereGeometry(0.15, 12, 10), "#f1c7a4", 0, 1.42, 0.1],     // đầu
    [new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), "#ffd23f", 0, 1.45, 0.12], // mũ bảo hiểm
    [B(0.3, 0.05, 0.03), "#e63946", 0, 1.56, 0.12]                         // sọc mũ
  ]);
  const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  body.castShadow = true;
  const sh = new THREE.Mesh(R.tpl.shadowGeo, R.tpl.shadow); sh.scale.set(0.8, 1, 1.5); sh.position.y = 0.02;
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.95, 20, 14), new THREE.MeshBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  bubble.position.y = 0.8; bubble.visible = false;
  const root = new THREE.Group(); root.add(sh, body, bubble); scene.add(root);
  R.player = { root, body, bubble };
}

/* ---------------------------------------------------------------------
   GIAO DIỆN PHẦN VẼ (runner.js gọi)
   --------------------------------------------------------------------- */
export function init() {
  if (!R) setup();
  const road = $("road");
  road.classList.add("gl");
  if (!R.renderer.domElement.parentNode) { road.insertBefore(R.renderer.domElement, road.firstChild); R.ro.observe(road); }
  // phần tử ẩn theo vị trí xe trên màn hình: main.js dùng để biết chạm bên trái hay bên phải xe
  let tap = $("g3p");
  if (!tap || !tap.classList.contains("g3tap")) { if (tap) tap.remove(); tap = document.createElement("div"); tap.id = "g3p"; tap.className = "g3tap"; tap.innerHTML = '<span class="e"></span>'; road.appendChild(tap); }
  $("rplane").querySelectorAll(".ro3").forEach(e => e.remove());
  if (v) { v.objs.forEach(o => R.scene.remove(o.root)); v.debris.forEach(b => R.scene.remove(b.root)); R.spark.list.forEach(p => { p.life = 0; }); }
  v = { objs: new Map(), debris: [], shake: 0, last: null, raf: 0, camX: 0 };
  R.player.root.position.set(0, 0, 0); R.player.body.rotation.set(0, 0, 0);
  resize();
}
export function stop() { /* vòng vẽ do runner.js điều khiển: không vẽ thêm khi đã dừng */ }

const LABEL_Y = [1.65, 2.55, 1.75, 1.45, 2.3, 2.05]; // độ cao biển chữ theo từng loại vật cản
export function spawn(o) {
  const root = new THREE.Group();
  let mesh;
  if (o.kind === "obs") {
    const t = R.tpl.obs[o.ob]; mesh = new THREE.Mesh(t.geo, t.mat); mesh.castShadow = true;
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(o.ob), transparent: true, depthWrite: false }));
    lab.scale.set(1.9, 0.53, 1); lab.position.y = LABEL_Y[o.ob]; root.add(lab);
  } else {
    const t = R.tpl[o.kind]; mesh = new THREE.Mesh(t.geo, t.mat); mesh.castShadow = true; mesh.position.y = 0.55;
    if (o.kind === "helmet") mesh.position.y = 0.45;
  }
  const sh = new THREE.Mesh(R.tpl.shadowGeo, R.tpl.shadow); sh.scale.set(o.kind === "obs" ? 1.2 : 0.6, 1, o.kind === "obs" ? 0.8 : 0.6); sh.position.y = 0.03;
  root.add(sh, mesh);
  root.position.set(X(ROAD.LANES[o.lane]), 0, Z(o.y));
  R.scene.add(root);
  v.objs.set(o.id, { root, mesh, kind: o.kind, spin: Math.random() * 6 });
}

export function remove(o, type) {
  const it = v.objs.get(o.id); if (!it) return;
  v.objs.delete(o.id);
  if (type === "hit" || type === "shield") { // vật cản bị tông văng ra
    const side = Math.random() < 0.5 ? -1 : 1;
    v.debris.push({ root: it.root, vel: new THREE.Vector3(side * 3, 4, -2), spin: new THREE.Vector3(3 * side, 2, 5), life: 0.8 });
    v.shake = type === "hit" ? 0.35 : 0.15;
    return;
  }
  if (type === "coin" || type === "star" || type === "helmet") sparkle(it.root.position, type === "coin" ? 0xffd166 : type === "star" ? 0xfff3a0 : 0x7dd3fc);
  R.scene.remove(it.root);
}

function sparkle(p, color) {
  const S = R.spark, c = new THREE.Color(color);
  for (let i = 0; i < 14; i++) {
    const s = S.list[S.next]; S.next = (S.next + 1) % S.list.length;
    s.life = 0.6; s.p.set(p.x, 0.6, p.z); s.v.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2); s.c.copy(c);
  }
}

const tmp = new THREE.Vector3();
export function frame(g, dt, mv) {
  const s = g.sim, d = mv / S;
  R.t += dt;
  R.watch.tick(dt);
  // cuộn mặt đường và cảnh hai bên
  for (const sc of R.scroll) sc.tex.offset.y += d / sc.tile;
  for (const m of R.scenery) { m.position.z += d; if (m.position.z > NEAR + 1) m.position.z -= LEN; }
  // vật cản và vật phẩm theo đúng vị trí mô phỏng
  for (const o of s.objs) {
    const it = v.objs.get(o.id); if (!it) continue;
    it.root.position.set(X(ROAD.LANES[o.lane]), 0, Z(o.y));
    const grow = Math.min(1, 0.3 + (o.y - ROAD.SPAWN) / 260); it.root.scale.setScalar(grow);
    if (it.kind !== "obs") { it.spin += dt * 3.2; it.mesh.rotation.y = it.spin; it.mesh.position.y = 0.55 + Math.sin(it.spin * 1.3) * 0.08; }
  }
  // vật bị tông văng
  for (let i = v.debris.length - 1; i >= 0; i--) {
    const b = v.debris[i]; b.life -= dt; b.vel.y -= 14 * dt;
    b.root.position.addScaledVector(b.vel, dt); b.root.position.z += d;
    b.root.rotation.x += b.spin.x * dt; b.root.rotation.z += b.spin.z * dt;
    if (b.life <= 0) { R.scene.remove(b.root); v.debris.splice(i, 1); }
  }
  // xe
  const P = R.player, px = X(g.px);
  P.root.position.x = px;
  P.body.rotation.z = -g.tilt * Math.PI / 180 * 0.9;
  P.body.position.y = Math.sin(R.t * 18) * 0.012;
  P.bubble.visible = !!s.shield; if (s.shield) P.bubble.scale.setScalar(1 + Math.sin(R.t * 6) * 0.04);
  P.body.visible = !(s.inv > 0 && Math.floor(R.t * 12) % 2);
  // hạt lấp lánh
  const SP = R.spark, pa = SP.pts.geometry.attributes.position, ca = SP.pts.geometry.attributes.color;
  SP.list.forEach((p, i) => {
    if (p.life > 0) { p.life -= dt; p.v.y -= 6 * dt; p.p.addScaledVector(p.v, dt); p.p.z += d; }
    const f = Math.max(0, p.life / 0.6); pa.setXYZ(i, p.p.x, p.p.y, p.p.z); ca.setXYZ(i, p.c.r * f, p.c.g * f, p.c.b * f);
  });
  pa.needsUpdate = true; ca.needsUpdate = true;
  // máy quay bám nhẹ theo xe, rung khi va chạm
  v.camX += (px * 0.45 - v.camX) * Math.min(1, dt * 6);
  v.shake = Math.max(0, v.shake - dt);
  const sh = v.shake * 0.5;
  R.camera.position.set(v.camX + (Math.random() - 0.5) * sh, 3.3 + (Math.random() - 0.5) * sh, 5.1);
  R.camera.lookAt(v.camX * 0.6, 0.2, -8);
  R.sky.position.copy(R.camera.position);
  R.renderer.render(R.scene, R.camera);
  // vị trí xe trên màn hình cho thao tác chạm
  tmp.set(px, 0.6, 0).project(R.camera);
  const tap = $("g3p"); if (tap) { const e = tap.firstChild, x = (tmp.x + 1) / 2 * R.renderer.domElement.clientWidth; e.style.left = (x - 30).toFixed(0) + "px"; }
}
