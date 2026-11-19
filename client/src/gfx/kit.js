// Bộ công cụ Three.js dùng chung cho sảnh hội chợ và Gian 3.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { saveQuality } from "./webgl.js";

export const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/** Chờ phông chữ tiếng Việt tải xong (tối đa 1,5 giây) để chữ trên biển hiệu không bị lỗi dấu. */
export function waitFonts() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const loads = ["900 64px", "800 40px", "700 32px"].map(w => document.fonts.load(w + ' "Be Vietnam Pro"').catch(() => null));
  return Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 1500))]);
}

/* ---------- Bộ dựng hình và chất lượng ---------- */
// Giới hạn độ phân giải theo mức chất lượng. Mức thấp vẫn để 1,5 để chữ và cạnh không bị vỡ hạt trên màn hình điện thoại.
const PR_CAP = [1.5, 2, 2.5];

/** Tạo WebGLRenderer theo mức chất lượng q (0, 1, 2). Ném lỗi nếu máy không tạo được WebGL. */
export function createRenderer(q) {
  const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: q >= 2 ? "high-performance" : "default", alpha: false, stencil: false });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.05;
  applyQuality(r, q);
  const cv = r.domElement;
  cv.className = "gl3";
  cv.addEventListener("webglcontextlost", e => e.preventDefault(), false);
  return r;
}
export function applyQuality(r, q) {
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, PR_CAP[q]));
  r.shadowMap.enabled = q >= 1;
  r.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap đã bị bỏ từ Three.js r18x
}

/**
 * Theo dõi tốc độ khung hình. Nếu trung bình dưới 40 khung/giây trong 2,5 giây thì hạ một mức
 * chất lượng (gọi onDrop) và lưu lại để lần sau vào thẳng mức đó.
 */
export class QualityWatch {
  constructor(q, onDrop) { this.q = q; this.onDrop = onDrop; this.t = 0; this.n = 0; this.warm = 1.5; }
  tick(dt) {
    if (dt <= 0) return;
    if (this.warm > 0) { this.warm -= dt; return; }  // bỏ qua lúc mới vào (đang nạp, biên dịch shader)
    this.t += dt; this.n++;
    if (this.t < 2.5) return;
    const fps = this.n / this.t; this.t = 0; this.n = 0;
    if ((fps < 40 && this.q > 1) || (fps < 26 && this.q === 1)) { this.q--; saveQuality(this.q); this.warm = 1; this.onDrop(this.q, fps); } // xuống mức thấp nhất chỉ khi thật sự giật
  }
}

/* ---------- Kết cấu vẽ bằng canvas ---------- */
let maxAniso = 1;
export function setMaxAniso(r) { maxAniso = Math.min(4, r.capabilities.getMaxAnisotropy()); }

/** Vẽ lên canvas w×h rồi trả về kết cấu (texture). */
export function canvasTex(w, h, draw, { repeat = null, srgb = true, keep = false } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (keep) t.userData.keep = true;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

const emojiCache = new Map();
function graphemes(text) {
  try { return [...new Intl.Segmenter("vi", { granularity: "grapheme" }).segment(text)].length; }
  catch (e) { return [...text.replace(/[\u200d\ufe0f\u{1f3fb}-\u{1f3ff}]/gu, "")].length; } // WebView cũ chưa có Intl.Segmenter
}
/** Kết cấu chứa một chuỗi emoji (có thể nhiều ký tự), nền trong suốt. */
export function emojiTex(text, size = 128) {
  const k = text + "|" + size;
  if (emojiCache.has(k)) return emojiCache.get(k);
  const n = Math.max(1, graphemes(text));
  const t = canvasTex(size * n, size, (g, w, h) => {
    g.font = Math.floor(size * 0.82) + "px " + EMOJI_FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, w / 2, h / 2 + size * 0.06);
  });
  t.userData.aspect = n; t.userData.keep = true;
  emojiCache.set(k, t);
  return t;
}

/** Sprite emoji luôn quay về phía máy quay. */
export function emojiSprite(text, height, size = 128) {
  const t = emojiTex(text, size);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, alphaTest: 0.05, fog: true }));
  s.scale.set(height * t.userData.aspect, height, 1);
  return s;
}

let blob = null;
/** Bóng tròn mờ dưới chân nhân vật (rẻ hơn bóng đổ thật). */
export function blobTex() {
  return blob || (blob = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, "rgba(0,0,0,.55)"); gr.addColorStop(.6, "rgba(0,0,0,.25)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { srgb: false, keep: true }));
}
let glow = null;
/** Vầng sáng tròn cho đèn lồng, pháo hoa. */
export function glowTex() {
  return glow || (glow = canvasTex(64, 64, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.25, "rgba(255,255,255,.65)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { srgb: false, keep: true }));
}

/** Vẽ hình chữ nhật bo góc. */
export function rrect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** Viết chữ, tự thu nhỏ cho vừa chiều rộng tối đa. */
export function fitText(g, text, x, y, maxW, px, weight = 900) {
  let s = px; g.font = weight + " " + s + "px " + FONT;
  while (g.measureText(text).width > maxW && s > 10) { s -= 2; g.font = weight + " " + s + "px " + FONT; }
  g.fillText(text, x, y);
}

/* ---------- Hình khối gộp có màu đỉnh (1 lệnh vẽ cho cả nhân vật) ---------- */
function painted(geo, color) {
  const g = geo;
  g.deleteAttribute("uv");
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  return g;
}
/** Gộp nhiều phần [geometry, màu, x, y, z, rx, ry, rz, sx, sy, sz] thành một geometry có màu đỉnh. */
export function mergeParts(parts) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const list = parts.map(([geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1]) => {
    const g = painted(geo.index ? geo.toNonIndexed() : geo.clone(), color);
    m.compose(p.set(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), s.set(sx, sy, sz));
    return g.applyMatrix4(m);
  });
  const out = mergeGeometries(list, false);
  list.forEach(g => g.dispose());
  return out;
}

/** Giải phóng bộ nhớ GPU của cả một cây đối tượng. */
export function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    ms.forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture && !v.userData.keep) v.dispose(); } m.dispose(); });
  });
}
