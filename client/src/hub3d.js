// Sảnh hội chợ 3D bằng Three.js: ánh sáng hoàng hôn, bóng đổ, gian hàng, nhân vật, đèn lồng, pháo hoa.
// Giữ nguyên giao diện hàm của bản CSS 3D (hubCss.js) để main.js không phải đổi.
// Tọa độ thế giới tính theo "px" của sân (shared/world.js, dùng chung với máy chủ); 100 px = 1 đơn vị Three.js.
import * as THREE from "three";
import { $, esc, beep } from "./ui.js";
import { BOOTHS, PLACE_NAME, CAFE } from "./config.js";
import { EMOTES } from "./hubCss.js";
import { initialQuality } from "./gfx/webgl.js";
import {
  createRenderer, applyQuality, QualityWatch, setMaxAniso, canvasTex, emojiSprite, blobTex, glowTex,
  rrect, fitText, mergeParts, disposeTree, waitFonts, FONT
} from "./gfx/kit.js";
import { setMyGender, peerLook, characterGeometry, characterMaterial, animateCharacter } from "./gfx/character.js";
import { loadKit, hasKit, model } from "./gfx/models.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WORLD, CENTER, GATE, SPAWN, SPOTS, LOCKED, BLOCK as WORLD_BLOCK, BENCHES, TABLES, SEATS, PLAZA_R, FAIR_R, PAVILION, standPoint } from "../../shared/world.js";

export { EMOTES };

const FW = WORLD, CX = CENTER.x, CY = CENTER.y, U = 100; // 100 px = 1 đơn vị Three.js
const BLOCK = WORLD_BLOCK.map(b => b.slice()); // thêm vật cản trang trí khi dựng cảnh
const SPEED = 500; // px/giây (sân rộng nên đi nhanh hơn)
const RF = FAIR_R / U; // bán kính khu lát gạch (đơn vị 3D)
const wx = x => (x - CX) / U, wz = y => (y - CY) / U;
const DEG = Math.PI / 180;
/** Các lớp phẳng chồng lên mặt đất (sân gạch, lối đi, thảm): đẩy dần về phía máy quay để không nhấp nháy (z-fighting) trên điện thoại. */
function layer(mat, k) { mat.polygonOffset = true; mat.polygonOffsetFactor = -k; mat.polygonOffsetUnits = -k * 4; return mat; }

// Máy quay: khoảng cách và góc ngẩng (độ) cho 3 trạng thái
const CAM_NORMAL = { dist: 8.6, pitch: 33 }, CAM_BOOTH = { dist: 9.5, pitch: 14 }, CAM_INTRO = { dist: 34, pitch: 58 };

const me = { x: SPAWN.x, y: SPAWN.y };
const cam = { x: SPAWN.x, y: SPAWN.y, yaw: 0, dist: CAM_INTRO.dist, pitch: CAM_INTRO.pitch, look: 0 };
// Góc nhìn kiểu "đi chùa online": thứ ba = máy quay sát sau vai (lệch sang phải), thứ nhất = nhìn bằng mắt nhân vật.
// Kéo màn hình để nhìn quanh (cả trái phải và lên xuống), W A S D / cần điều khiển để đi, Shift để chạy.
const VIEW = { eye: 0.98, dist: 4.2, side: 0.55, height: 1.7, ahead: 1.6 };
let view = (() => { try { return localStorage.getItem("hc_view") === "first" ? "first" : "third"; } catch (e) { return "third"; } })();
let lookPitch = -6, viewBlend = view === "third" ? 1 : 0, intro = 1; // lookPitch: độ, âm = nhìn xuống
const joy = { x: 0, y: 0 };
const camT = { dist: CAM_NORMAL.dist, pitch: CAM_NORMAL.pitch, yaw: null, look: 0 };
let zoomAt = 0;
let target = null, onArrive = null, zoomCb = null, raf = 0, last = null, keys = {}, moved = false, sentAt = 0, sentX = 0, sentY = 0, stuck = 0;
let ctx = null, peers = new Map(), hidden = new Set();
let mySeat = -1; const seatOcc = new Map(); // chỗ ngồi -> "me" hoặc mã người chơi
let G = null; // mọi thứ thuộc về cảnh Three.js hiện tại

/** Nạp trước phông chữ để vẽ biển hiệu. main.js gọi qua hub.prepareHub() lúc đang tải. */
export function preload() { return Promise.all([waitFonts(), loadKit(), loadPavModel()]); }

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
  scene.fog = new THREE.Fog(0xe9967a, 30, 90);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.4, 220);
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
  BOOTHS.forEach(b => buildPavilion(scene, b, kit));
  LOCKED.forEach(l => (kit ? buildLockedKit : buildLocked)(scene, l.x, l.y, l.r, l.name, l.id));
  buildCafe(scene);
  if (kit) buildDecor(scene);
  buildSeating(scene, kit);
  buildBoard(scene);
  buildFireworks(scene);
  buildMarker(scene);
  buildSeatPrompt(scene);
  buildEnterButtons(scene);
  addAvatar("avo", ctx.nick + " (bạn)", 7, true);
  setShadows(q >= 1);

  // nút nhảy nhanh và biểu cảm (giống bản CSS)
  $("jumps").innerHTML = BOOTHS.map(b => '<button data-j="' + b.id + '"><i>' + b.icons.slice(0, 2) + "</i>" + b.tag + "</button>").join("") + '<button data-j="cafe"><i>☕</i>Cà phê</button><button data-j="board"><i>🏆</i>Bảng vàng</button><button id="sitBtn"><i>🪑</i>Ngồi</button>';
  $("jumps").querySelectorAll("button[data-j]").forEach(btn => btn.onclick = () => goTo(btn.dataset.j));
  $("sitBtn").onclick = () => (mySeat >= 0 ? standUp() : sitNearest());
  $("hint3").textContent = matchMedia("(hover: hover) and (pointer: fine)").matches ? "W A S D để đi · Shift chạy · Kéo chuột để nhìn · V đổi góc nhìn" : "Cần điều khiển để đi · Kéo để nhìn quanh · Chạm đất để đi tới";
  mySeat = -1; seatOcc.clear(); me.x = SPAWN.x; me.y = SPAWN.y;
  $("emo").innerHTML = EMOTES.map((e, i) => '<button data-e="' + i + '"><i>' + e[0] + "</i>" + e[1] + "</button>").join("");
  $("emo").querySelectorAll("button").forEach(btn => btn.onclick = () => { const i = +btn.dataset.e; bubble("avo", EMOTES[i][0]); hop("avo"); beep("coin"); ctx.send({ t: "emote", e: i }); ctx.onEmote && ctx.onEmote(i); });

  G.ro = new ResizeObserver(resize); G.ro.observe(vp); resize();
  window.__hub3d = () => G && { calls: G.renderer.info.render.calls, tris: G.renderer.info.render.triangles, q: G.q, // hỗ trợ kiểm thử, đo hiệu năng
    me: [Math.round(me.x), Math.round(me.y)], cam: G.camera.position.toArray().map(v => +v.toFixed(2)), gate: (G.occ.find(o => o.id === "gate") || {}).op };
  // hỗ trợ kiểm thử: đặt nhân vật và máy quay để chụp ảnh
  window.__hubView = (x, y, yaw, v, pitch) => { me.x = x; me.y = y; target = null; cam.x = x; cam.y = y; camT.yaw = null; cam.yaw = yaw; intro = 0; if (v === "first" || v === "third") { view = v; viewBlend = v === "third" ? 1 : 0; } if (pitch != null) lookPitch = pitch; };
  bindInput(); buildJoystick();
  cam.dist = CAM_INTRO.dist; cam.pitch = CAM_INTRO.pitch; cam.x = me.x; cam.y = me.y; intro = 1;
}

function dispose() {
  cancelAnimationFrame(raf);
  if (!G) return;
  G.ro && G.ro.disconnect();
  G.observers.forEach(o => o.disconnect());
  disposeTree(G.scene);
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
  const s = sun.shadow.camera; s.left = -16; s.right = 16; s.top = 16; s.bottom = -16; s.near = 1; s.far = 70;
  sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target); G.sun = sun; G.sunAt = new THREE.Vector2(1e9, 0);
  // ánh đèn ấm từ phía cổng để mặt trước gian hàng không bị tối
  const fill = new THREE.DirectionalLight(0xff9a6a, 0.6); fill.position.set(6, 5, 12); scene.add(fill);
  const back = new THREE.DirectionalLight(0xb48cff, 0.35); back.position.set(4, 6, -12); scene.add(back); // ánh tím từ phía bắc cho mặt gian quay về cổng
}

function buildGround(scene) {
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#5a9a45"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = Math.random() < .5 ? "rgba(40,90,35,.35)" : "rgba(140,200,90,.25)"; g.fillRect(Math.random() * w, Math.random() * h, 2, 3 + Math.random() * 4); }
  }, { repeat: [18, 18] });
  grassTex.repeat.set(54, 54);
  const grass = new THREE.Mesh(new THREE.CircleGeometry(100, 64), new THREE.MeshLambertMaterial({ map: grassTex }));
  grass.rotation.x = -Math.PI / 2; grass.receiveShadow = true; scene.add(grass); G.ground = grass;

  // sân lát gạch hình tròn, có vòng và tia như bản CSS
  const R = PLAZA_R / U;
  // khu lát gạch lớn của hội chợ
  const brick = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = "#c99a68"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(100,55,20,.28)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 32) % 2 * 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } }
    for (let i = 0; i < 900; i++) { g.fillStyle = Math.random() < .5 ? "rgba(255,255,255,.05)" : "rgba(80,40,10,.07)"; g.fillRect(Math.random() * w, Math.random() * h, 3, 3); }
  }, { repeat: [44, 44] });
  const fair = new THREE.Mesh(new THREE.CircleGeometry(RF, 120), layer(new THREE.MeshLambertMaterial({ map: brick }), 1));
  fair.rotation.x = -Math.PI / 2; fair.position.y = 0.01; fair.receiveShadow = true; scene.add(fair);
  const fcurb = new THREE.Mesh(new THREE.TorusGeometry(RF, 0.12, 6, 160), new THREE.MeshLambertMaterial({ color: 0x9a6034 }));
  fcurb.rotation.x = -Math.PI / 2; fcurb.position.y = 0.02; scene.add(fcurb);
  // lối gạch đỏ từ sân trống ra 3 gian và cổng
  const lane = layer(new THREE.MeshLambertMaterial({ color: 0xb8643f }), 2);
  for (const [x, y] of [[SPOTS.g1.x, SPOTS.g1.y], [SPOTS.g2.x, SPOTS.g2.y], [SPOTS.g3.x, SPOTS.g3.y], [GATE.x, GATE.y]]) {
    const dx = wx(x), dz = wz(y), len = Math.hypot(dx, dz) - R, mid = R + len / 2, a = Math.atan2(dx, dz);
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(2.4, len), lane);
    strip.rotation.set(-Math.PI / 2, 0, a); strip.position.set(Math.sin(a) * mid, 0.02, Math.cos(a) * mid); strip.receiveShadow = true; scene.add(strip);
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
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(R, 96), layer(new THREE.MeshLambertMaterial({ map: plazaTex }), 3));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; plaza.receiveShadow = true; scene.add(plaza);
  // lối đi từ cổng vào
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 9), new THREE.MeshLambertMaterial({ map: canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = "#cf9b66"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(110,60,25,.3)"; g.lineWidth = 2;
    for (let y = 0; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 24) % 2 * 21; x < w; x += 42) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 24); g.stroke(); } }
  }) }));
  layer(path.material, 2); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, wz(GATE.y) + 4.4); path.receiveShadow = true; scene.add(path);
  // bờ đá quanh sân
  const curb = new THREE.Mesh(new THREE.TorusGeometry(R, 0.1, 6, 128), new THREE.MeshLambertMaterial({ color: 0xa96a3a }));
  curb.rotation.x = -Math.PI / 2; curb.position.y = 0.035; curb.receiveShadow = true; scene.add(curb);
}

/* ---------- Cây: mai vàng, đào hồng, cây xanh (vẽ theo lô, ít lệnh vẽ) ---------- */
function buildTrees(scene) {
  const spots = [];
  for (let i = 0; i < 90; i++) { const a = i / 90 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .1) continue; spots.push([Math.cos(a) * (RF + 1.5), Math.sin(a) * (RF + 1.5), i]); }
  for (let i = 0; i < 110; i++) { const a = i / 110 * Math.PI * 2 + .03; if (Math.abs(a - Math.PI / 2) < .07) continue; spots.push([Math.cos(a) * (RF + 5), Math.sin(a) * (RF + 5), i + 3]); }
  // cụm cây trong sân, ở các khoảng trống giữa các lối đi (cố định, giống nhau trên mọi máy)
  const clear = (x, z) => {
    const r = Math.hypot(x, z), a = Math.atan2(z, x);
    if (r < PLAZA_R / U + 8 || r > RF - 2.5) return false;
    if ([0, Math.PI / 2, Math.PI, -Math.PI / 2].some(l => Math.abs(Math.atan2(Math.sin(a - l), Math.cos(a - l))) * r < 3)) return false; // lối đi
    return ![...Object.values(SPOTS), ...LOCKED, ...TABLES].some(o => Math.hypot(wx(o.x) - x, wz(o.y) - z) < 4.5);
  };
  for (let i = 0; spots.length < 260 && i < 2000; i++) {
    const a = (i * 2.399963) % (Math.PI * 2), r = PLAZA_R / U + 8 + ((i * 0.618034) % 1) * (RF - PLAZA_R / U - 10);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (clear(x, z)) spots.push([x, z, i + 7]);
  }
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
  for (let i = 0; i < 56; i++) { const a = i / 56 * Math.PI * 2 + Math.PI / 56; if (Math.abs(a - Math.PI / 2) < .08) continue; pts.push([Math.cos(a) * (RF - 0.4), Math.sin(a) * (RF - 0.4), i]); }
  // hai hàng đèn dọc các lối từ sân trống ra 3 gian và ra cổng
  for (const [ex, ez] of [[wx(SPOTS.g1.x), wz(SPOTS.g1.y)], [wx(SPOTS.g2.x), wz(SPOTS.g2.y)], [wx(SPOTS.g3.x), wz(SPOTS.g3.y)], [wx(GATE.x), wz(GATE.y)]]) {
    const len = Math.hypot(ex, ez), ux = ex / len, uz = ez / len, stop = ex === wx(GATE.x) && ez === wz(GATE.y) ? 3 : PAVILION.hd / U + 4.5; // dừng trước thềm gian
    for (let d = PLAZA_R / U + 1.5; d < len - stop; d += 3.6) for (const side of [-1, 1]) pts.push([ux * d - uz * side * 1.9, uz * d + ux * side * 1.9, pts.length]);
  }
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
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 4.2) continue; // chỉ nối hai cột liền nhau (bỏ đoạn qua cổng)
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


/* ---------- Quán cà phê (góc tây bắc): sàn gỗ, quầy, mái bạt nâu kem, ly cà phê khổng lồ, bàn dù, dây đèn ---------- */
function buildCafe(scene) {
  const sp = SPOTS.cafe, g = new THREE.Group(); g.position.set(wx(sp.x), 0, wz(sp.y)); g.rotation.y = -sp.r * DEG;
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); g.add(m); return m; };
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.8 }), dark = new THREE.MeshStandardMaterial({ color: 0x4a2c16, roughness: 0.85 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf6e7cc, roughness: 0.85 }), brown = new THREE.MeshStandardMaterial({ color: 0x7a4a2a, roughness: 0.6 });
  const deckTex = canvasTex(256, 256, (c, w, h) => { for (let j = 0; j < 8; j++) { c.fillStyle = j % 2 ? "#a8743f" : "#97652f"; c.fillRect(0, j * h / 8, w, h / 8); c.fillStyle = "rgba(50,25,8,.35)"; c.fillRect(0, j * h / 8, w, 2); } }, { repeat: [2, 2] });
  const deck = add(new THREE.BoxGeometry(6.2, 0.2, 4.6), [dark, dark, new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.8 }), dark, dark, dark], 0, 0.1, 0.3);
  // quầy và vách sau có bảng thực đơn
  add(new THREE.BoxGeometry(4.2, 2.6, 0.14), cream, 0, 1.5, -1.75);
  const menu = canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = "#2f3a33"; rrect(c, 4, 4, w - 8, h - 8, 16); c.fill(); c.strokeStyle = "#c79a5b"; c.lineWidth = 10; rrect(c, 8, 8, w - 16, h - 16, 14); c.stroke();
    c.textAlign = "center"; c.fillStyle = "#ffe7b8"; fitText(c, "THỰC ĐƠN", w / 2, 50, w - 60, 40, 900);
    c.fillStyle = "#fff"; c.textAlign = "left"; [["☕ Cà phê sữa đá", "Mời"], ["🥛 Bạc xỉu", "Mời"], ["🍑 Trà đào", "Mời"], ["🎵 Nhạc hay", "Miễn phí"]].forEach(([a, b], i) => { fitText(c, a, 40, 102 + i * 38, 300, 28, 700); c.textAlign = "right"; fitText(c, b, w - 40, 102 + i * 38, 140, 26, 700); c.textAlign = "left"; });
  });
  const board = add(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshStandardMaterial({ map: menu, roughness: 0.9 }), 0, 1.9, -1.67);
  const ctex = canvasTex(512, 128, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#8a5a32"); gr.addColorStop(1, "#5a361a"); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#ffe7b8"; fitText(c, "☕ Cà phê · 🎵 Nhạc · 💬 Trò chuyện", w / 2, h / 2, w - 30, 40, 800); });
  add(new THREE.BoxGeometry(3.6, 1.0, 0.6), [wood, wood, wood, wood, new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.8 }), wood], 0, 0.7, -0.8);
  add(new THREE.BoxGeometry(3.7, 0.08, 0.72), cream, 0, 1.24, -0.8);
  for (const [e, x] of [["☕", -1.2], ["🧋", -0.3], ["🥐", 0.6], ["🍰", 1.3]]) { const s = emojiSprite(e, 0.42); s.position.set(x, 1.5, -0.8); g.add(s); }
  // mái bạt sọc nâu kem
  const awnTex = canvasTex(512, 256, (c, w, h) => { const n = 8, sw = w / n, body = h * 0.72, r = sw / 2; for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? "#fff3dc" : "#7a4a2a"; c.fillRect(i * sw, 0, sw, body); c.beginPath(); c.arc(i * sw + r, body, r, 0, Math.PI); c.fill(); } });
  const awn = add(new THREE.PlaneGeometry(4.8, 1.7), new THREE.MeshStandardMaterial({ map: awnTex, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.75 }), 0, 2.75, -0.55); awn.rotation.x = -1.0;
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 2.9, 8), dark, sx * 2.05, 1.55, -0.1);
  // biển tên và ly cà phê khổng lồ trên nóc
  const sign = canvasTex(512, 160, (c, w, h) => { c.fillStyle = "#7a4a2a"; rrect(c, 6, 6, w - 12, h - 12, 30); c.fill(); c.strokeStyle = "#ffc533"; c.lineWidth = 8; rrect(c, 10, 10, w - 20, h - 20, 26); c.stroke(); c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#ffe7b8"; fitText(c, "QUÁN CÀ PHÊ", w / 2, 50, w - 80, 30, 800); c.fillStyle = "#fff"; fitText(c, "Cà phê Hội chợ", w / 2, 108, w - 60, 54, 900); });
  const sg = add(new THREE.BoxGeometry(2.6, 0.82, 0.08), [dark, dark, dark, dark, new THREE.MeshStandardMaterial({ map: sign, roughness: 0.5, emissive: 0x1a0d00 }), dark], 0, 3.45, -1.7);
  G.anim.push({ o: sg, k: "bob", y: 3.45, p: 3 });
  const cupG = new THREE.Group(); cupG.position.set(0, 4.3, -1.75); g.add(cupG);
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.9, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })); cupG.add(cup);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), new THREE.MeshStandardMaterial({ color: 0x5a3214, roughness: 0.4 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.44; cupG.add(coffee);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16, Math.PI * 1.3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 })); handle.position.set(0.58, 0.02, 0); handle.rotation.z = -Math.PI * 0.65; cupG.add(handle);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.48, 0.18, 24, 1, true), brown); band.position.y = -0.05; cupG.add(band);
  const steam = emojiSprite("♨️", 0.6); steam.position.set(0, 5.15, -1.75); g.add(steam); G.anim.push({ o: steam, k: "float", y: 5.15, p: 1 });
  // nốt nhạc bay quanh loa khi đang phát nhạc
  G.cafeNotes = [];
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.45, 0.7, 0.35), dark, sx * 1.75, 1.6, -1.55);
    const n = emojiSprite(sx > 0 ? "🎵" : "🎶", 0.5); n.position.set(sx * 1.75, 2.3, -1.4); n.visible = false; g.add(n); G.cafeNotes.push({ o: n, sx });
  }
  // bàn dù ngoài hiên
  const umb = [0xc8102e, 0x0f8a5f, 0xe0a030];
  [[-2.1, 1.4], [0, 1.9], [2.1, 1.4]].forEach(([x, z], i) => {
    add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 18), cream, x, 0.78, z);
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.1, 6), dark, x, 1.25, z);
    const top = add(new THREE.ConeGeometry(0.95, 0.42, 8), new THREE.MeshStandardMaterial({ color: umb[i], roughness: 0.6 }), x, 2.35, z);
    for (const a of [0.4, Math.PI + 0.4]) add(new THREE.CylinderGeometry(0.17, 0.17, 0.45, 10), wood, x + Math.cos(a) * 0.7, 0.42, z + Math.sin(a) * 0.7);
    const cupS = emojiSprite(i === 1 ? "🧋" : "☕", 0.3); cupS.position.set(x, 0.98, z); g.add(cupS);
  });
  // dây đèn bóng tròn
  const bulbs = [];
  for (let i = 0; i <= 10; i++) { const k = i / 10, x = -3 + k * 6, y = 2.65 - Math.sin(k * Math.PI) * 0.35; bulbs.push(x, y, 2.55); }
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.04, 0.05, 2.7, 6), dark, sx * 3, 1.35, 2.55);
  const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(bulbs), 3));
  const glow = new THREE.Points(bg, new THREE.PointsMaterial({ map: glowTex(), color: 0xffd58a, size: 0.7, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(glow);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.pick = "cafe"; G.pick.push(o); } });
  scene.add(g);
  G.occ.push({ id: "cafe", x: sp.x, y: sp.y, g, op: 1, w: 260, near: 5 });
}
/** Có nhạc trong quán thì nốt nhạc bay quanh loa (main.js gọi theo /api/match). */
export function setCafeMusic(on) { G.cafeOn = !!on; }

/* ---------- Gian hàng lớn: nhà triển lãm mái ngói hai tầng, cột sơn son, bậc thềm, thảm đỏ ---------- */
let PM = null; // vật liệu dùng chung cho cả 3 gian
function pavMats() {
  if (PM) return PM;
  const tile = canvasTex(256, 256, (g, w, h) => { // ngói âm dương: hàng ngói và rãnh
    g.fillStyle = "#b5482c"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 16; i++) { const x = i * w / 16; const gr = g.createLinearGradient(x, 0, x + w / 16, 0); gr.addColorStop(0, "#8e321c"); gr.addColorStop(.5, "#cf6040"); gr.addColorStop(1, "#8e321c"); g.fillStyle = gr; g.fillRect(x, 0, w / 16, h); }
    for (let j = 0; j < 8; j++) { g.fillStyle = "rgba(60,15,5,.35)"; g.fillRect(0, j * h / 8, w, 3); }
  }, { repeat: [3, 1.5] });
  const stone = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = "#e9dcc2"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(120,95,60,.35)"; g.lineWidth = 3;
    for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) g.strokeRect(i * w / 5 + (j % 2) * w / 10, j * h / 4, w / 5, h / 4);
  }, { repeat: [4, 1] });
  PM = {
    tile: new THREE.MeshStandardMaterial({ map: tile, roughness: 0.7 }),
    tileDark: new THREE.MeshStandardMaterial({ color: 0x7a2614, roughness: 0.8 }),
    stone: new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9 }),
    stoneDark: new THREE.MeshStandardMaterial({ color: 0xbfa985, roughness: 0.9 }),
    lacquer: new THREE.MeshStandardMaterial({ color: 0xa8141c, roughness: 0.38, metalness: 0.1 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe0ac3a, roughness: 0.3, metalness: 0.75, emissive: 0x3a2400 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x8a5428, roughness: 0.75 }),
    floor: new THREE.MeshStandardMaterial({ color: 0xb07a45, roughness: 0.65 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xfff1d6, roughness: 0.9 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x2f8a3c }),
    pot: new THREE.MeshStandardMaterial({ color: 0x2f5d8a, roughness: 0.4, metalness: 0.1 }),
    lantern: new THREE.MeshLambertMaterial({ color: 0xe01b3c, emissive: 0xff3a1a, emissiveIntensity: 0.7 })
  };
  return PM;
}
/** Mái hông (hình chóp cụt chữ nhật): đáy w×d, đỉnh tw×td, cao h. */
function hipRoof(w, d, tw, td, h, mat) {
  const geo = new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2, h, 4, 1, false, Math.PI / 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const top = pos.getY(i) > 0; pos.setX(i, pos.getX(i) * (top ? tw : w)); pos.setZ(i, pos.getZ(i) * (top ? td : d)); }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
/** Đầu đao cong vút ở góc mái. */
function roofHorn(mat) {
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.38, 0.02, 0), new THREE.Vector3(0.5, 0.42, 0));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.07, 6, false), mat);
}
function posterTex(b) {
  return canvasTex(768, 320, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, b.c); gr.addColorStop(1, "#2b1a12");
    g.fillStyle = gr; rrect(g, 0, 0, w, h, 26); g.fill();
    g.strokeStyle = "#ffc533"; g.lineWidth = 10; rrect(g, 12, 12, w - 24, h - 24, 20); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = "130px " + FONT; g.fillText(b.icons, w / 2, 120);
    g.fillStyle = "#fff"; fitText(g, b.topic.toUpperCase(), w / 2, 248, w - 80, 52, 900);
  });
}

function buildPavilion(scene, b, kit) {
  const sp = SPOTS[b.id], g = new THREE.Group(), M = pavMats(), col = new THREE.Color(b.c);
  g.position.set(wx(sp.x), 0, wz(sp.y)); g.rotation.y = -sp.r * DEG; g.scale.setScalar(PAVILION.scale);
  const W = 6.4, D = 3.4, PH = 0.36, CH = 2.9; // bề ngang, bề sâu, cao nền, cao cột
  // "old": nhà triển lãm tự dựng; nạp được mô hình quầy chợ đêm thì bỏ đi (giữ thảm, cờ, chậu cây, biển tên, nhãn kỷ lục)
  const old = new THREE.Group(); g.add(old);
  const add = (geo, mat, x, y, z, parent = old) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const accent = new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 });
  const carpet = layer(new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.75), roughness: 0.95 }), 4);

  // nền đá, viền, sàn gỗ
  add(new THREE.BoxGeometry(W + 0.4, PH, D + 0.4), M.stone, 0, PH / 2, 0);
  add(new THREE.BoxGeometry(W + 0.55, 0.08, D + 0.55), M.stoneDark, 0, PH + 0.02, 0);
  add(new THREE.BoxGeometry(W, 0.04, D), M.floor, 0, PH + 0.08, 0);
  // hai bậc thềm, thảm đỏ chạy ra sân
  add(new THREE.BoxGeometry(3.0, PH * 0.66, 0.4), M.stone, 0, PH * 0.33, D / 2 + 0.4);
  add(new THREE.BoxGeometry(3.0, PH * 0.33, 0.4), M.stone, 0, PH * 0.165, D / 2 + 0.8);
  const cp = add(new THREE.PlaneGeometry(1.5, 2.6), carpet, 0, 0.03, D / 2 + 2.1, g); cp.rotation.x = -Math.PI / 2;
  const cp2 = add(new THREE.PlaneGeometry(1.5, D * 0.9), carpet, 0, PH + 0.105, 0.1); cp2.rotation.x = -Math.PI / 2;

  // vách sau và hai vách bên thấp, dải màu của gian, tranh cổ động trên vách sau
  const y0 = PH + 0.1;
  add(new THREE.BoxGeometry(W - 0.2, CH, 0.14), M.wall, 0, y0 + CH / 2, -D / 2 + 0.1);
  add(new THREE.BoxGeometry(W - 0.2, 0.5, 0.16), accent, 0, y0 + 0.25, -D / 2 + 0.1);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.14, CH, D * 0.55), M.wall, sx * (W / 2 - 0.1), y0 + CH / 2, -D / 2 + D * 0.275 + 0.05);
    add(new THREE.BoxGeometry(0.16, 0.5, D * 0.55), accent, sx * (W / 2 - 0.1), y0 + 0.25, -D / 2 + D * 0.275 + 0.05);
  }
  const poster = add(new THREE.PlaneGeometry(2.7, 1.12), new THREE.MeshStandardMaterial({ map: posterTex(b), roughness: 0.6 }), 0, y0 + 2.25, -D / 2 + 0.18);

  // cột sơn son chân đá, đầu cột thếp vàng
  const colGeo = new THREE.CylinderGeometry(0.13, 0.15, CH, 14), baseGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.22, 14), capGeo = new THREE.CylinderGeometry(0.2, 0.15, 0.16, 14);
  for (const [x, z] of [[-W / 2 + 0.25, D / 2 - 0.25], [-1.35, D / 2 - 0.25], [1.35, D / 2 - 0.25], [W / 2 - 0.25, D / 2 - 0.25], [-W / 2 + 0.25, -D / 2 + 0.3], [W / 2 - 0.25, -D / 2 + 0.3]]) {
    add(colGeo, M.lacquer, x, y0 + CH / 2, z); add(baseGeo, M.stoneDark, x, y0 + 0.11, z); add(capGeo, M.gold, x, y0 + CH - 0.08, z);
  }
  // xà ngang, diềm vàng, diềm gỗ chạm (răng cưa) treo dưới xà
  const yb = y0 + CH;
  add(new THREE.BoxGeometry(W + 0.2, 0.3, 0.3), accent, 0, yb + 0.15, D / 2 - 0.25);
  add(new THREE.BoxGeometry(W + 0.22, 0.06, 0.32), M.gold, 0, yb + 0.02, D / 2 - 0.25);
  add(new THREE.BoxGeometry(W + 0.2, 0.3, 0.3), accent, 0, yb + 0.15, -D / 2 + 0.3);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.3, 0.3, D - 0.5), accent, sx * (W / 2 - 0.25), yb + 0.15, 0.02);
  for (let i = 0; i < 12; i++) { const x = -W / 2 + 0.55 + i * (W - 1.1) / 11; const v = add(new THREE.ConeGeometry(0.09, 0.22, 4), M.gold, x, yb - 0.12, D / 2 - 0.12); v.rotation.x = Math.PI; }

  // mái ngói hai tầng, đầu đao cong, bờ nóc có "lưỡng long chầu nguyệt" giản lược (ngọc ở giữa)
  const r1 = hipRoof(W / 2 + 0.75, D / 2 + 0.75, W / 2 - 0.5, D / 2 - 0.35, 0.95, M.tile); r1.position.set(0, yb + 0.3 + 0.475, 0); old.add(r1);
  add(new THREE.BoxGeometry(W + 1.4, 0.1, D + 1.4), M.tileDark, 0, yb + 0.3, 0);
  add(new THREE.BoxGeometry(W - 1.0, 0.45, D - 0.7), accent, 0, yb + 1.25 + 0.2, 0); // cổ diêm giữa hai tầng mái
  const r2 = hipRoof(W / 2 - 0.1, D / 2 + 0.05, W / 2 - 1.3, 0.12, 0.85, M.tile); r2.position.set(0, yb + 1.7 + 0.425, 0); old.add(r2);
  add(new THREE.BoxGeometry(W - 1.9, 0.16, 0.32), M.tileDark, 0, yb + 2.6, 0); // bờ nóc
  add(new THREE.BoxGeometry(W - 1.9, 0.04, 0.34), M.gold, 0, yb + 2.69, 0);
  const pearl = add(new THREE.SphereGeometry(0.2, 16, 12), M.gold, 0, yb + 2.95, 0);
  const flame = add(new THREE.ConeGeometry(0.1, 0.3, 8), M.gold, 0, yb + 3.25, 0);
  for (const sx of [-1, 1]) { const end = add(new THREE.BoxGeometry(0.22, 0.4, 0.34), M.tileDark, sx * (W / 2 - 0.95), yb + 2.75, 0); end.rotation.z = sx * 0.3; }
  for (const [sx, sz, yy, dx, dz] of [[1, 1, yb + 0.3, W / 2 + 0.75, D / 2 + 0.75], [-1, 1, yb + 0.3, W / 2 + 0.75, D / 2 + 0.75], [1, -1, yb + 0.3, W / 2 + 0.75, D / 2 + 0.75], [-1, -1, yb + 0.3, W / 2 + 0.75, D / 2 + 0.75],
    [1, 1, yb + 1.7, W / 2 - 0.1, D / 2 + 0.05], [-1, 1, yb + 1.7, W / 2 - 0.1, D / 2 + 0.05], [1, -1, yb + 1.7, W / 2 - 0.1, D / 2 + 0.05], [-1, -1, yb + 1.7, W / 2 - 0.1, D / 2 + 0.05]]) {
    const h = roofHorn(M.tileDark); h.position.set(sx * (dx - 0.1), yy + 0.02, sz * (dz - 0.1)); h.rotation.y = Math.atan2(-sz, sx); old.add(h);
  }

  // hoành phi (biển tên lớn) giữa hai tầng mái, nhìn ra trước
  const smat = new THREE.MeshStandardMaterial({ map: signTex(b), roughness: 0.45, emissive: 0x221100 });
  const sign = add(new THREE.BoxGeometry(2.9, 1.08, 0.1), [M.gold, M.gold, M.gold, M.gold, smat, M.gold], 0, yb + 1.12, D / 2 + 0.62, g);
  sign.rotation.x = -0.12;

  // bên trong: quầy hàng (mô hình Kenney nếu có), đồ trưng bày nổi
  if (kit) { const stall = model(b.id === "g2" ? "stall-green" : "stall-red", 2.2, { own: true, tint: b.id === "g3" ? "blue" : null }); stall.rotation.y = Math.PI / 2; stall.position.set(0, y0, -0.1); old.add(stall); }
  else {
    const ctex = counterTex(b.goods), cmat = new THREE.MeshStandardMaterial({ map: ctex, roughness: 0.8 });
    add(new THREE.BoxGeometry(2.6, 0.9, 0.6), [M.wood, M.wood, M.wood, M.wood, cmat, M.wood], 0, y0 + 0.45, 0.2);
    add(new THREE.BoxGeometry(2.7, 0.07, 0.7), M.wood, 0, y0 + 0.93, 0.2);
  }
  const goods = emojiSprite(b.icons, 1.0); goods.position.set(0, y0 + 1.55, 0.45); old.add(goods); G.anim.push({ o: goods, k: "float", y: y0 + 1.55, p: sp.x / 200 });
  // hai bục trưng bày hai bên
  const icons = typeof Intl !== "undefined" && Intl.Segmenter ? [...new Intl.Segmenter().segment(b.icons)].map(s => s.segment) : [b.icons, b.icons];
  [-1, 1].forEach((sx, i) => {
    add(new THREE.CylinderGeometry(0.34, 0.4, 0.75, 16), M.wall, sx * 2.1, y0 + 0.375, 0.55);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 16), M.gold, sx * 2.1, y0 + 0.76, 0.55);
    const e = emojiSprite(icons[i % icons.length], 0.62); e.position.set(sx * 2.1, y0 + 1.15, 0.55); old.add(e); G.anim.push({ o: e, k: "float", y: y0 + 1.15, p: sx * 2 + sp.x });
  });

  // dây đèn lồng dưới xà trước, quầng sáng
  const lanGeo = new THREE.SphereGeometry(0.15, 12, 10), glowPts = [];
  for (let i = 0; i < 7; i++) {
    const x = -W / 2 + 0.6 + i * (W - 1.2) / 6, l = add(lanGeo, M.lantern, x, yb - 0.45, D / 2 - 0.1); l.scale.y = 1.3;
    add(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 10), M.gold, x, yb - 0.25, D / 2 - 0.1);
    G.anim.push({ o: l, k: "swing", p: i + sp.x }); glowPts.push(x, yb - 0.45, D / 2 - 0.1);
  }
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(glowPts), 3));
  const glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: glowTex(), color: 0xff9a3c, size: 1.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  old.add(glow);

  // cột cờ hai bên thềm, chậu cây cảnh
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.045, 0.06, 4.6, 8), M.gold, sx * (W / 2 + 0.75), 2.3, D / 2 + 0.9, g);
    add(new THREE.SphereGeometry(0.09, 10, 8), M.gold, sx * (W / 2 + 0.75), 4.65, D / 2 + 0.9, g);
    const flag = add(new THREE.PlaneGeometry(0.75, 1.9), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.7 }), sx * (W / 2 + 0.75) + sx * 0.4, 3.55, D / 2 + 0.9, g);
    G.anim.push({ o: flag, k: "flag", p: sx + sp.x });
    add(new THREE.CylinderGeometry(0.3, 0.22, 0.45, 14), M.pot, sx * 1.95, 0.225, D / 2 + 0.75, old);
    const bush = add(new THREE.IcosahedronGeometry(0.42, 1), M.leaf, sx * 1.95, 0.75, D / 2 + 0.75, old); bush.scale.y = 1.15;
    add(new THREE.IcosahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ color: 0xffd23a }), sx * 1.95 + 0.15, 1.05, D / 2 + 0.95, old);
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.pick = b.id; G.pick.push(o); } });
  glow.castShadow = false;
  goods.userData.pick = b.id; G.pick.push(goods);
  scene.add(g);
  G.occ.push({ id: b.id, x: sp.x, y: sp.y, g, op: 1, w: PAVILION.hw + 60, near: 7 });
  const pill = textPlane("bb_" + b.id, 1.3, { bg: "#ffffff", fg: "#2b1a12", sprite: true });
  const pa = { o: pill, k: "bob", y: yb + 3.75, p: sp.x / 300 };
  pill.position.set(0, yb + 3.75, 0); g.add(pill); G.anim.push(pa);
  usePavModel(b, g, old, sign, pa);
}

/* ---------- Mô hình gian hàng: "Night market stall" (alen60303, Sketchfab, CC BY 4.0) ---------- */
// Nén sẵn ở client/public/models/gian-hang/cho-dem.glb. Mặt quầy của mô hình quay về +x, dài theo z, cao khoảng 6,1 m.
// ?pav=0 hoặc nạp lỗi: giữ nhà triển lãm tự dựng.
let pavModel = null;
const PAV_MODEL_SCALE = 1.3, PAV_BACK = 1.15; // phóng mô hình 1,3 lần (rộng khoảng 12 m); lùi 1,15 đơn vị mô hình để bàn ghế trước quầy không lấn chỗ đứng
function loadPavModel() {
  if (!pavModel) pavModel = new GLTFLoader().loadAsync(new URL("models/gian-hang/cho-dem.glb", document.baseURI).href).catch(e => { console.warn("Không nạp được mô hình gian hàng, dùng nhà triển lãm tự dựng", e); return null; });
  return pavModel;
}
function usePavModel(b, g, old, sign, pillAnim) {
  if (new URLSearchParams(location.search).get("pav") === "0") return;
  loadPavModel().then(gl => {
    if (!gl || !G || !g.parent) return;
    const S = PAV_MODEL_SCALE / PAVILION.scale, m = gl.scene.clone(true); // nhóm g đã phóng 1,5 lần: chia lại cho đúng cỡ trong sân
    m.traverse(o => {
      if (!o.isMesh) return;
      const s = o.material; // vật liệu riêng từng gian: gian này mờ đi khi che máy quay không làm mờ gian khác
      o.material = new THREE.MeshLambertMaterial({ map: s.map, color: s.color.clone().multiplyScalar(1.45), alphaTest: s.alphaTest || (s.transparent ? 0.4 : 0), side: s.side }); // mô hình gốc tông tối: sáng lên cho hợp sân
      o.castShadow = true; o.receiveShadow = true; o.userData.pick = b.id; G.pick.push(o);
    });
    m.rotation.y = -Math.PI / 2; m.scale.setScalar(S); m.position.set(0, 0, -PAV_BACK * S); // quầy quay ra sân, lùi về sau
    old.traverse(o => { const i = G.pick.indexOf(o); if (i >= 0) G.pick.splice(i, 1); });
    G.anim = G.anim.filter(a => { let p = a.o; while (p) { if (p === old) return false; p = p.parent; } return true; });
    g.remove(old); g.add(m);
    // biển tên tiếng Việt che băng rôn chữ nước ngoài phía trên quầy; nhãn kỷ lục trên nóc
    sign.position.set(1.3 * S, 3.0 * S, (1.95 - PAV_BACK) * S); sign.rotation.x = 0;
    pillAnim.y = 5.6 * S; pillAnim.o.position.y = pillAnim.y;
    const occ = G.occ.find(o => o.id === b.id); if (occ && occ.op < 1) setOpacity(occ, occ.op);
  });
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
const DECOR_KINDS = ["stall-green", "cart-high", "stall-red", "cart"];
const DECOR = [];
for (let i = 0; i < 40; i++) {
  const deg = i * 9 + 4.5, a = deg * DEG;
  // chừa lối đi (0°, 90°, 180°, 270°) và chỗ Bảng vàng, Gian 4, Gian 5 (các góc chéo)
  if ([0, 90, 180, 270, 360].some(l => Math.abs(deg - l) < 8) || [45, 135, 225, 315].some(l => Math.abs(deg - l) < 10)) continue;
  const k = DECOR_KINDS[i % 4], r = (FAIR_R / U) - 2.4;
  DECOR.push({ k, x: Math.cos(a) * r, z: Math.sin(a) * r, s: k.startsWith("stall") ? 1.5 : 1.4 });
}
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
/* ---------- Nút "Vào phòng chờ" trước thềm mỗi gian ---------- */
const NEAR_BOOTH = 300; // px quanh chỗ đứng trước gian: nút to lên, phím E để vào
function buildEnterButtons(scene) {
  G.enter = [...BOOTHS, CAFE].map(b => {
    const sp = SPOTS[b.id], r = sp.r * DEG, d = b.id === "cafe" ? 200 : PAVILION.hd + 10;
    const anchor = new THREE.Object3D(); anchor.position.set(wx(sp.x - Math.sin(r) * d), 1.5, wz(sp.y + Math.cos(r) * d)); scene.add(anchor); // trước quầy, ngang tầm mắt (đứng trước gian nhìn thấy rõ, không bị che dưới chân)
    const solo = b.id === "g3", cafe = b.id === "cafe";
    const el = addLabel("enter_" + b.id, '<button class="entb" type="button" style="--c:' + b.c + '"><b>' + (cafe ? "☕ Vào quán" : solo ? "▶ Vào chơi" : "🚪 Vào phòng chờ") + '<kbd>E</kbd></b><small>' + esc(b.tag) + (cafe ? " · nghe nhạc, trò chuyện" : solo ? " · chơi một mình" : b.id === "g1" ? " · 4–8 người, tìm Hacker" : " · đấu phòng 20–50 người") + "</small></button>", anchor, new THREE.Vector3(0, 0, 0), "eb");
    const btn = el.querySelector("button");
    btn.addEventListener("click", e => { e.stopPropagation(); enterNear(b.id); }); // chỉ vào được khi đang đứng trước gian
    btn.addEventListener("pointerdown", e => e.stopPropagation());
    return { id: b.id, el, btn, small: btn.querySelector("small"), stand: standPoint(b.id), near: false };
  });
  G.nearBooth = null;
}
/** Số người đang chờ (main.js lấy từ /api/match) hiện dưới nút vào gian. */
export function setBoothInfo(id, text) { const e = G && G.enter && G.enter.find(x => x.id === id); if (e) e.small.textContent = text; }
function updateEnterButtons() {
  if (!G.enter) return;
  let nearest = null;
  for (const e of G.enter) {
    const near = !target && !zoomCb && Math.hypot(e.stand.x - me.x, e.stand.y - me.y) < NEAR_BOOTH;
    if (near) nearest = e.id;
    if (near !== e.near) { e.near = near; e.btn.classList.toggle("near", near); }
  }
  G.nearBooth = nearest;
}
/** Bấm nút gợi ý (hoặc phím E): vào gian đang đứng trước; ngồi vào ghế đang được gợi ý, hoặc đứng dậy nếu đang ngồi. */
function promptAction() {
  if (!G || !G.prompt) return;
  if (G.nearBooth && mySeat < 0) return enterNear(G.nearBooth);
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
  m.rotation.x = -Math.PI / 2; m.position.y = 0.06; scene.add(m); G.marker = { m, t: 0 };
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

const BLOB_MAX = 256;
/** Bóng tròn dưới chân của mọi nhân vật gộp thành 1 lần vẽ (khu 100 người chỉ tốn 1 lệnh vẽ cho bóng). */
function blobs() {
  if (G.blobs) return G.blobs;
  const geo = new THREE.PlaneGeometry(0.9, 0.9); geo.rotateX(-Math.PI / 2);
  const m = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false }), BLOB_MAX);
  m.count = 0; m.frustumCulled = false; m.renderOrder = 1; G.scene.add(m);
  return (G.blobs = m);
}
function addAvatar(id, name, seed, mine, gd) {
  blobs();
  const root = new THREE.Group(), mat = characterMaterial();
  // Dựng hình nhân vật dần dần (vài người mỗi khung hình) để vào khu đông người không bị khựng
  let body = null;
  if (mine) { body = new THREE.Mesh(characterGeometry(seed, mine), mat); root.add(body); }
  if (mine) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0xffc533, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; root.add(ring);
  }
  G.scene.add(root);
  const el = addLabel(id, '<div class="avt' + (mine ? " mine" : "") + '" id="' + id + '"><span class="bub"></span><span class="nm">' + esc(name) + "</span></div>", root, new THREE.Vector3(0, 1.45, 0), "av");
  const a = { id, root, body, mat, el, seed, gd, phase: Math.random() * 6, walk: false, hop: 0, face: mine ? Math.PI : 0, wave: 0 }; // của mình: quay lưng về máy quay lúc mới vào
  G.avatars.set(id, a);
  if (!body) (G.buildQ || (G.buildQ = [])).push(a);
  return a;
}
/** Mỗi khung hình dựng tối đa vài nhân vật đang chờ, ưu tiên người gần mình. */
function buildPending(maxPerFrame = 4) {
  const q = G.buildQ; if (!q || !q.length) return;
  if (q.length > maxPerFrame) q.sort((a, b) => a.root.position.distanceToSquared(G.camera.position) - b.root.position.distanceToSquared(G.camera.position));
  for (const a of q.splice(0, maxPerFrame)) {
    if (!G.avatars.has(a.id) || a.body) continue;
    a.body = new THREE.Mesh(characterGeometry(a.seed, peerLook(a.gd), a.gd), a.mat); a.root.add(a.body);
  }
}
/** Đặt bóng tròn cho mọi nhân vật đang hiện. */
function updateBlobs() {
  const m = G.blobs; if (!m) return;
  let n = 0;
  for (const a of G.avatars.values()) {
    if (!a.root.visible || n >= BLOB_MAX) continue;
    BLOB_M.makeTranslation(a.root.position.x, 0.05, a.root.position.z); m.setMatrixAt(n++, BLOB_M);
  }
  m.count = n; m.instanceMatrix.needsUpdate = true;
}
const BLOB_M = new THREE.Matrix4();
function removeAvatar(id) {
  const a = G && G.avatars.get(id); if (!a) return;
  G.scene.remove(a.root);
  if (a.body) a.body.geometry.dispose(); a.mat.dispose(); a.root.children.forEach(o => { if (o !== a.body && o.material) o.material.dispose(); if (o.geometry && o !== a.body) o.geometry.dispose(); });
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
  const a = addAvatar("p_" + p.id, p.nick, hash(p.id), false, p.gd);
  a.root.position.set(wx(p.x), 0, wz(p.y));
  if (hidden.has(p.id)) { a.root.visible = false; a.el.style.display = "none"; }
}
export function removePeer(id) { clearOcc(id); peers.delete(id); removeAvatar("p_" + id); }
export function movePeer(id, x, y) { const p = peers.get(id); if (p) { p.tx = x; p.ty = y; } }
/** Người khác đổi nhân vật nam/nữ: dựng lại hình. */
export function lookPeer(id, gd) {
  const p = peers.get(id), a = G && G.avatars.get("p_" + id); if (!p || !a) return;
  p.gd = gd; a.gd = gd;
  if (a.body) { a.root.remove(a.body); a.body.geometry.dispose(); a.body = null; (G.buildQ || (G.buildQ = [])).push(a); }
}
export function setGender(g) { setMyGender(g); }
/** Tên của mình đổi (quản trị viên duyệt tên). */
export function renameSelf(nick) { const el = $("avo"); if (el) el.querySelector(".nm").textContent = nick + " (bạn)"; }
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
/** Đi tới trước gian (chạm vào gian hoặc nút ở thanh dưới). Gian hàng, quán: chỉ đi tới, đứng trước rồi bấm nút "Vào" (hoặc phím E) mới vào; Bảng vàng thì mở luôn. */
export function goTo(id) {
  standUp();
  const p = standPoint(id);
  walkTo(p.x, p.y, () => {
    camT.yaw = -SPOTS[id].r;
    if (id === "board") ctx.onBoard();
  });
}
/** Vào gian / quán: chỉ khi đang đứng trước (trong NEAR_BOOTH quanh chỗ đứng), quay mặt nhìn gian rồi bước vào. */
function enterNear(id) {
  if (!G || zoomCb) return;
  const p = standPoint(id);
  if (Math.hypot(p.x - me.x, p.y - me.y) >= NEAR_BOOTH) return;
  standUp(); target = null;
  camT.yaw = -SPOTS[id].r; lookPitch = 10; zoomCb = () => ctx.onBooth(id); zoomAt = performance.now();
}
export function zoomOut() { lookPitch = -6; }
/** Đổi góc nhìn thứ nhất / thứ ba (nhớ cho lần sau). */
export function toggleView() { view = view === "first" ? "third" : "first"; try { localStorage.setItem("hc_view", view); } catch (e) { /* bỏ qua */ } updateViewBtn(); return view; }
function updateViewBtn() { const b = $("viewBtn"); if (b) b.innerHTML = view === "first" ? "👁️<span>Thứ nhất</span>" : "🎥<span>Thứ ba</span>"; }
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
  vp.addEventListener("pointerdown", e => { if (!G || e.target.closest("button") || e.target.closest(".chat") || e.target.closest(".joy")) return; d = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: lookPitch, drag: false }; });
  window.addEventListener("pointermove", e => {
    if (!d) return; const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.drag && Math.abs(dx) + Math.abs(dy) > 10) d.drag = true;
    if (d.drag) { cam.yaw = d.yaw - dx * .3; camT.yaw = null; lookPitch = Math.max(view === "first" ? -75 : -40, Math.min(view === "first" ? 75 : 35, d.pitch + dy * .25)); }
  });
  window.addEventListener("pointerup", e => {
    if (!d) return; const wasDrag = d.drag; d = null;
    if (!G || wasDrag || !$("fair").classList.contains("on")) return;
    const h = pickAt(e.clientX, e.clientY); if (!h) return;
    if (h.id) return goTo(h.id);
    if (h.seats) return sitFrom(h.seats, h.p);
    if (Math.hypot(h.x - CX, h.y - CY) > FAIR_R + 400) return; // chạm ra quá xa khu hội chợ
    standUp();
    const r = vp.getBoundingClientRect(); tapDot(e.clientX - r.left, e.clientY - r.top);
    G.marker.m.position.set(h.p.x, 0.03, h.p.z); G.marker.t = 1;
    walkTo(h.x, h.y, null);
  });
  window.addEventListener("pointercancel", () => { d = null; });
  document.addEventListener("keydown", e => {
    if (e.target.tagName === "INPUT") return;
    if ((e.key === "e" || e.key === "E") && !e.repeat && $("fair").classList.contains("on")) { promptAction(); return; }
    if ((e.key === "v" || e.key === "V") && !e.repeat && $("fair").classList.contains("on")) { toggleView(); return; } // V: đổi góc nhìn
    keys[e.key.toLowerCase()] = true;
  });
  document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener("blur", () => { keys = {}; });
}
/* ---------- Cần điều khiển trên màn hình cảm ứng (góc dưới bên phải) ---------- */
function buildJoystick() {
  if ($("joy")) return;
  const el = document.createElement("div"); el.id = "joy"; el.className = "joy"; el.innerHTML = '<i></i>';
  $("viewport").appendChild(el);
  const knob = el.firstElementChild; let id = null, cx = 0, cy = 0;
  const R = 46;
  const move = e => { let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; } knob.style.transform = "translate(" + dx + "px," + dy + "px)"; joy.x = dx / R; joy.y = dy / R; };
  el.addEventListener("pointerdown", e => { e.stopPropagation(); e.preventDefault(); id = e.pointerId; const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; try { el.setPointerCapture(id); } catch (_) { /* bỏ qua */ } move(e); el.classList.add("on"); });
  el.addEventListener("pointermove", e => { if (e.pointerId === id) move(e); });
  const end = e => { if (e.pointerId !== id) return; id = null; joy.x = joy.y = 0; knob.style.transform = ""; el.classList.remove("on"); };
  el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  const vb = document.createElement("button"); vb.id = "viewBtn"; vb.className = "viewbtn"; vb.type = "button"; vb.setAttribute("aria-label", "Đổi góc nhìn");
  vb.onclick = e => { e.stopPropagation(); toggleView(); }; $("viewport").appendChild(vb); updateViewBtn();
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
  const kx = Math.max(-1, Math.min(1, (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0) + joy.x)), ky = Math.max(-1, Math.min(1, (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0) + joy.y));
  const px0 = me.x, py0 = me.y;
  if (Math.hypot(kx, ky) > 0.15) {
    target = null; onArrive = null; standUp(); const fx = -Math.sin(Y), fy = -Math.cos(Y), rx = Math.cos(Y), ry = -Math.sin(Y), n = Math.hypot(kx, ky), amt = Math.min(1, n);
    const sp = SPEED * (keys.shift ? 1.7 : 1) * amt; // Shift: chạy
    me.x += (rx * kx - fx * ky) / n * sp * dt; me.y += (ry * kx - fy * ky) / n * sp * dt; blockPush(me); walking = true;
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

  // máy quay: thứ ba (sát sau vai) hoặc thứ nhất (mắt nhân vật); lúc mới vào bay từ trên cao xuống
  const k = Math.min(1, dt * 12);
  cam.x += (me.x - cam.x) * k; cam.y += (me.y - cam.y) * k;
  if (camT.yaw != null) { const dy = ((camT.yaw - cam.yaw) % 360 + 540) % 360 - 180; cam.yaw += dy * Math.min(1, dt * 5); if (Math.abs(dy) < .3) camT.yaw = null; }
  viewBlend += ((view === "third" ? 1 : 0) - viewBlend) * Math.min(1, dt * 8);
  const Yc = cam.yaw * DEG, LP = lookPitch * DEG, fx = -Math.sin(Yc), fz = -Math.cos(Yc), rgx = Math.cos(Yc), rgz = -Math.sin(Yc);
  const eyeY = mySeat >= 0 ? SEATS[mySeat].h + VIEW.eye * 0.62 : VIEW.eye, px = wx(cam.x), pz = wz(cam.y);
  // hướng nhìn (gồm cả ngẩng / cúi)
  const dirX = fx * Math.cos(LP), dirY = Math.sin(LP), dirZ = fz * Math.cos(LP);
  // thứ nhất: ở mắt; thứ ba: lùi sau lưng, lệch phải, cao hơn đầu một chút, máy quay nghiêng theo hướng nhìn
  const back = VIEW.dist * Math.cos(LP * 0.6), up3 = VIEW.height - Math.sin(LP) * VIEW.dist * 0.55;
  const c1x = px, c1y = eyeY, c1z = pz;
  const c3x = px - fx * back + rgx * VIEW.side, c3y = Math.max(0.35, eyeY - VIEW.eye + up3), c3z = pz - fz * back + rgz * VIEW.side;
  let cxp = c1x + (c3x - c1x) * viewBlend, cyp = c1y + (c3y - c1y) * viewBlend, czp = c1z + (c3z - c1z) * viewBlend;
  look.set(px + dirX * (VIEW.ahead + 2) + rgx * VIEW.side * viewBlend * 0.5, eyeY + dirY * (VIEW.ahead + 2) + 0.15 * viewBlend, pz + dirZ * (VIEW.ahead + 2) + rgz * VIEW.side * viewBlend * 0.5);
  if (intro > 0) { // mở đầu: nhìn từ trên cao rồi hạ xuống sau lưng nhân vật
    intro = Math.max(0, intro - dt * 0.45); const e = intro * intro * (3 - 2 * intro), P = CAM_INTRO.pitch * DEG;
    const ix = px - fx * CAM_INTRO.dist * Math.cos(P), iy = 0.8 + CAM_INTRO.dist * Math.sin(P), iz = pz - fz * CAM_INTRO.dist * Math.cos(P);
    cxp += (ix - cxp) * e; cyp += (iy - cyp) * e; czp += (iz - czp) * e;
    look.x += (px - look.x) * e; look.y += (0.8 - look.y) * e; look.z += (pz - look.z) * e;
  }
  cam.dist = Math.hypot(cxp - px, czp - pz) + intro * 30; // để phần làm mờ vật che biết máy quay đang xa hay gần
  G.camera.position.set(cxp, cyp, czp);
  G.camera.lookAt(look);
  // góc nhìn thứ nhất: ẩn nhân vật và tên của mình
  if (mine) { const hide = viewBlend < 0.25 && intro === 0; mine.root.visible = !hide; const l = G.lbls && G.lbls.find(x => x.key === "avo"); if (l) l.el.style.display = hide ? "none" : ""; }
  G.sky.position.copy(G.camera.position); G.stars.position.copy(G.camera.position);
  // Sân rộng: vùng bóng đổ đi theo người chơi, vẽ lại bản đồ bóng khi đi xa hơn 6 đơn vị
  if (G.renderer.shadowMap.enabled && Math.hypot(wx(me.x) - G.sunAt.x, wz(me.y) - G.sunAt.y) > 6) {
    G.sunAt.set(wx(me.x), wz(me.y));
    G.sun.target.position.set(G.sunAt.x, 0, G.sunAt.y); G.sun.position.set(G.sunAt.x - 12, 18, G.sunAt.y + 10);
    G.sun.target.updateMatrixWorld(); G.renderer.shadowMap.needsUpdate = true;
  }

  // làm mờ vật che giữa máy quay và nhân vật
  const bx = Math.sin(Yc), by = Math.cos(Yc);
  G.occ.forEach(o => {
    const vx = o.x - me.x, vy = o.y - me.y, t = vx * bx + vy * by, perp = Math.abs(vx * by - vy * bx);
    const near = Math.hypot(wx(o.x) - G.camera.position.x, wz(o.y) - G.camera.position.z) < (o.near || 3) * (view === "first" ? 0.45 : 0.75);
    const want = near ? 0.15 : (view === "third" && t > 20 && t < 260 && perp < (o.w || 210) && intro === 0) ? 0.3 : 1;
    if (Math.abs(o.op - want) > 0.01) { o.op += (want - o.op) * Math.min(1, dt * 14); if (Math.abs(o.op - want) < 0.02) o.op = want; setOpacity(o, o.op); }
  });

  animateProps(dt);
  updateSeatPrompt();
  updateEnterButtons();
  buildPending();
  updateBlobs();
  if (G.marker.t > 0) { G.marker.t = Math.max(0, G.marker.t - dt * 1.6); G.marker.m.material.opacity = G.marker.t; const s = 1 + (1 - G.marker.t) * 0.8; G.marker.m.scale.set(s, s, s); }
  if (Math.random() < dt * .5) firework();
  updateFireworks(dt);
  G.renderer.render(G.scene, G.camera);
  updateLabels();
  if (zoomCb && camT.yaw == null && performance.now() - zoomAt > 650) { const f = zoomCb; zoomCb = null; f(); } // đã quay mặt vào gian
  raf = requestAnimationFrame(loop);
}

function animateAvatar(a, x, y, dx, dy, walking, dt, seat = -1) {
  if (!a) return;
  a.root.position.set(wx(x), 0, wz(y));
  if (!a.body) return; // chưa dựng xong hình
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
    else if (a.k === "flag") a.o.rotation.y = Math.sin(t * 1.7 + a.p) * 0.25;
  }
  if (G.cafeNotes) G.cafeNotes.forEach((n, i) => { n.o.visible = !!G.cafeOn; if (G.cafeOn) { const k = (t * 0.5 + i * 0.5) % 1; n.o.position.set(n.sx * (1.75 + Math.sin(k * 7) * 0.25), 2.2 + k * 1.4, -1.4); n.o.material.opacity = 1 - k; } });
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
const NAME_MAX = 12;
function updateLabels() {
  if (!G.lbls) return;
  const w = G.renderer.domElement.clientWidth, h = G.renderer.domElement.clientHeight, camPos = G.camera.position;
  // Khu đông: chỉ hiện tên NAME_MAX người gần mình nhất; người xa đang chat hoặc chào thì vẫn hiện bong bóng (không kèm tên)
  const near = new Set();
  if (peers.size > NAME_MAX) {
    const mx = wx(me.x), mz = wz(me.y), list = [];
    for (const l of G.lbls) if (l.key.startsWith("p_") && l.obj.visible !== false) list.push([Math.hypot(l.obj.position.x - mx, l.obj.position.z - mz), l]);
    list.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(NAME_MAX, list.length); i++) near.add(list[i][1]);
  }
  for (const l of G.lbls) {
    const vis = l.obj.visible !== false && l.el.style.display !== "none";
    l.obj.updateMatrixWorld();
    v3.copy(l.off).applyMatrix4(l.obj.matrixWorld);
    const dist = v3.distanceTo(camPos);
    v3.project(G.camera);
    let far = false;
    if (peers.size > NAME_MAX && l.key.startsWith("p_") && !near.has(l)) far = true;
    const talking = far && l.el.querySelector(".bub.on");
    const on = vis && v3.z < 1 && v3.x > -1.3 && v3.x < 1.3 && v3.y > -1.3 && v3.y < 1.3 && dist < 26 && (!far || talking);
    if (far !== !!l.far) { l.far = far; l.el.classList.toggle("far", far); }
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
