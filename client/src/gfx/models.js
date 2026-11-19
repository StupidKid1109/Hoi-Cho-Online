// Nạp mô hình 3D có sẵn (Kenney Fantasy Town Kit, giấy phép CC0, xem public/models/kenney/License.txt).
// Mô hình nằm trong client/public/models/kenney, khi build được chép sang www/models/kenney.
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const NAMES = ["stall", "stall-red", "stall-green", "stall-bench", "stall-stool", "cart", "cart-high", "lantern", "banner-red", "banner-green"];
let kit = null, loading = null;

/** Nạp tất cả mô hình (một lần). Trả về true nếu nạp được, false nếu lỗi (khi đó dùng gian hàng tự dựng). */
export function loadKit() {
  if (loading) return loading;
  if (/[?&]kit=0/.test(location.search)) return (loading = Promise.resolve(false)); // ?kit=0: dùng gian hàng tự dựng
  const base = new URL("models/kenney/", document.baseURI).href;
  const loader = new GLTFLoader();
  // Mô hình Kenney đặt gốc tọa độ ở góc: bọc lại để tâm mô hình nằm ở gốc (x, z), đáy ở y = 0.
  const centered = sc => {
    const box = new THREE.Box3().setFromObject(sc), c = box.getCenter(new THREE.Vector3());
    sc.position.set(-c.x, -box.min.y, -c.z);
    const w = new THREE.Group(); w.add(sc); return w;
  };
  loading = Promise.all(NAMES.map(n => loader.loadAsync(base + n + ".glb").then(g => [n, centered(g.scene)])))
    .then(list => {
      kit = new Map(list);
      // Đổi vật liệu sang Lambert (nhẹ hơn nhiều cho máy yếu; mô hình Kenney tô màu phẳng nên trông gần như không đổi)
      const cache = new Map();
      kit.forEach(sc => sc.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        const m = o.material;
        if (!cache.has(m)) cache.set(m, new THREE.MeshLambertMaterial({ map: m.map, color: m.color, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side }));
        o.material = cache.get(m);
      }));
      return true;
    })
    .catch(e => { console.warn("Không nạp được mô hình gian hàng, dùng gian hàng tự dựng:", e); kit = null; return false; });
  return loading;
}
export const hasKit = () => !!kit;

/**
 * Bản sao của một mô hình, kích thước nhân scale.
 * own = true: sao chép cả vật liệu (để làm mờ hoặc đổi màu riêng cho bản sao này).
 * tint: "blue" đổi phần màu đỏ sang xanh dương, "gray" chuyển sang xám (gian chưa mở).
 */
export function model(name, scale = 1, { own = false, tint = null } = {}) {
  const src = kit.get(name), o = src.clone(true);
  o.scale.setScalar(scale);
  if (own || tint) {
    const done = new Map();
    o.traverse(m => {
      if (!m.isMesh) return;
      const old = m.material;
      if (!done.has(old)) { const c = old.clone(); if (tint) applyTint(c, tint); done.set(old, c); }
      m.material = done.get(old);
    });
  }
  return o;
}

function applyTint(mat, tint) {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
      ${tint === "blue"
        ? `{ float rd = diffuseColor.r - max(diffuseColor.g, diffuseColor.b);
             if (rd > 0.18) diffuseColor.rgb = vec3(diffuseColor.b * 0.55, diffuseColor.g * 0.85 + 0.12, diffuseColor.r * 1.05); }`
        : `{ float l = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(l), 0.85) * 0.85; }`}`);
  };
  mat.customProgramCacheKey = () => "kenney-tint-" + tint;
}
