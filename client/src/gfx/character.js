// Nhân vật kiểu hoạt hình (chibi) cho sảnh hội chợ.
// Cả nhân vật gộp thành 1 mesh (1 lệnh vẽ). Tay, chân, mắt được đánh dấu bằng thuộc tính "limb"
// và chuyển động ngay trong shader: vung tay chân khi đi, vẫy tay khi chào, chớp mắt.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Mã bộ phận trong thuộc tính limb
const BODY = 0, ARM_L = 1, ARM_R = 2, LEG_L = 3, LEG_R = 4, EYE = 5;
const SHOULDER_Y = 0.6, HIP_Y = 0.33, EYE_Y = 0.93;

const SKIN = ["#f8d9bf", "#f0c6a2", "#dcab84", "#c08a63"];
const HAIR = ["#1c1714", "#2b1d14", "#3d2716", "#141414", "#5a3a22"];
const COLORS = ["#e63946", "#2a9d8f", "#3a86ff", "#ff9f1c", "#8338ec", "#06d6a0", "#ef476f", "#118ab2", "#f4a261", "#ffbe0b"];
const AODAI = ["#ffffff", "#f7c6d0", "#ffd166", "#a8dadc", "#c8102e", "#9b5de5"];
const PANTS = ["#264653", "#3d405b", "#1d3557", "#4a3b2f", "#2b2d42"];

/** Các kiểu nhân vật của mình (tóc sáng màu để nhìn từ sau lưng không thấy cả đầu đen). */
export const MINE_LOOKS = {
  "non-la": { hat: "nonla", hair: "#1c1714", style: "short" },                 // kiểu cũ
  "mu-do": { hat: "cap", cap: "#d62839", star: true, hair: "#8b5a2b", style: "short" },
  "toc-nau": { hat: "none", hair: "#a0683a", style: "spiky" },
  "mu-vang": { hat: "cap", cap: "#ffc533", hair: "#8b5a2b", style: "short" }
};
export const MINE_LOOK = "mu-do";

/* ---------- Dựng hình ---------- */
function part(list, geo, color, limb, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  geo.dispose();
  g.deleteAttribute("uv");
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3), lb = new Float32Array(n).fill(limb);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setAttribute("limb", new THREE.BufferAttribute(lb, 1));
  list.push(g);
}
const Sph = (r, w = 14, h = 12, ...a) => new THREE.SphereGeometry(r, w, h, ...a);
const Cap = (r, l, s = 8) => new THREE.CapsuleGeometry(r, l, 4, s);
const Cyl = (rt, rb, h, s = 14, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);

/**
 * Tạo geometry nhân vật theo seed (cùng seed thì cùng ngoại hình trên mọi máy).
 * mine: nhân vật của mình, áo đỏ sao vàng để dễ nhận ra; true = kiểu MINE_LOOK, hoặc tên một kiểu trong MINE_LOOKS.
 */
export function characterGeometry(seed, mine) {
  let h = Math.abs(seed) || 1;
  const pick = arr => { h = (Math.imul(h, 1103515245) + 12345) >>> 0; return arr[(h >>> 8) % arr.length]; };
  const look = mine ? MINE_LOOKS[mine === true ? MINE_LOOK : mine] || MINE_LOOKS[MINE_LOOK] : null;
  const skin = pick(SKIN), pants = pick(PANTS); let hair = pick(HAIR);
  if (look) hair = look.hair;
  const outfit = mine ? "tee" : pick(["tee", "student", "aodai", "hoodie", "worker", "tee", "student"]);
  const top = mine ? "#d62839" : outfit === "student" ? "#ffffff" : outfit === "worker" ? "#2f6db5" : outfit === "aodai" ? pick(AODAI) : pick(COLORS);
  const hat = look ? look.hat : outfit === "aodai" ? pick(["none", "nonla", "none", "none"]) : pick(["none", "none", "none", "none", "none", "cap", "cap", "nonla"]);
  // kiểu tóc hợp với mũ: đội mũ lưỡi trai thì tóc gọn, đội nón lá thì không búi cao
  const style = look ? look.style : pick(hat === "cap" ? ["short", "ponytail"] : hat === "nonla" ? ["short", "bob", "long", "ponytail"]
    : outfit === "aodai" ? ["long", "bun", "bob"] : ["short", "spiky", "bob", "ponytail", "buns", "short", "long"]);
  const L = [];

  // chân và giày
  const legCol = outfit === "aodai" ? "#ffffff" : outfit === "worker" ? "#8a7a5a" : outfit === "student" ? "#1d3557" : pants;
  for (const [s, limb] of [[-1, LEG_L], [1, LEG_R]]) {
    part(L, Cap(0.07, 0.17), legCol, limb, s * 0.085, 0.2, 0);
    part(L, Sph(0.085, 10, 8), "#2b2b2b", limb, s * 0.085, 0.05, 0.035, 0, 0, 0, 1, 0.65, 1.35);
    part(L, Sph(0.03, 6, 4), "#ffffff", limb, s * 0.085, 0.07, 0.13, 0, 0, 0, 1.2, 0.6, 0.6);
  }
  // hông, thân
  part(L, Cyl(0.15, 0.16, 0.12), outfit === "aodai" ? top : legCol, BODY, 0, 0.36, 0);
  part(L, Cap(0.165, 0.15, 12), top, BODY, 0, 0.53, 0, 0, 0, 0, 1, 1, 0.82);
  if (outfit === "aodai") { // vạt áo dài trước và sau
    part(L, Cyl(0.15, 0.2, 0.36, 14, true), top, BODY, 0, 0.27, 0, 0, 0, 0, 1, 1, 0.6);
    part(L, Sph(0.03, 6, 4), "#ffd166", BODY, 0, 0.66, 0.14);
  }
  if (outfit === "student") { // khăn quàng đỏ
    part(L, new THREE.ConeGeometry(0.075, 0.16, 3), "#d62828", BODY, 0, 0.6, 0.135, Math.PI, 0, 0, 1, 1, 0.35);
    part(L, new THREE.TorusGeometry(0.1, 0.022, 5, 14), "#d62828", BODY, 0, 0.67, 0, Math.PI / 2 + 0.25);
  }
  if (outfit === "worker") { // túi áo, cổ áo
    part(L, new THREE.BoxGeometry(0.07, 0.06, 0.02), "#245a96", BODY, 0.07, 0.56, 0.14);
    part(L, new THREE.TorusGeometry(0.09, 0.025, 5, 12), "#245a96", BODY, 0, 0.67, 0, Math.PI / 2 + 0.25);
  }
  if (outfit === "hoodie") { // mũ áo sau lưng, dây
    part(L, Sph(0.12, 10, 8), top, BODY, 0, 0.68, -0.12, 0, 0, 0, 1.2, 0.8, 0.7);
    part(L, Cyl(0.01, 0.01, 0.12, 4), "#ffffff", BODY, -0.04, 0.6, 0.145); part(L, Cyl(0.01, 0.01, 0.12, 4), "#ffffff", BODY, 0.04, 0.6, 0.145);
  }
  if (outfit === "tee" && mine) part(L, new THREE.CircleGeometry(0.055, 5), "#ffd23f", BODY, 0, 0.56, 0.141, 0, 0, Math.PI / 2); // sao vàng trên áo đỏ
  // tay (tay áo cùng màu áo, bàn tay màu da)
  for (const [s, limb] of [[-1, ARM_L], [1, ARM_R]]) {
    part(L, Cap(0.052, 0.17), top, limb, s * 0.215, 0.49, 0, 0, 0, s * 0.18);
    part(L, Sph(0.055, 8, 6), skin, limb, s * 0.245, 0.36, 0.01);
  }
  // cổ, đầu, tai
  part(L, Cyl(0.06, 0.07, 0.06, 8), skin, BODY, 0, 0.68, 0);
  part(L, Sph(0.27, 20, 16), skin, BODY, 0, 0.93, 0, 0, 0, 0, 1, 0.94, 0.96);
  for (const s of [-1, 1]) part(L, Sph(0.05, 8, 6), skin, BODY, s * 0.265, 0.92, 0, 0, 0, 0, 0.6, 1, 1);
  // mặt: mắt (chớp được), ánh mắt, lông mày, má hồng, miệng cười
  for (const s of [-1, 1]) {
    part(L, Sph(0.042, 10, 8), "#1f1a17", EYE, s * 0.095, EYE_Y, 0.235, 0, 0, 0, 0.85, 1.25, 0.55);
    part(L, Sph(0.014, 6, 4), "#ffffff", EYE, s * 0.095 + 0.012, EYE_Y + 0.02, 0.257);
    part(L, new THREE.BoxGeometry(0.075, 0.016, 0.02), hair, BODY, s * 0.1, 1.025, 0.235, -0.25, 0, -s * 0.12);
    part(L, Sph(0.042, 8, 6), "#ff9aa2", BODY, s * 0.165, 0.86, 0.205, 0, 0, 0, 1, 0.55, 0.4);
  }
  part(L, new THREE.TorusGeometry(0.038, 0.011, 4, 10, Math.PI), "#9c3d33", BODY, 0, 0.85, 0.252, 0, 0, Math.PI);

  // tóc
  const bangs = (...a) => { if (hat !== "cap") part(L, ...a); };
  const cap = (r = 0.285) => part(L, Sph(hat === "cap" ? 0.262 : r, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), hair, BODY, 0, 0.94, -0.015, -0.22);
  if (style === "short") { cap(); bangs(Sph(0.12, 10, 6), hair, BODY, -0.08, 1.07, 0.19, 0, 0, 0, 1.4, 0.55, 0.6); }
  if (style === "spiky") { cap(0.28); for (let i = 0; i < 6; i++) { const a = -0.9 + i * 0.36; part(L, new THREE.ConeGeometry(0.07, 0.17, 6), hair, BODY, Math.sin(a) * 0.17, 1.17 - Math.abs(a) * 0.06, Math.cos(a) * 0.05 - 0.02, -0.3 + Math.cos(a) * 0.1, 0, -a * 0.6); } }
  if (style === "bob") { cap(0.3); part(L, Sph(0.3, 18, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.4), hair, BODY, 0, 0.93, -0.03, 0, 0, 0, 1.02, 1, 1); bangs(Sph(0.13, 10, 6), hair, BODY, 0.06, 1.07, 0.2, 0, 0, 0, 1.6, 0.5, 0.6); }
  if (style === "ponytail") { cap(); part(L, Sph(0.06, 8, 6), "#e63946", BODY, 0, 1.0, -0.27); part(L, Cap(0.08, 0.22), hair, BODY, 0, 0.82, -0.32, 0.35); }
  if (style === "buns") { cap(); for (const s of [-1, 1]) part(L, Sph(0.1, 10, 8), hair, BODY, s * 0.19, 1.15, -0.05); }
  if (style === "long") { cap(0.29); part(L, Cap(0.2, 0.3, 10), hair, BODY, 0, 0.78, -0.13, 0, 0, 0, 1.25, 1, 0.55); bangs(Sph(0.12, 10, 6), hair, BODY, -0.05, 1.07, 0.2, 0, 0, 0, 1.6, 0.5, 0.6); }
  if (style === "bun") { cap(); part(L, Sph(0.11, 10, 8), hair, BODY, 0, 1.08, -0.24); part(L, Cyl(0.008, 0.008, 0.26, 4), "#c9a54f", BODY, 0, 1.1, -0.26, 0, 0, 1.2); }

  // mũ
  if (hat === "nonla") {
    part(L, new THREE.ConeGeometry(0.5, 0.3, 24, 1, true), "#f3d98f", BODY, 0, 1.25, 0);
    part(L, new THREE.ConeGeometry(0.49, 0.29, 24, 1, true), "#c9a85a", BODY, 0, 1.245, 0, 0, 0, 0, 1, 1, -1); // mặt trong nón (lật mặt)
    part(L, new THREE.TorusGeometry(0.44, 0.012, 4, 24), "#b8954a", BODY, 0, 1.11, 0, Math.PI / 2);
  }
  if (hat === "cap") {
    const cc = look ? look.cap : pick(COLORS);
    part(L, Sph(0.29, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), cc, BODY, 0, 0.96, 0);
    part(L, Cyl(0.17, 0.17, 0.02, 14), cc, BODY, 0, 1.03, 0.25, 0.15, 0, 0, 1, 1, 0.8);
    part(L, Sph(0.03, 6, 4), look ? look.cap : "#ffffff", BODY, 0, 1.25, 0);
    if (look && look.star) part(L, new THREE.CircleGeometry(0.065, 5), "#ffd23f", BODY, 0, 1.085, 0.27, -0.45, 0, Math.PI / 2); // sao vàng trước mũ
  }

  const g = mergeGeometries(L, false);
  L.forEach(x => x.dispose());
  g.computeBoundingSphere();
  return g;
}

/* ---------- Vật liệu tô kiểu hoạt hình + chuyển động trong shader ---------- */
let gradient = null;
function toonRamp() {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([150, 210, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter; gradient.needsUpdate = true;
  return gradient;
}
const HEAD = /* glsl */`
attribute float limb;
uniform float uSwing; uniform float uWave; uniform float uBlink; uniform float uSit;
mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }
mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }
`;
const NORMAL = /* glsl */`
mat3 limbR = mat3(1.0); vec3 limbP = vec3(0.0); float limbS = 1.0;
if (limb > 0.5 && limb < 2.5) {           // tay: vung ngược với chân cùng bên
  float side = limb < 1.5 ? -1.0 : 1.0;
  limbP = vec3(side * 0.2, ${SHOULDER_Y.toFixed(2)}, 0.0);
  limbR = rotX(uSwing * side * 0.9 - uSit * 0.55);   // ngồi: tay đặt lên đùi
  if (limb > 1.5) limbR = rotZ(uWave) * limbR;   // tay phải vẫy khi chào
} else if (limb > 2.5 && limb < 4.5) {    // chân
  float side = limb < 3.5 ? -1.0 : 1.0;
  limbP = vec3(0.0, ${HIP_Y.toFixed(2)}, 0.0);
  limbR = rotX(-uSwing * side * 0.75 - uSit * 1.4);  // ngồi: chân duỗi ra trước
} else if (limb > 4.5) {                  // mắt: chớp
  limbS = uBlink;
}
vec3 objectNormal = limbR * vec3(normal);
#ifdef USE_TANGENT
vec3 objectTangent = vec3(tangent.xyz);
#endif
`;
const BEGIN = /* glsl */`
vec3 transformed = limbR * (vec3(position) - limbP) + limbP;
if (limb > 4.5) transformed.y = ${EYE_Y.toFixed(2)} + (transformed.y - ${EYE_Y.toFixed(2)}) * limbS;
`;

/** Vật liệu riêng cho mỗi nhân vật (cùng chương trình shader, khác giá trị chuyển động). */
export function characterMaterial() {
  const u = { uSwing: { value: 0 }, uWave: { value: 0 }, uBlink: { value: 1 }, uSit: { value: 0 } };
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = HEAD + sh.vertexShader
      .replace("#include <beginnormal_vertex>", NORMAL)
      .replace("#include <begin_vertex>", BEGIN);
  };
  m.customProgramCacheKey = () => "hoicho-char-v2";
  m.userData.u = u;
  return m;
}

/**
 * Cập nhật chuyển động: walking (đang đi), dt (giây). Trạng thái lưu trong a (nhân vật).
 * a.wave > 0: đang vẫy tay chào.
 */
export function animateCharacter(a, walking, dt) {
  const u = a.mat.userData.u;
  a.walkAmt = (a.walkAmt || 0) + ((walking ? 1 : 0) - (a.walkAmt || 0)) * Math.min(1, dt * 10);
  u.uSwing.value = Math.sin(a.phase) * 0.75 * a.walkAmt;
  u.uSit.value = a.sitAmt || 0;
  // vẫy tay: giơ tay lên rồi lắc
  a.wave = Math.max(0, (a.wave || 0) - dt);
  const w = a.wave > 0 ? Math.min(1, a.wave * 3, (1.6 - a.wave) * 6) : 0;
  u.uWave.value = w * (2.5 + Math.sin(a.wave * 18) * 0.35);
  // chớp mắt mỗi 2–5 giây
  a.blinkT = (a.blinkT ?? 1 + Math.random() * 3) - dt;
  if (a.blinkT < 0) { a.blinkT = 2 + Math.random() * 3; a.blinkF = 0.14; }
  a.blinkF = Math.max(0, (a.blinkF || 0) - dt);
  u.uBlink.value = a.blinkF > 0 ? 0.12 : 1;
}
