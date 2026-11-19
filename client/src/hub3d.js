// Sảnh hội chợ 3D bằng Three.js: ánh sáng hoàng hôn, bóng đổ, gian hàng, nhân vật, đèn lồng, pháo hoa.
// Giữ nguyên giao diện hàm của bản CSS 3D (hubCss.js) để main.js không phải đổi.
// Tọa độ thế giới tính theo "px" của sân (shared/world.js, dùng chung với máy chủ); 100 px = 1 đơn vị Three.js.
import * as THREE from "three";
import { $, esc, beep } from "./ui.js";
import { BOOTHS, PLACE_NAME } from "./config.js";
import { EMOTES } from "./hubCss.js";
import { initialQuality } from "./gfx/webgl.js";
import {
  createRenderer, applyQuality, QualityWatch, setMaxAniso, canvasTex, emojiSprite, blobTex, glowTex,
  rrect, fitText, mergeParts, disposeTree, waitFonts, FONT
} from "./gfx/kit.js";
import { characterGeometry, characterMaterial, animateCharacter } from "./gfx/character.js";
import { loadKit, hasKit, model } from "./gfx/models.js";
import { WORLD, CENTER, GATE, SPAWN, SPOTS, LOCKED, BLOCK as WORLD_BLOCK, BENCHES, TABLES, SEATS, PLAZA_R, FAIR_R, standPoint } from "../../shared/world.js";

export { EMOTES };

const FW = WORLD, CX = CENTER.x, CY = CENTER.y, U = 100; // 100 px = 1 đơn vị Three.js
const BLOCK = WORLD_BLOCK.map(b => b.slice()); // thêm vật cản trang trí khi dựng cảnh
const SPEED = 360; // px/giây
const wx = x => (x - CX) / U, wz = y => (y - CY) / U;
const DEG = Math.PI / 180;

// Máy quay: khoảng cách và góc ngẩng (độ) cho 3 trạng thái
const CAM_NORMAL = { dist: 8.2, pitch: 33 }, CAM_BOOTH = { dist: 4.4, pitch: 17 }, CAM_INTRO = { dist: 26, pitch: 62 };

const me = { x: SPAWN.x, y: SPAWN.y };
const cam = { x: SPAWN.x, y: SPAWN.y, yaw: 0, dist: CAM_INTRO.dist, pitch: CAM_INTRO.pitch, look: 0 };
const camT = { dist: CAM_NORMAL.dist, pitch: CAM_NORMAL.pitch, yaw: null, look: 0 };
let target = null, onArrive = null, zoomCb = null, raf = 0, last = null, keys = {}, moved = false, sentAt = 0, sentX = 0, sentY = 0, stuck = 0;
let ctx = null, peers = new Map(), hidden = new Set();
let mySeat = -1; const seatOcc = new Map(); // chỗ ngồi -> "me" hoặc mã người chơi
let G = null; // mọi thứ thuộc về cảnh Three.js hiện tại

/** Nạp trước phông chữ để vẽ biển hiệu. main.js gọi qua hub.prepareHub() lúc đang tải. */
export function preload() { return Promise.all([waitFonts(), loadKit()]); }

/* =====================================================================
   DỰNG CẢNH
   ===================================================================== */
export function buildHub(context) {
  ctx = context; peers = new Map(); hidden = new Set(ctx.hidden || []);
  if (G) dispose();
  const q = initialQuality();
  const renderer = createRenderer(q); // ném lỗi nếu không có WebGL: hub.js sẽ quay về bản CSS 3D
  setMaxAniso(renderer);
  const vp = $("viewport");
  vp.classList.add("gl");
  vp.insertBefore(renderer.domElement, vp.firstChild);
  const labels = document.createElement("div"); labels.id = "lbl3"; labels.className = "lbl3"; vp.insertBefore(labels, renderer.domElement.nextSibling);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xe9967a, 24, 62);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
  const hiddenBox = document.createElement("div"); hiddenBox.hidden = true; hiddenBox.className = "hid3"; labels.appendChild(hiddenBox);
  G = { renderer, scene, camera, labels, hiddenBox, observers: [], q, occ: [], pick: [], anim: [], lanterns: null, fw: null, marker: null, avatars: new Map(), sun: null, watch: null, ro: null, t: 0 };
  G.watch = new QualityWatch(q, nq => { G.q = nq; applyQuality(renderer, nq); setShadows(nq >= 1); resize(); });

  buildSky(scene);
  buildLights(scene, q);
  buildGround(scene);
  buildTrees(scene);
  buildLanterns(scene);
  buildGate(scene);
  const kit = hasKit();
  BOOTHS.forEach(b => (kit ? buildStallKit : buildStall)(scene, b));
  LOCKED.forEach(l => (kit ? buildLockedKit : buildLocked)(scene, l.x, l.y, l.r, l.name, l.id));
  if (kit) buildDecor(scene);
  buildSeating(scene, kit);
  buildBoard(scene);
  buildFireworks(scene);
  buildMarker(scene);
  buildSeatPrompt(scene);
  addAvatar("avo", ctx.nick + " (bạn)", 7, true);
  setShadows(q >= 1);

  // nút nhảy nhanh và biểu cảm (giống bản CSS)
  $("jumps").innerHTML = BOOTHS.map(b => '<button data-j="' + b.id + '"><i>' + b.icons.slice(0, 2) + "</i>" + b.tag + "</button>").join("") + '<button data-j="board"><i>🏆</i>Bảng vàng</button><button id="sitBtn"><i>🪑</i>Ngồi</button>';
  $("jumps").querySelectorAll("button[data-j]").forEach(btn => btn.onclick = () => goTo(btn.dataset.j));
  $("sitBtn").onclick = () => (mySeat >= 0 ? standUp() : sitNearest());
  $("hint3").textContent = "Chạm mặt đất để đi · Kéo để xoay · Chạm ghế để ngồi";
  mySeat = -1; seatOcc.clear(); me.x = SPAWN.x; me.y = SPAWN.y;
  $("emo").innerHTML = EMOTES.map((e, i) => '<button data-e="' + i + '"><i>' + e[0] + "</i>" + e[1] + "</button>").join("");
  $("emo").querySelectorAll("button").forEach(btn => btn.onclick = () => { const i = +btn.dataset.e; bubble("avo", EMOTES[i][0]); hop("avo"); beep("coin"); ctx.send({ t: "emote", e: i }); ctx.onEmote && ctx.onEmote(i); });

  G.ro = new ResizeObserver(resize); G.ro.observe(vp); resize();
  window.__hub3d = () => G && { calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, q: G.q, // hỗ trợ kiểm thử, đo hiệu năng
    me: [Math.round(me.x), Math.round(me.y)], cam: G.camera.position.toArray().map(v => +v.toFixed(2)), gate: (G.occ.find(o => o.id === "gate") || {}).op };
  bindInput();
  cam.dist = CAM_INTRO.dist; cam.pitch = CAM_INTRO.pitch; cam.x = me.x; cam.y = me.y;
}

function dispose() {
  cancelAnimationFrame(raf);
  if (!G) return;
  G.ro && G.ro.disconnect();
  G.observers.forEach(o => o.disconnect());
  disposeTree(G.scene);
  shadowGeo = null;
  G.renderer.dispose();
  G.renderer.domElement.remove(); G.labels.remove();
  G = null;
}

function resize() {
  if (!G) return;
  const vp = $("viewport"), w = vp.clientWidth || 1, h = vp.clientHeight || 1;
  G.renderer.setSize(w, h, false);
  G.camera.aspect = w / h;
  G.camera.fov = w / h < 0.75 ? 56 : 48; // màn dọc điện thoại: mở góc rộng hơn
  G.camera.updateProjectionMatrix();
}

function setShadows(on) {
  G.renderer.shadowMap.enabled = on;
  G.sun.castShadow = on;
  // Cảnh tĩnh: chỉ cần vẽ bản đồ bóng một lần (nhân vật dùng bóng tròn), đỡ tốn cho máy yếu.
  G.renderer.shadowMap.autoUpdate = false;
  G.renderer.shadowMap.needsUpdate = true;
  G.scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
}

/* ---------- Bầu trời, ánh sáng, mặt đất ---------- */
function buildSky(scene) {
  const geo = new THREE.SphereGeometry(80, 32, 16), pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const stops = [[-0.2, "#3a2a55"], [0.0, "#ffb27a"], [0.08, "#f28a6a"], [0.22, "#b4487a"], [0.45, "#4a1f6e"], [1, "#160b33"]].map(([t, c]) => [t, new THREE.Color(c)]);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 80;
    let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
    const [t0, c0] = stops[k], [t1, c1] = stops[k + 1];
    c.copy(c0).lerp(c1, Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; scene.add(sky); G.sky = sky;
  // sao
  const n = 260, sp = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, e = (0.25 + Math.random() * 0.7) * Math.PI / 2, r = 75;
    sp[i * 3] = Math.cos(a) * Math.cos(e) * r; sp[i * 3 + 1] = Math.sin(e) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8, fog: false, depthWrite: false }));
  stars.renderOrder = -9; scene.add(stars); G.stars = stars;
  // mặt trăng
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff1c4, fog: false, depthWrite: false, transparent: true }));
  moon.position.set(-30, 38, -55); moon.scale.set(14, 14, 1); scene.add(moon);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xfff6dc, fog: false }));
  disc.position.copy(moon.position); disc.lookAt(0, 0, 0); scene.add(disc);
}

function buildLights(scene, q) {
  scene.add(new THREE.HemisphereLight(0xffd2b0, 0x3b4a2a, 1.25));
  const sun = new THREE.DirectionalLight(0xffcf9e, 2.4);
  sun.position.set(-12, 18, 10);
  sun.target.position.set(0, 0, 0);
  sun.shadow.mapSize.set(q >= 2 ? 2048 : 1024, q >= 2 ? 2048 : 1024);
  const s = sun.shadow.camera; s.left = -13; s.right = 13; s.top = 13; s.bottom = -13; s.near = 1; s.far = 60;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target); G.sun = sun;
  // ánh đèn ấm từ phía cổng để mặt trước gian hàng không bị tối
  const fill = new THREE.DirectionalLight(0xff9a6a, 0.6); fill.position.set(6, 5, 12); scene.add(fill);
  const back = new THREE.DirectionalLight(0xb48cff, 0.35); back.position.set(4, 6, -12); scene.add(back); // ánh tím từ phía bắc cho mặt gian quay về cổng
}

function buildGround(scene) {
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#5a9a45"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = Math.random() < .5 ? "rgba(40,90,35,.35)" : "rgba(140,200,90,.25)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 3 + Math.random() * 4); }
  }, { repeat: [18, 18] });
  const grass = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ map: grassTex }));
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass); G.ground = grass;

  // sân lát gạch hình tròn, có vòng và tia như bản CSS
  const R = PLAZA_R / U, RF = FAIR_R / U;
  // khu lát gạch lớn của hội chợ
  const brick = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#c99a68"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(100,55,20,.28)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32) % 2 * 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.05)" : "rgba(80,40,10,.07)"; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  }, { repeat: [14, 14] });
  const fair = new THREE.Mesh(new THREE.CircleGeometry(RF, 72), new THREE.MeshLambertMaterial({ map: brick }));
  fair.rotation.x = -Math.PI / 2; fair.position.y = 0.005; fair.receiveShadow = true; scene.add(fair);
  const fcurb = new THREE.Mesh(new THREE.TorusGeometry(RF, 0.1, 6, 96), new THREE.MeshLambertMaterial({ color: 0x9a6034 }));
  fcurb.rotation.x = -Math.PI / 2; fcurb.position.y = 0.02; scene.add(fcurb);
  // lối gạch đỏ từ sân trống ra 3 gian và cổng
  const lane = new THREE.MeshLambertMaterial({ color: 0xb8643f });
  for (const [x, y] of [[SPOTS.g1.x, SPOTS.g1.y], [SPOTS.g2.x, SPOTS.g2.y], [SPOTS.g3.x, SPOTS.g3.y], [GATE.x, GATE.y]]) {
    const dx = wx(x), dz = wz(y), len = Math.hypot(dx, dz) - R, mid = R + len / 2, a = Math.atan2(dx, dz);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(1.5, len), lane);
    strip.rotation.set(-Math.PI / 2, 0, a); strip.position.set(Math.sin(a) * mid, 0.008, Math.cos(a) * mid); strip.receiveShadow = true; scene.add(strip);
  }
  const plazaTex = canvasTex(1024, 1024, (g, w) => {
    const c = w / 2;
    g.fillStyle = "#d9a873"; g.fillRect(0, 0, w, w);
    // gạch theo vòng tròn đồng tâm
    for (let r = 30; r < c; r += 34) {
      g.strokeStyle = "rgba(120,70,30,.22)"; g.lineWidth = 2; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
      const n = Math.max(8, Math.floor(r / 12));
      for (let i = 0; i < n; i++) { const a = (i + (r / 34) % 2 * .5) / n * Math.PI * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); g.lineTo(c + Math.cos(a) * (r + 34), c + Math.sin(a) * (r + 34)); g.stroke(); }
    }
    for (let i = 0; i < 3000; i++) { g.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.06)" : "rgba(80,40,10,.07)"; g.fillRect(Math.random() * w, Math.random() * w, 3, 3); }
    // vòng trang trí
    [[0.18, 10, "#fff1d6"], [0.6, 8, "#fff1d6"], [0.985, 14, "#b7743d"]].forEach(([k, lw, col]) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(c, c, c * k, 0, Math.PI * 2); g.stroke(); });
    // ngôi sao giữa sân
    g.fillStyle = "#c8102e"; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 36 : 88; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.fillStyle = "#ffc533"; g.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 22 : 54; g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r); }
    g.closePath(); g.fill();
  });
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshLambertMaterial({ map: plazaTex }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.01; plaza.receiveShadow = true; scene.add(plaza);
  // lối đi từ cổng vào
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5), new THREE.MeshLambertMaterial({ map: canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#cf9b66"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(110,60,25,.3)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 24) % 2 * 21; x < w; x += 42) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke(); } }
  }) }));
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.008, wz(GATE.y) + 2.4); path.receiveShadow = true; scene.add(path);
  // bờ đá quanh sân
  const curb = new THREE.Mesh(new THREE.TorusGeometry(R, 0.09, 6, 72), new THREE.MeshLambertMaterial({ color: 0xa96a3a }));
  curb.rotation.x = -Math.PI / 2; curb.position.y = 0.02; curb.receiveShadow = true; scene.add(curb);
}

/* ---------- Cây: mai vàng, đào hồng, cây xanh (vẽ theo lô, ít lệnh vẽ) ---------- */
function buildTrees(scene) {
  const spots = [];
  for (let i = 0; i < 30; i++) { const a = i / 30 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .3) continue; spots.push([Math.cos(a) * 10.8, Math.sin(a) * 10.8, i]); }
  for (let i = 0; i < 36; i++) { const a = i / 36 * Math.PI * 2 + .08; if (Math.abs(a - Math.PI / 2) < .2) continue; spots.push([Math.cos(a) * 13.6, Math.sin(a) * 13.6, i + 3]); }
  if (hasKit()) for (let i = spots.length - 1; i >= 0; i--) if (DECOR.some(d => Math.hypot(d.x - spots[i][0], d.z - spots[i][1]) < 1.4)) spots.splice(i, 1);
  const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.2, 6); trunkGeo.translate(0, 0.6, 0);
  const crownGeo = new THREE.IcosahedronGeometry(0.85, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshLambertMaterial({ color: 0x6b4423 }), spots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, new THREE.MeshLambertMaterial({ flatShading: true }), spots.length * 2);
  const COLORS = [0x3f8f3a, 0xffc93c, 0xff8fb1, 0x2f7d32]; // xanh, mai vàng, đào hồng, xanh đậm
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
  spots.forEach(([x, z, i], k) => {
    const sc = 0.85 + ((i * 37) % 10) / 22;
    m.compose(p.set(x, 0, z), q.identity(), s.set(sc, sc, sc)); trunks.setMatrixAt(k, m);
    const col = COLORS[i % 4];
    m.compose(p.set(x, 1.45 * sc, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i), s.set(sc, sc * 0.9, sc)); crowns.setMatrixAt(k * 2, m); crowns.setColorAt(k * 2, c.set(col));
    m.compose(p.set(x + 0.2 * sc, 2.05 * sc, z - 0.1), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2), s.set(sc * 0.62, sc * 0.6, sc * 0.62)); crowns.setMatrixAt(k * 2 + 1, m); crowns.setColorAt(k * 2 + 1, c.set(col).offsetHSL(0, 0, 0.06));
  });
  trunks.castShadow = crowns.castShadow = true;
  scene.add(trunks, crowns);
}

/* ---------- Cột đèn lồng và dây đèn ---------- */
function buildLanterns(scene) {
  const pts = [];
  for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2 + Math.PI / 18; if (Math.abs(a - Math.PI / 2) < .3) continue; pts.push([Math.cos(a) * 9.25, Math.sin(a) * 9.25, i]); }
  const n = pts.length;
  const poleGeo = new THREE.CylinderGeometry(0.05, 0.07, 2.4, 6); poleGeo.translate(0, 1.2, 0);
  const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x5a3415 }), n);
  const lanGeo = mergeParts([
    [new THREE.SphereGeometry(0.22, 12, 10), "#e01b3c", 0, -0.32, 0, 0, 0, 0, 1, 1.25, 1],
    [new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10), "#ffc533", 0, -0.04, 0],
    [new THREE.CylinderGeometry(0.11, 0.11, 0.06, 10), "#ffc533", 0, -0.6, 0],
    [new THREE.CylinderGeometry(0.015, 0.03, 0.22, 4), "#ffc533", 0, -0.74, 0]
  ]);
  const lans = new THREE.InstancedMesh(lanGeo, new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xff3a1a, emissiveIntensity: 0.55 }), n);
  const m = new THREE.Matrix4();
  pts.forEach(([x, z], k) => { m.makeTranslation(x, 0, z); poles.setMatrixAt(k, m); });
  poles.castShadow = true;
  scene.add(poles, lans);
  // vầng sáng quanh đèn lồng (1 lệnh vẽ)
  const gp = new Float32Array(n * 3);
  pts.forEach(([x, z], k) => { gp[k * 3] = x; gp[k * 3 + 1] = 2.1; gp[k * 3 + 2] = z; });
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  const glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex(), color: 0xff9a3c, size: 1.6, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
  scene.add(glow);
  // dây đèn nhỏ nối các cột
  const bulbs = [];
  for (let k = 0; k < n; k++) {
    const a = pts[k], b = pts[(k + 1) % n];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 4) continue; // bỏ đoạn qua cổng
    for (let i = 1; i < 10; i++) { const t = i / 10, sag = Math.sin(t * Math.PI) * 0.45; bulbs.push(a[0] + (b[0] - a[0]) * t, 2.3 - sag, a[1] + (b[1] - a[1]) * t); }
  }
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bulbs), 3));
  const bcol = new Float32Array(bulbs.length), pal = [new THREE.Color("#ffd166"), new THREE.Color("#ff6b6b"), new THREE.Color("#7bdff2"), new THREE.Color("#b8f28b")];
  for (let i = 0; i < bulbs.length / 3; i++) { const c = pal[i % 4]; bcol[i * 3] = c.r; bcol[i * 3 + 1] = c.g; bcol[i * 3 + 2] = c.b; }
  bg.setAttribute("color", new THREE.BufferAttribute(bcol, 3));
  scene.add(new THREE.Points(bg, new THREE.PointsMaterial({ map: glowTex(), vertexColors: true, size: 0.42, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  G.lanterns = { mesh: lans, pts, glow: gg, poles };
}

/* ---------- Cổng chào ---------- */
function buildGate(scene) {
  const g = new THREE.Group(); g.position.set(wx(GATE.x), 0, wz(GATE.y));
  const red = new THREE.MeshStandardMaterial({ color: 0xc8102e, roughness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2b51c, roughness: 0.35, metalness: 0.4 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x7a0f1d, roughness: 0.7 });
  for (const sx of [-1.35, 1.35]) {
    const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 2.9, 14), red); pil.position.set(sx, 1.45, 0); g.add(pil);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.3, 14), gold); base.position.set(sx, 0.15, 0); g.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 16), gold); ring.rotation.x = Math.PI / 2; ring.position.set(sx, 2.0, 0); g.add(ring);
  }
  const signTex = canvasTex(1024, 256, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#e01b3c"); gr.addColorStop(1, "#a50e27");
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#ffc533"; c.lineWidth = 14; rrect(c, 14, 14, w - 28, h - 28, 22); c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillStyle = "#6b0716"; fitText(c, "HỘI CHỢ ONLINE", w / 2, 108, w - 120, 104);
    c.fillStyle = "#ffc533"; fitText(c, "HỘI CHỢ ONLINE", w / 2, 102, w - 120, 104);
    c.fillStyle = "#fff"; fitText(c, PLACE_NAME, w / 2, 192, w - 160, 40, 700);
  });
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.6 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.82, 0.24), [red, red, red, red, signMat, signMat]);
  beam.position.y = 2.55; g.add(beam);
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.14, 0.7), roof); top.position.y = 3.05; g.add(top);
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.7, 8), gold); ridge.rotation.z = Math.PI / 2; ridge.position.y = 3.15; g.add(ridge);
  for (const sx of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 8), gold); tip.position.set(sx * 2.0, 3.25, 0); tip.rotation.z = -sx * 0.9; g.add(tip);
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), new THREE.MeshLambertMaterial({ color: 0xe01b3c, emissive: 0xff3a1a, emissiveIntensity: 0.6 }));
    lan.scale.y = 1.25; lan.position.set(sx * 0.9, 1.85, 0.05); g.add(lan); G.anim.push({ o: lan, k: "swing", p: sx });
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  G.occ.push({ id: "gate", x: GATE.x, y: GATE.y, g, op: 1, near: 5 }); // cổng rộng: mờ hẳn khi máy quay còn cách xa hơn
}

/* ---------- Gian hàng ---------- */
function woodMats() {
  return {
    wood: new THREE.MeshStandardMaterial({ color: 0xa8692f, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x5e3816, roughness: 0.85 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xfff3dc, roughness: 0.9 })
  };
}
function awningTex(color) {
  return canvasTex(512, 256, (g, w, h) => {
    const n = 8, sw = w / n, body = h * 0.72, r = sw / 2;
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? "#ffffff" : color; g.fillRect(i * sw, 0, sw, body);
      g.beginPath(); g.arc(i * sw + r, body, r, 0, Math.PI); g.fill();
    }
    const sh = g.createLinearGradient(0, 0, 0, body); sh.addColorStop(0, "rgba(0,0,0,.18)"); sh.addColorStop(.3, "rgba(0,0,0,0)");
    g.fillStyle = sh; g.fillRect(0, 0, w, body);
  });
}
function signTex(b) {
  return canvasTex(512, 192, (g, w, h) => {
    g.fillStyle = b.c; rrect(g, 6, 6, w - 12, h - 12, 26); g.fill();
    g.strokeStyle = "#ffc533"; g.lineWidth = 10; rrect(g, 8, 8, w - 16, h - 16, 24); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#ffc533"; fitText(g, b.tag.toUpperCase(), w / 2, 52, w - 80, 34, 800);
    g.fillStyle = "#fff"; fitText(g, b.name, w / 2, 122, w - 60, 62);
  });
}
function counterTex(text) {
  return canvasTex(512, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#6b4020"); gr.addColorStop(1, "#3f240c");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(0, i * h / 6, w, 2); }
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ffc533"; fitText(g, text, w / 2, h / 2 + 2, w - 40, 48, 800);
  });
}

function buildStall(scene, b) {
  const sp = SPOTS[b.id], g = new THREE.Group();
  g.position.set(wx(sp.x), 0, wz(sp.y)); g.rotation.y = -sp.r * DEG;
  const M = woodMats();
  const W = 2.3, D = 1.2;
  // sàn gỗ
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, 0.12, D + 0.4), M.dark); floor.position.y = 0.06; g.add(floor);
  // vách sau, hai vách bên
  const back = new THREE.Mesh(new THREE.BoxGeometry(W, 2.0, 0.1), M.cream); back.position.set(0, 1.1, -D / 2); g.add(back);
  for (const sx of [-1, 1]) { const side = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, D), M.wood); side.position.set(sx * (W / 2 - 0.04), 0.72, 0); g.add(side); }
  // quầy hàng có chữ
  const ctex = counterTex(b.goods), cmat = new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.8 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(W - 0.1, 0.85, 0.5), [M.wood, M.wood, M.wood, M.wood, cmat, M.wood]);
  counter.position.set(0, 0.55, D / 2 - 0.25); g.add(counter);
  const top = new THREE.Mesh(new THREE.BoxGeometry(W + 0.05, 0.07, 0.62), M.dark); top.position.set(0, 1.0, D / 2 - 0.25); g.add(top);
  // bốn cột
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.35, 8), M.dark); post.position.set(sx * (W / 2 - 0.02), 1.22, sz * (D / 2)); g.add(post);
  }
  // mái che sọc
  const amat = new THREE.MeshStandardMaterial({ map: awningTex(b.c), side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.75 });
  const awn = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.5, 1.3), amat);
  awn.position.set(0, 2.3, 0.15); awn.rotation.x = -1.05; g.add(awn);
  const awnBack = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.06, 1.0), new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.75 }));
  awnBack.position.set(0, 2.55, -0.4); awnBack.rotation.x = 0.18; g.add(awnBack);
  // biển tên trên nóc
  const smat = new THREE.MeshStandardMaterial({ map: signTex(b), roughness: 0.55 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 0.08), [M.dark, M.dark, M.dark, M.dark, smat, M.dark]);
  sign.position.set(0, 3.15, -0.2); g.add(sign); G.anim.push({ o: sign, k: "bob", y: 3.15, p: sp.x / 300 });
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), M.dark); stick.position.set(0, 2.7, -0.22); g.add(stick);
  // đồ trưng bày: emoji nổi trên quầy
  const goods = emojiSprite(b.icons, 0.7); goods.position.set(0, 1.5, 0.15); g.add(goods); G.anim.push({ o: goods, k: "float", y: 1.5, p: sp.x / 200 });
  // đèn lồng hai bên mái
  for (const sx of [-1, 1]) {
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe01b3c, emissive: 0xff3a1a, emissiveIntensity: 0.6 }));
    lan.scale.y = 1.3; lan.position.set(sx * (W / 2 + 0.1), 1.75, D / 2 + 0.1); g.add(lan); G.anim.push({ o: lan, k: "swing", p: sx + sp.x });
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.pick = b.id; G.pick.push(o); } });
  goods.userData.pick = b.id; G.pick.push(goods);
  scene.add(g);
  G.occ.push({ id: b.id, x: sp.x, y: sp.y, g, op: 1 });
  const pill = textPlane("bb_" + b.id, 0.95, { bg: "#ffffff", fg: "#2b1a12", sprite: true });
  pill.position.set(0, 3.78, -0.2); g.add(pill); G.anim.push({ o: pill, k: "bob", y: 3.78, p: sp.x / 300 });
}

/* ---------- Gian hàng dùng mô hình Kenney (CC0) ---------- */
function buildStallKit(scene, b) {
  const sp = SPOTS[b.id], g = new THREE.Group();
  g.position.set(wx(sp.x), 0, wz(sp.y)); g.rotation.y = -sp.r * DEG;
  const M = woodMats(), blue = b.id === "g3" ? "blue" : null;
  // quầy hàng mái bạt, phóng to bằng gian thật (khoảng 2,4 × 3 đơn vị)
  const stall = model(b.id === "g2" ? "stall-green" : "stall-red", 2.4, { own: true, tint: blue });
  stall.rotation.y = Math.PI / 2; // mặt dài của quầy hướng ra trước
  g.add(stall);
  // biển tên trên nóc
  const smat = new THREE.MeshStandardMaterial({ map: signTex(b), roughness: 0.55 });
  const sign = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.72, 0.08), [M.dark, M.dark, M.dark, M.dark, smat, M.dark]);
  sign.position.set(0, 3.5, 0); g.add(sign); G.anim.push({ o: sign, k: "bob", y: 3.5, p: sp.x / 300 });
  for (const sx of [-0.6, 0.6]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 6), M.dark); st.position.set(sx, 3.0, 0); g.add(st); }
  // băng rôn chữ dưới mép bạt
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.3), new THREE.MeshStandardMaterial({ map: counterTex(b.goods), roughness: 0.8, side: THREE.DoubleSide }));
  ban.position.set(0, 0.62, 0.82); g.add(ban);
  // đồ trưng bày nổi trên quầy
  const goods = emojiSprite(b.icons, 0.75); goods.position.set(0, 1.35, 0.1); g.add(goods); G.anim.push({ o: goods, k: "float", y: 1.35, p: sp.x / 200 });
  // cờ đuôi nheo, ghế đẩu, đèn lồng
  for (const sx of [-1, 1]) {
    const f = model(b.id === "g2" ? "banner-green" : "banner-red", 1.8, { own: true, tint: blue }); f.position.set(sx * 1.5, 0, 0.75); g.add(f);
    const stool = model("stall-stool", 1.7, { own: true }); stool.position.set(sx * 0.75, 0, 1.25); g.add(stool);
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe01b3c, emissive: 0xff3a1a, emissiveIntensity: 0.6 }));
    lan.scale.y = 1.3; lan.position.set(sx * 1.0, 1.95, 1.0); g.add(lan); G.anim.push({ o: lan, k: "swing", p: sx + sp.x });
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.pick = b.id; G.pick.push(o); } });
  goods.userData.pick = b.id; G.pick.push(goods);
  scene.add(g);
  G.occ.push({ id: b.id, x: sp.x, y: sp.y, g, op: 1 });
  const pill = textPlane("bb_" + b.id, 0.95, { bg: "#ffffff", fg: "#2b1a12", sprite: true });
  pill.position.set(0, 4.13, 0); g.add(pill); G.anim.push({ o: pill, k: "bob", y: 4.13, p: sp.x / 300 });
}

function buildLockedKit(scene, x, y, r, name, id) {
  const g = new THREE.Group(); g.position.set(wx(x), 0, wz(y)); g.rotation.y = -r * DEG;
  const st = model("stall-red", 1.9, { own: true, tint: "gray" }); st.rotation.y = Math.PI / 2; g.add(st);
  const tex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = "#5e5246"; rrect(c, 4, 4, w - 8, h - 8, 18); c.fill();
    c.strokeStyle = "#ffc533"; c.lineWidth = 6; rrect(c, 7, 7, w - 14, h - 14, 15); c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff"; fitText(c, "🔒 " + name, w / 2, 50, w - 30, 38, 900);
    c.fillStyle = "rgba(255,255,255,.8)"; fitText(c, "Sắp mở", w / 2, 92, w - 30, 26, 700);
  });
  const post = new THREE.MeshStandardMaterial({ color: 0x5e3816, roughness: 0.85 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 0.05), [post, post, post, post, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), post]);
  board.position.set(0, 0.85, 1.25); board.rotation.x = -0.15; g.add(board);
  for (const sx of [-0.4, 0.4]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), post); p.position.set(sx, 0.42, 1.27); g.add(p); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  G.occ.push({ id, x, y, g, op: 1 });
}

/* ---------- Đồ trang trí quanh sân: sạp chợ nhỏ, xe đẩy, ghế băng, đèn đường, hàng rào cây ---------- */
const DECOR = [[-157, "stall-green"], [-113, "cart-high"], [-67, "cart"], [-23, "stall-red"], [23, "stall-green"], [40, "cart-high"], [58, "stall-red"], [112, "cart"], [157, "stall-red"]]
  .map(([deg, k]) => ({ k, x: Math.cos(deg * DEG) * 8.3, z: Math.sin(deg * DEG) * 8.3, s: k.startsWith("stall") ? 1.5 : 1.4 }));
function buildDecor(scene) {
  for (const d of DECOR) {
    const o = model(d.k, d.s, { own: true }); o.position.set(d.x, 0, d.z); o.rotation.y = Math.atan2(-d.x, -d.z) + (d.k.startsWith("stall") ? Math.PI / 2 : 0); scene.add(o);
    BLOCK.push([d.x * U + CX, d.z * U + CY, 80]);
    G.occ.push({ id: "d" + d.k + d.x, x: d.x * U + CX, y: d.z * U + CY, g: o, op: 1 });
  }
  // ghế băng ở mép sân, quay vào giữa
  // hai cột đèn đường hai bên cổng
  const gz = wz(GATE.y), glow = [];
  for (const sx of [-1, 1]) { const l = model("lantern", 1.4); l.position.set(sx * 1.9, 0, gz + 0.5); scene.add(l); glow.push(sx * 1.9, 2.12, gz + 0.5); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(glow), 3));
  scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex(), color: 0xffe2a0, size: 0.9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
}

/* ---------- Khu ghế ngồi quanh sân trống: 8 ghế băng (3 chỗ) và 4 bàn (4 ghế đẩu) ---------- */
function markSeats(o, seats) { o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.seats = seats; G.pick.push(m); } }); }
function buildSeating(scene, kit) {
  const wood = new THREE.MeshLambertMaterial({ color: 0xa8692f }), dark = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  for (const b of BENCHES) {
    let o;
    if (kit) o = model("stall-bench", 2.4);
    else { // ghế băng tự dựng khi không có mô hình
      o = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 2.2), wood); top.position.y = 0.5; o.add(top);
      for (const z of [-0.9, 0.9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.1), dark); leg.position.set(0, 0.23, z); o.add(leg); }
    }
    o.position.set(wx(b.x), 0, wz(b.y)); o.rotation.y = -b.th; // dọc theo vòng tròn, chỗ ngồi quay vào giữa sân
    markSeats(o, b.seats); scene.add(o);
  }
  for (const t of TABLES) {
    // bàn tròn trải khăn đỏ
    const tb = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24), wood); top.position.y = 0.58; tb.add(top);
    const cloth = new THREE.Mesh(new THREE.CylinderGeometry(0.53, 0.6, 0.2, 24, 1, true), new THREE.MeshLambertMaterial({ color: 0xc8102e, side: THREE.DoubleSide })); cloth.position.y = 0.5; tb.add(cloth);
    const clothTop = new THREE.Mesh(new THREE.CircleGeometry(0.53, 24), new THREE.MeshLambertMaterial({ color: 0xc8102e })); clothTop.rotation.x = -Math.PI / 2; clothTop.position.y = 0.615; tb.add(clothTop);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.55, 8), dark); leg.position.y = 0.28; tb.add(leg);
    const tea = emojiSprite("🍵", 0.28); tea.position.y = 0.76; tb.add(tea); // ấm trà trên bàn
    tb.position.set(wx(t.x), 0, wz(t.y));
    // đèn lồng nhỏ treo giữa bàn
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffb703, emissive: 0xff7b00, emissiveIntensity: 0.7 }));
    lan.position.y = 1.9; tb.add(lan);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 5), new THREE.MeshLambertMaterial({ color: 0x6b4423 })); pole.position.y = 1.3; tb.add(pole);
    tb.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); scene.add(tb);
    G.occ.push({ id: t.id, x: t.x, y: t.y, g: tb, op: 1 }); // mờ đi khi che máy quay
    for (const si of t.seats) {
      const se = SEATS[si];
      let st;
      if (kit) st = model("stall-stool", 2);
      else { st = new THREE.Group(); const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 12), wood); top.position.y = 0.43; st.add(top); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.42, 6), dark); leg.position.y = 0.21; st.add(leg); }
      st.position.set(wx(se.x), 0, wz(se.y)); st.rotation.y = se.face;
      markSeats(st, [si]); scene.add(st);
    }
  }
}

function buildLocked(scene, x, y, r, name, id) {
  const g = new THREE.Group(); g.position.set(wx(x), 0, wz(y)); g.rotation.y = -r * DEG;
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.9 });
  const tex = canvasTex(256, 192, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#8a7a6a"); gr.addColorStop(1, "#5e5246");
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#fff"; fitText(c, "🔒 " + name, w / 2, 78, w - 30, 40, 900);
    c.fillStyle = "rgba(255,255,255,.75)"; fitText(c, "Sắp mở", w / 2, 128, w - 30, 28, 700);
  });
  const front = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.0), [stone, stone, stone, stone, front, stone]); box.position.y = 0.6; g.add(box);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.6, 4), new THREE.MeshStandardMaterial({ color: 0x4f453b, roughness: 0.9 }));
  roof.position.y = 1.5; roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, 0.75); g.add(roof);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(g);
  G.occ.push({ id, x, y, g, op: 1 });
}

function buildBoard(scene) {
  const S = SPOTS.board, g = new THREE.Group(); g.position.set(wx(S.x), 0, wz(S.y));
  const post = new THREE.MeshStandardMaterial({ color: 0x8a5a00, roughness: 0.6 });
  const tex = canvasTex(512, 320, (c, w, h) => {
    const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, "#ffe58a"); gr.addColorStop(1, "#f2b51c");
    c.fillStyle = gr; c.fillRect(0, 0, w, h);
    c.strokeStyle = "#8a5a00"; c.lineWidth = 14; rrect(c, 12, 12, w - 24, h - 24, 22); c.stroke();
    c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#5a3a00";
    fitText(c, "🏆 BẢNG VÀNG", w / 2, 92, w - 60, 66);
    c.fillStyle = "#7a5200"; fitText(c, "Xếp hạng chung 3 gian", w / 2, 160, w - 80, 32, 700);
  });
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45, metalness: 0.15 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd99a00, roughness: 0.4, metalness: 0.3 });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 0.14), [gold, gold, gold, gold, face, gold]); board.position.y = 1.35; g.add(board);
  for (const sx of [-0.62, 0.62]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 1.4, 8), post); p.position.set(sx, 0.7, -0.05); g.add(p); }
  const cup = emojiSprite("🏆", 0.6); cup.position.set(0, 2.3, 0); g.add(cup); G.anim.push({ o: cup, k: "float", y: 2.3, p: 1 });
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.pick = "board"; G.pick.push(o); } });
  cup.userData.pick = "board"; G.pick.push(cup);
  scene.add(g);
  G.occ.push({ id: "board", x: S.x, y: S.y, g, op: 1 });
  const rank = textPlane("bdTop", 1.05, { bg: "rgba(255,255,255,.6)", fg: "#5a3a00" });
  rank.position.set(0, 1.03, 0.075); g.add(rank);
}

/**
 * Nhãn chữ vẽ bằng canvas, nội dung đồng bộ từ một phần tử HTML ẩn có id cho trước
 * (main.js vẫn ghi textContent vào phần tử đó như bản CSS).
 */
function textPlane(id, width, { bg, fg, sprite = false }) {
  let src = document.getElementById(id);
  if (!src) { src = document.createElement("span"); src.id = id; G.hiddenBox.appendChild(src); }
  const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = sprite ? new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    : new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
  const o = sprite ? new THREE.Sprite(mat) : new THREE.Mesh(new THREE.PlaneGeometry(width, width / 4), mat);
  if (sprite) o.scale.set(width, width / 4, 1);
  const draw = () => {
    const g = cv.getContext("2d"), t = src.textContent.trim();
    g.clearRect(0, 0, 256, 64); o.visible = !!t; if (!t) return;
    g.font = "800 30px " + FONT; const w = Math.min(248, g.measureText(t).width + 36);
    g.fillStyle = bg; rrect(g, (256 - w) / 2, 6, w, 52, 26); g.fill();
    g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle"; fitText(g, t, 128, 33, 220, 30, 800);
    tex.needsUpdate = true;
  };
  const mo = new MutationObserver(draw); mo.observe(src, { childList: true, characterData: true, subtree: true });
  G.observers.push(mo); draw();
  return o;
}

/* ---------- Pháo hoa ---------- */
const FW_N = 6, FW_P = 28;
function buildFireworks(scene) {
  const n = FW_N * FW_P, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTex(), size: 0.9, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  pts.frustumCulled = false; scene.add(pts);
  G.fw = { pts, bursts: Array.from({ length: FW_N }, () => ({ life: 0, c: new THREE.Color(), o: new THREE.Vector3(), v: [] })) };
}
function firework() {
  const b = G.fw.bursts.find(x => x.life <= 0); if (!b) return;
  const a = cam.yaw * DEG + Math.PI + (Math.random() - 0.5) * 1.6, r = 16 + Math.random() * 8;
  b.o.set(wx(cam.x) + Math.sin(a) * r, 9 + Math.random() * 6, wz(cam.y) + Math.cos(a) * r);
  b.c.set(["#ffc533", "#ff5a7a", "#7dd3fc", "#a3e635", "#f0abfc"][Math.floor(Math.random() * 5)]);
  b.life = 1.3; b.v = [];
  for (let i = 0; i < FW_P; i++) { const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1), s = 3 + Math.random() * 1.5; b.v.push([Math.sin(ph) * Math.cos(th) * s, Math.cos(ph) * s, Math.sin(ph) * Math.sin(th) * s]); }
}
function updateFireworks(dt) {
  const { pts, bursts } = G.fw, P = pts.geometry.attributes.position, C = pts.geometry.attributes.color;
  bursts.forEach((b, k) => {
    b.life -= dt;
    const t = 1.3 - b.life, f = Math.max(0, b.life / 1.3);
    for (let i = 0; i < FW_P; i++) {
      const j = k * FW_P + i;
      if (b.life <= 0) { C.setXYZ(j, 0, 0, 0); continue; }
      const v = b.v[i], e = 1 - Math.exp(-t * 2.2);
      P.setXYZ(j, b.o.x + v[0] * e, b.o.y + v[1] * e - t * t * 0.8, b.o.z + v[2] * e);
      C.setXYZ(j, b.c.r * f, b.c.g * f, b.c.b * f);
    }
  });
  P.needsUpdate = true; C.needsUpdate = true;
}

/* ---------- Vòng đánh dấu điểm chạm ---------- */
/* ---------- Nút "Ngồi" hiện khi lại gần ghế trống ---------- */
const NEAR_SEAT = 130; // px
function buildSeatPrompt(scene) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.3, 32), new THREE.MeshBasicMaterial({ color: 0xffc533, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.renderOrder = 5; scene.add(ring);
  const anchor = new THREE.Object3D(); scene.add(anchor);
  const el = addLabel("sitPrompt", '<button class="sitp" type="button"></button>', anchor, new THREE.Vector3(0, 0, 0), "sp");
  el.style.display = "none";
  const btn = el.querySelector("button");
  btn.addEventListener("click", e => { e.stopPropagation(); promptAction(); });
  G.prompt = { ring, anchor, el, btn, seat: -1, mode: "" };
}
/** Bấm nút gợi ý (hoặc phím E): ngồi vào ghế đang được gợi ý, hoặc đứng dậy nếu đang ngồi. */
function promptAction() {
  if (!G || !G.prompt) return;
  if (mySeat >= 0) return standUp();
  if (G.prompt.seat >= 0) sitAt(G.prompt.seat);
}
/** Mỗi khung hình: tìm ghế trống gần nhất trong tầm với để gợi ý. */
function updateSeatPrompt() {
  const P = G.prompt; if (!P) return;
  let seat = -1, mode = "";
  if (mySeat >= 0) mode = "stand";
  else if (!target) {
    let bd = NEAR_SEAT;
    SEATS.forEach((se, i) => { if (!freeSeat(i)) return; const d = Math.hypot(se.x - me.x, se.y - me.y); if (d < bd) { bd = d; seat = i; } });
    if (seat >= 0) mode = "sit";
  }
  if (mode !== P.mode || seat !== P.seat) {
    P.mode = mode; P.seat = seat;
    P.el.style.display = mode ? "" : "none";
    P.btn.innerHTML = mode === "stand" ? "🚶 Đứng dậy" : "🪑 Ngồi" + (matchMedia("(hover: hover)").matches ? " <kbd>E</kbd>" : "");
  }
  if (mode === "sit") { const se = SEATS[seat]; P.anchor.position.set(wx(se.x), se.h + 0.75, wz(se.y)); P.ring.position.set(wx(se.x), se.h + 0.02, wz(se.y)); }
  else if (mode === "stand") P.anchor.position.set(wx(me.x), 1.85, wz(me.y));
  P.ring.visible = mode === "sit";
  if (P.ring.visible) { const k = 1 + Math.sin(G.t * 5) * 0.12; P.ring.scale.set(k, k, k); }
}

function buildMarker(scene) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.32, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.03; scene.add(m); G.marker = { m, t: 0 };
}

/* =====================================================================
   NHÂN VẬT VÀ NHÃN CHỮ (nhãn là HTML để chữ nét, dùng lại CSS sẵn có)
   ===================================================================== */
function addLabel(key, html, obj, offset, cls) {
  const el = document.createElement("div"); el.className = "l3 " + (cls || ""); el.innerHTML = html; el.dataset.k = key;
  G.labels.appendChild(el);
  (G.lbls || (G.lbls = [])).push({ key, el, obj, off: offset, shown: true, x: -1, y: -1 });
  return el;
}
function removeLabel(key) { if (!G.lbls) return; const i = G.lbls.findIndex(l => l.key === key); if (i >= 0) { G.lbls[i].el.remove(); G.lbls.splice(i, 1); } }

let shadowGeo = null;
function addAvatar(id, name, seed, mine) {
  if (!shadowGeo) { shadowGeo = new THREE.PlaneGeometry(0.9, 0.9); shadowGeo.rotateX(-Math.PI / 2); }
  const root = new THREE.Group(), mat = characterMaterial(), body = new THREE.Mesh(characterGeometry(seed, mine), mat);
  const sh = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }));
  sh.position.y = 0.02; sh.userData.keepGeo = true;
  root.add(sh, body);
  if (mine) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffc533, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; root.add(ring);
  }
  G.scene.add(root);
  const el = addLabel(id, '<div class="avt' + (mine ? " mine" : "") + '" id="' + id + '"><span class="bub"></span><span class="nm">' + esc(name) + "</span></div>", root, new THREE.Vector3(0, 1.45, 0), "av");
  const a = { id, root, body, mat, el, phase: Math.random() * 6, walk: false, hop: 0, face: 0, wave: 0 };
  G.avatars.set(id, a);
  return a;
}
function removeAvatar(id) {
  const a = G && G.avatars.get(id); if (!a) return;
  G.scene.remove(a.root);
  a.body.geometry.dispose(); a.mat.dispose(); a.root.children.forEach(o => { if (o !== a.body && o.material) o.material.dispose(); if (o.geometry && !o.userData.keepGeo && o !== a.body) o.geometry.dispose(); });
  removeLabel(id); G.avatars.delete(id);
}
/** Chào: vẫy tay và nhún nhẹ. */
function hop(id) { const a = G && G.avatars.get(id); if (a) { a.hop = 1; a.wave = 1.6; } }

/* ---------- Người chơi khác (cùng giao diện hàm với bản CSS) ---------- */
function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
export function addPeer(p) {
  if (!G) return;
  if (peers.has(p.id)) removePeer(p.id);
  const q = { ...p, tx: p.x, ty: p.y, walk: false, seat: -1 };
  peers.set(p.id, q);
  if (p.seat >= 0) peerSit(p.id, p.seat);
  const a = addAvatar("p_" + p.id, p.nick, hash(p.id), false);
  a.root.position.set(wx(p.x), 0, wz(p.y));
  if (hidden.has(p.id)) { a.root.visible = false; a.el.style.display = "none"; }
}
export function removePeer(id) { clearOcc(id); peers.delete(id); removeAvatar("p_" + id); }
export function movePeer(id, x, y) { const p = peers.get(id); if (p) { p.tx = x; p.ty = y; } }
export function renamePeer(id, nick) { const p = peers.get(id); if (p) { p.nick = nick; const el = $("p_" + id); if (el) el.querySelector(".nm").textContent = nick; } }
export function peerEmote(id, e) { if (!hidden.has(id) && EMOTES[e]) { bubble("p_" + id, EMOTES[e][0]); hop("p_" + id); } }
export function peerSay(id, text) { if (!hidden.has(id)) bubble("p_" + id, '<span style="font-size:13px;font-weight:700">' + esc(text.length > 34 ? text.slice(0, 33) + "…" : text) + "</span>"); }
export function selfSay(text) { bubble("avo", '<span style="font-size:13px;font-weight:700">' + esc(text.length > 34 ? text.slice(0, 33) + "…" : text) + "</span>"); }
export function hidePeer(id) { hidden.add(id); const a = G && G.avatars.get("p_" + id); if (a) { a.root.visible = false; a.el.style.display = "none"; } }
export function resetPeers(list) { for (const id of [...peers.keys()]) removePeer(id); list.forEach(addPeer); }
export const peerCount = () => peers.size;

function bubble(id, html) { const el = $(id); if (!el) return; const b = el.querySelector(".bub"); b.innerHTML = html; b.classList.add("on"); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove("on"), 2400); }

/* ---------- Chỗ ngồi ---------- */
function freeSeat(i) { const o = seatOcc.get(i); return !o || o === "me"; }
/** Chạm vào ghế: chọn chỗ trống gần điểm chạm nhất trên ghế đó. */
function sitFrom(list, p) {
  const free = list.filter(freeSeat);
  if (!free.length) { ctx.toast && ctx.toast("Ghế này đã kín chỗ, bạn chọn ghế khác nhé"); return; }
  const px = p.x * U + CX, py = p.z * U + CY;
  free.sort((a, b) => Math.hypot(SEATS[a].x - px, SEATS[a].y - py) - Math.hypot(SEATS[b].x - px, SEATS[b].y - py));
  sitAt(free[0]);
}
/** Nút "Ngồi": đi tới chỗ trống gần mình nhất. */
function sitNearest() {
  let best = -1, bd = Infinity;
  SEATS.forEach((se, i) => { if (!freeSeat(i)) return; const d = Math.hypot(se.x - me.x, se.y - me.y); if (d < bd) { bd = d; best = i; } });
  if (best < 0) { ctx.toast && ctx.toast("Các ghế đều đã có người ngồi"); return; }
  sitAt(best);
}
function sitAt(i) {
  standUp();
  const se = SEATS[i];
  walkTo(se.x, se.y, () => {
    if (!freeSeat(i)) { ctx.toast && ctx.toast("Có người vừa ngồi mất ghế này rồi"); return; }
    mySeat = i; seatOcc.set(i, "me"); me.x = se.x; me.y = se.y;
    ctx.send({ t: "sit", s: i });
    updateSitBtn();
  });
}
/** Đứng dậy (khi đi tiếp, vào gian hàng, bấm nút). */
function standUp() {
  if (mySeat < 0) return;
  const se = SEATS[mySeat];
  if (seatOcc.get(mySeat) === "me") seatOcc.delete(mySeat);
  mySeat = -1; ctx.send({ t: "sit", s: -1 }); updateSitBtn();
  // bước ra phía trước ghế để không đứng lẫn trong ghế
  if (se) { me.x = se.x + Math.sin(se.face) * 55; me.y = se.y + Math.cos(se.face) * 55; blockPush(me); }
}
function updateSitBtn() { const b = $("sitBtn"); if (b) b.innerHTML = mySeat >= 0 ? "<i>🚶</i>Đứng dậy" : "<i>🪑</i>Ngồi"; }
function clearOcc(id) { for (const [k, v] of seatOcc) if (v === id) seatOcc.delete(k); }
/** Người chơi khác ngồi xuống (s ≥ 0) hoặc đứng dậy (s = -1). */
export function peerSit(id, s) {
  const p = peers.get(id); if (!p) return;
  clearOcc(id); p.seat = s;
  if (s >= 0 && SEATS[s]) {
    seatOcc.set(s, id); p.x = p.tx = SEATS[s].x; p.y = p.ty = SEATS[s].y;
    if (s === mySeat) { mySeat = -1; updateSitBtn(); } // máy chủ đã xếp ghế này cho người khác
  }
}
/** Máy chủ từ chối cho ngồi (ghế đã có người). */
export function sitRejected(s) {
  if (mySeat === s) { mySeat = -1; updateSitBtn(); }
  if (seatOcc.get(s) === "me") seatOcc.delete(s);
}

/* =====================================================================
   ĐIỀU KHIỂN
   ===================================================================== */
export function goTo(id) {
  standUp();
  const p = standPoint(id);
  walkTo(p.x, p.y, () => {
    camT.yaw = -SPOTS[id].r;
    if (id === "board") ctx.onBoard();
    else { camT.dist = CAM_BOOTH.dist; camT.pitch = CAM_BOOTH.pitch; camT.look = 1; zoomCb = () => ctx.onBooth(id); }
  });
}
export function zoomOut() { camT.dist = CAM_NORMAL.dist; camT.pitch = CAM_NORMAL.pitch; camT.look = 0; }
function walkTo(x, y, cb) { target = { x: Math.max(80, Math.min(FW - 80, x)), y: Math.max(80, Math.min(FW - 80, y)) }; onArrive = cb; }

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3();
function pickAt(cx, cy) {
  const r = G.renderer.domElement.getBoundingClientRect();
  ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, G.camera);
  const hits = ray.intersectObjects(G.pick, false);
  for (const h of hits) {
    if (h.object.userData.seats) return { seats: h.object.userData.seats, p: h.point };
    const occ = G.occ.find(o => o.id === h.object.userData.pick); if (!occ || occ.op > 0.6) return { id: h.object.userData.pick };
  }
  if (ray.ray.intersectPlane(plane, hitP)) return { x: hitP.x * U + CX, y: hitP.z * U + CY, p: hitP.clone() };
  return null;
}

let inputBound = false;
function bindInput() {
  if (inputBound) return; inputBound = true;
  const vp = $("viewport"); let d = null;
  vp.addEventListener("pointerdown", e => { if (!G || e.target.closest("button") || e.target.closest(".chat")) return; d = { x: e.clientX, y: e.clientY, yaw: cam.yaw, drag: false }; });
  window.addEventListener("pointermove", e => { if (!d) return; const dx = e.clientX - d.x; if (!d.drag && Math.abs(dx) + Math.abs(e.clientY - d.y) > 10) d.drag = true; if (d.drag) { cam.yaw = d.yaw - dx * .35; camT.yaw = null; } });
  window.addEventListener("pointerup", e => {
    if (!d) return; const wasDrag = d.drag; d = null;
    if (!G || wasDrag || !$("fair").classList.contains("on")) return;
    const h = pickAt(e.clientX, e.clientY); if (!h) return;
    if (h.id) return goTo(h.id);
    if (h.seats) return sitFrom(h.seats, h.p);
    if (Math.hypot(h.x - CX, h.y - CY) > FAIR_R + 300) return; // chạm ra quá xa khu hội chợ
    standUp();
    const r = vp.getBoundingClientRect(); tapDot(e.clientX - r.left, e.clientY - r.top);
    G.marker.m.position.set(h.p.x, 0.03, h.p.z); G.marker.t = 1;
    walkTo(h.x, h.y, null);
  });
  window.addEventListener("pointercancel", () => { d = null; });
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    if ((e.key === "e" || e.key === "E") && !e.repeat && $("fair").classList.contains("on")) { promptAction(); return; }
    keys[e.key.toLowerCase()] = true;
  });
  document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener("blur", () => { keys = {}; });
}
function tapDot(x, y) { const el = document.createElement("div"); el.className = "tapdot"; el.style.left = x + "px"; el.style.top = y + "px"; $("viewport").appendChild(el); setTimeout(() => el.remove(), 650); }
function blockPush(p) { BLOCK.forEach(([bx, by, br]) => { const dx = p.x - bx, dy = p.y - by, dd = Math.hypot(dx, dy); if (dd < br && dd > 0) { p.x = bx + dx / dd * br; p.y = by + dy / dd * br; } }); p.x = Math.max(80, Math.min(FW - 80, p.x)); p.y = Math.max(80, Math.min(FW - 80, p.y)); }
/** Bước về phía đích; gặp vật cản thì trượt vòng theo mép thay vì đứng kẹt. */
function stepToward(p, tx, ty, sp, dt) {
  const dx = tx - p.x, dy = ty - p.y, dd = Math.hypot(dx, dy); if (dd < 4) return true;
  const len = Math.min(dd, sp * dt), ux = dx / dd, uy = dy / dd;
  let nx = p.x + ux * len, ny = p.y + uy * len;
  for (const [bx, by, br] of BLOCK) {
    const ox = nx - bx, oy = ny - by, od = Math.hypot(ox, oy);
    if (od >= br + 2 || Math.hypot(tx - bx, ty - by) < br) continue;
    // hướng tiếp tuyến với vòng tròn vật cản, chọn phía gần đích hơn
    const rx = (p.x - bx) / (Math.hypot(p.x - bx, p.y - by) || 1), ry = (p.y - by) / (Math.hypot(p.x - bx, p.y - by) || 1);
    let sx = -ry, sy = rx; const dot = sx * ux + sy * uy;
    if (dot < 0 || (Math.abs(dot) < 1e-3 && p.x < bx)) { sx = -sx; sy = -sy; }
    nx = p.x + sx * len; ny = p.y + sy * len;
  }
  p.x = nx; p.y = ny; blockPush(p);
  return Math.hypot(tx - p.x, ty - p.y) < 4;
}

/* =====================================================================
   VÒNG LẶP
   ===================================================================== */
export function startHub() { cancelAnimationFrame(raf); last = null; zoomOut(); if (G) { resize(); raf = requestAnimationFrame(loop); } }

const v3 = new THREE.Vector3(), look = new THREE.Vector3();
function loop(ts) {
  if (!G || !$("fair").classList.contains("on")) return;
  const dt = last == null ? 0 : Math.min(.05, (ts - last) / 1000); last = ts; G.t += dt;
  G.watch.tick(dt);
  const Y = cam.yaw * DEG; let walking = false;
  const kx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), ky = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  const px0 = me.x, py0 = me.y;
  if (kx || ky) {
    target = null; onArrive = null; standUp(); const fx = -Math.sin(Y), fy = -Math.cos(Y), rx = Math.cos(Y), ry = -Math.sin(Y), n = Math.hypot(kx, ky);
    me.x += (rx * kx - fx * ky) / n * SPEED * dt; me.y += (ry * kx - fy * ky) / n * SPEED * dt; blockPush(me); walking = true;
  } else if (target) {
    const done = stepToward(me, target.x, target.y, SPEED, dt);
    stuck = Math.hypot(me.x - px0, me.y - py0) < .2 && dt > 0 ? stuck + 1 : 0;
    if (done || stuck > 20) { target = null; stuck = 0; const f = onArrive; onArrive = null; if (f) f(); } else walking = true;
  }
  if (walking && !moved) { moved = true; $("hint3").style.opacity = 0; }
  if ((Math.abs(me.x - sentX) > 2 || Math.abs(me.y - sentY) > 2) && ts - sentAt > 120) { sentAt = ts; sentX = me.x; sentY = me.y; ctx.send({ t: "pos", x: Math.round(me.x), y: Math.round(me.y) }); }

  // nhân vật của mình
  const mine = G.avatars.get("avo");
  animateAvatar(mine, me.x, me.y, me.x - px0, me.y - py0, walking, dt, mySeat);
  // người chơi khác: trượt mượt tới vị trí mới nhận
  for (const p of peers.values()) {
    const dx = p.tx - p.x, dy = p.ty - p.y, dd = Math.hypot(dx, dy), w = dd > 2;
    const ox = p.x, oy = p.y;
    if (dd > 400) { p.x = p.tx; p.y = p.ty; } else if (w) { const k = Math.min(1, dt * 8); p.x += dx * k; p.y += dy * k; }
    const a = G.avatars.get("p_" + p.id); if (a && a.root.visible) animateAvatar(a, p.x, p.y, p.x - ox, p.y - oy, w && p.seat < 0, dt, p.seat);
  }

  // máy quay bám theo
  const k = Math.min(1, dt * 5), slow = cam.dist > CAM_NORMAL.dist + 4 ? 1.6 : 5;
  cam.x += (me.x - cam.x) * k; cam.y += (me.y - cam.y) * k;
  cam.dist += (camT.dist - cam.dist) * Math.min(1, dt * slow); cam.pitch += (camT.pitch - cam.pitch) * Math.min(1, dt * slow); cam.look += (camT.look - cam.look) * Math.min(1, dt * 4);
  if (camT.yaw != null) { const dy = ((camT.yaw - cam.yaw) % 360 + 540) % 360 - 180; cam.yaw += dy * Math.min(1, dt * 5); if (Math.abs(dy) < .3) camT.yaw = null; }
  const Yc = cam.yaw * DEG, P = cam.pitch * DEG, fx = -Math.sin(Yc), fz = -Math.cos(Yc);
  look.set(wx(cam.x) + fx * cam.look * 1.4, 0.8 + cam.look * 0.6, wz(cam.y) + fz * cam.look * 1.4);
  G.camera.position.set(look.x - fx * cam.dist * Math.cos(P), look.y + cam.dist * Math.sin(P), look.z - fz * cam.dist * Math.cos(P));
  G.camera.lookAt(look);
  G.sky.position.copy(G.camera.position); G.stars.position.copy(G.camera.position);

  // làm mờ vật che giữa máy quay và nhân vật
  const bx = Math.sin(Yc), by = Math.cos(Yc);
  G.occ.forEach(o => {
    const vx = o.x - me.x, vy = o.y - me.y, t = vx * bx + vy * by, perp = Math.abs(vx * by - vy * bx);
    const near = Math.hypot(wx(o.x) - G.camera.position.x, wz(o.y) - G.camera.position.z) < (o.near || 3);
    const want = near ? 0.15 : (t > 20 && t < 760 && perp < 210 && cam.dist > CAM_BOOTH.dist + 1) ? 0.3 : 1;
    if (Math.abs(o.op - want) > 0.01) { o.op += (want - o.op) * Math.min(1, dt * 14); if (Math.abs(o.op - want) < 0.02) o.op = want; setOpacity(o, o.op); }
  });

  animateProps(dt);
  updateSeatPrompt();
  if (G.marker.t > 0) { G.marker.t = Math.max(0, G.marker.t - dt * 1.6); G.marker.m.material.opacity = G.marker.t; const s = 1 + (1 - G.marker.t) * 0.8; G.marker.m.scale.set(s, s, s); }
  if (Math.random() < dt * .5) firework();
  updateFireworks(dt);
  G.renderer.render(G.scene, G.camera);
  updateLabels();
  if (zoomCb && Math.abs(cam.dist - camT.dist) < 0.12) { const f = zoomCb; zoomCb = null; f(); }
  raf = requestAnimationFrame(loop);
}

function animateAvatar(a, x, y, dx, dy, walking, dt, seat = -1) {
  if (!a) return;
  a.root.position.set(wx(x), 0, wz(y));
  const se = seat >= 0 ? SEATS[seat] : null;
  a.sitAmt = (a.sitAmt || 0) + ((se ? 1 : 0) - (a.sitAmt || 0)) * Math.min(1, dt * 8);
  const want = se ? se.face : Math.abs(dx) + Math.abs(dy) > 0.05 ? Math.atan2(dx, dy) : null;
  if (want !== null) { const d = ((want - a.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a.face += d * Math.min(1, dt * 12); }
  a.body.rotation.y = a.face;
  a.phase += dt * (walking ? 11 : 2.2);
  a.hop = Math.max(0, a.hop - dt * 2.5);
  const bounce = walking ? Math.abs(Math.cos(a.phase)) * 0.05 : 0;
  const breathe = walking ? 1 : 1 + Math.sin(a.phase) * 0.012;
  const jump = Math.sin(a.hop * Math.PI) * 0.22;
  // ngồi: hông nâng lên ngang mặt ghế, lùi nhẹ về sau để ngồi lên ghế
  const sitH = se ? se.h - 0.36 : (a.lastSitH || 0); if (se) a.lastSitH = sitH;
  a.body.position.y = bounce + jump + sitH * a.sitAmt;
  a.body.position.x = -Math.sin(a.face) * 0.12 * a.sitAmt; a.body.position.z = -Math.cos(a.face) * 0.12 * a.sitAmt;
  a.body.rotation.z = walking ? Math.sin(a.phase) * 0.04 : 0;
  a.body.rotation.x = walking ? 0.06 : 0;
  a.body.scale.set(1, breathe, 1);
  animateCharacter(a, walking, dt);
  a.walk = walking;
}

const ZERO = new THREE.Vector3(0, 0, 0);
function animateProps(dt) {
  const t = G.t;
  for (const a of G.anim) {
    if (a.k === "bob") a.o.position.y = a.y + Math.sin(t * 2.1 + a.p) * 0.05;
    else if (a.k === "float") a.o.position.y = a.y + Math.sin(t * 2.6 + a.p) * 0.08;
    else if (a.k === "swing") a.o.rotation.z = Math.sin(t * 2.4 + a.p) * 0.12;
  }
  // đèn lồng đung đưa
  const L = G.lanterns, m = new THREE.Matrix4(), r = new THREE.Matrix4();
  const cp = G.camera.position, dx = wx(me.x) - cp.x, dz = wz(me.y) - cp.z, dd = dx * dx + dz * dz || 1;
  L.pts.forEach(([x, z, i], k) => {
    m.makeTranslation(x, 2.4, z); r.makeRotationZ(Math.sin(t * 2.2 + i * .7) * 0.12); m.multiply(r);
    // nằm giữa máy quay và nhân vật (hoặc sát máy quay): ẩn cả cột để không che tầm nhìn
    const ex = x - cp.x, ez = z - cp.z, el = Math.hypot(ex, ez), cosA = (ex * dx + ez * dz) / (el * Math.sqrt(dd) || 1);
    const near = el < 2.5 || (cosA > 0.8 && el < Math.sqrt(dd) * 0.85); // trong khoảng ±37° trước máy quay, gần hơn nhân vật
    if (near) m.scale(ZERO);
    L.mesh.setMatrixAt(k, m);
    m.makeTranslation(x, 0, z); if (near) m.scale(ZERO); L.poles.setMatrixAt(k, m);
    L.glow.attributes.position.setY(k, near ? -50 : 2.1);
  });
  L.glow.attributes.position.needsUpdate = true; L.poles.instanceMatrix.needsUpdate = true;
  L.mesh.instanceMatrix.needsUpdate = true;
}

function setOpacity(o, op) {
  o.g.traverse(m => {
    if (!m.material) return;
    (Array.isArray(m.material) ? m.material : [m.material]).forEach(mt => {
      if (mt.userData.baseT === undefined) mt.userData.baseT = mt.transparent;
      const tr = op < 1 || mt.userData.baseT;
      if (mt.transparent !== tr) { mt.transparent = tr; mt.needsUpdate = true; } // đổi đặc/trong suốt phải biên dịch lại shader
      mt.opacity = op; mt.depthWrite = op >= 1;
    });
  });
}

/** Đặt nhãn HTML theo vị trí 3D đã chiếu lên màn hình. */
function updateLabels() {
  if (!G.lbls) return;
  const w = G.renderer.domElement.clientWidth, h = G.renderer.domElement.clientHeight, camPos = G.camera.position;
  for (const l of G.lbls) {
    const vis = l.obj.visible !== false && l.el.style.display !== "none";
    l.obj.updateMatrixWorld();
    v3.copy(l.off).applyMatrix4(l.obj.matrixWorld);
    const dist = v3.distanceTo(camPos);
    v3.project(G.camera);
    const on = vis && v3.z < 1 && v3.x > -1.3 && v3.x < 1.3 && v3.y > -1.3 && v3.y < 1.3 && dist < 26;
    if (on !== l.shown) { l.shown = on; l.el.style.visibility = on ? "visible" : "hidden"; }
    if (!on) continue;
    const x = Math.round((v3.x + 1) / 2 * w), y = Math.round((1 - v3.y) / 2 * h);
    if (x !== l.x || y !== l.y) { l.x = x; l.y = y; l.el.style.transform = "translate3d(" + x + "px," + y + "px,0)"; }
    if (l.el.classList.contains("av")) {
      const op = dist > 16 ? Math.max(0, 1 - (dist - 16) / 8) : 1;
      if (Math.abs((l.op ?? 1) - op) > 0.05) { l.op = op; l.el.style.opacity = op.toFixed(2); }
    }
  }
}
