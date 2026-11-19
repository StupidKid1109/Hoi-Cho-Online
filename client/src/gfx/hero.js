// Nhân vật chính của người chơi: mô hình "Steve" của Quaternius (CC0, client/public/models/nhan-vat/steve.glb),
// có khung xương và hoạt ảnh sẵn (Idle, Walk, Run, Wave, Jump…). Dùng cho nhân vật của mình ở sảnh, phòng chờ, quán cà phê.
// Mô hình nạp không được thì giữ nhân vật tự dựng (gfx/character.js).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";

const URL_ = "models/nhan-vat/steve.glb";
/** Mô hình gốc cao khoảng 2,3 đơn vị: thu về khoảng 1,38 cho bằng nhân vật cũ (hông ở 0,34 như cũ để ngồi ghế vừa). */
export const HERO_SCALE = 0.6;
let loading = null;

/** Nạp mô hình (một lần). Trả về gltf hoặc null nếu lỗi. */
export function loadHero() {
  if (!loading) loading = new GLTFLoader().loadAsync(new URL(URL_, document.baseURI).href).then(g => {
    const mats = new Map(); // đổi sang Lambert cho nhẹ trên máy yếu (mô hình tô màu phẳng nên gần như không khác)
    g.scene.traverse(m => {
      if (!m.isMesh) return;
      const s = m.material;
      if (!mats.has(s)) mats.set(s, new THREE.MeshLambertMaterial({ map: s.map, color: s.color }));
      m.material = mats.get(s); m.frustumCulled = false; m.castShadow = true;
    });
    return g;
  }).catch(e => { console.warn("Không nạp được nhân vật Steve, dùng nhân vật cũ", e); return null; });
  return loading;
}

/** Tạo một nhân vật từ gltf đã nạp. Trả về { obj, update(a, moving, speed, dt), dispose() }. */
export function createHero(g) {
  const obj = clone(g.scene); obj.scale.setScalar(HERO_SCALE);
  const mixer = new THREE.AnimationMixer(obj), acts = {};
  for (const c of g.animations) acts[c.name.split("|").pop()] = mixer.clipAction(c);
  const legsU = [], legsL = [];
  obj.traverse(b => { if (!b.isBone) return; if (/^UpperLeg[LR]$/.test(b.name)) legsU.push(b); if (/^LowerLeg[LR]$/.test(b.name)) legsL.push(b); });
  let cur = null;
  function play(name) {
    const next = acts[name] || acts.Idle; if (!next || next === cur) return;
    next.reset().setEffectiveWeight(1).play();
    if (cur) next.crossFadeFrom(cur, 0.2, false);
    cur = next;
  }
  play("Idle");
  return {
    obj,
    /**
     * a: trạng thái nhân vật (a.wave > 0: đang chào, a.sitAmt: 0..1 đang ngồi),
     * moving: đang đi, speed: tốc độ (đơn vị 3D/giây, đã chia tỉ lệ phòng), dt: giây.
     */
    update(a, moving, speed, dt) {
      const sit = a.sitAmt || 0;
      a.wave = Math.max(0, (a.wave || 0) - dt);
      const want = sit > 0.5 ? "Idle" : a.wave > 0 ? "Wave" : moving ? (speed > 2.6 ? "Run" : "Walk") : "Idle";
      play(want);
      if (cur === acts.Run) cur.timeScale = Math.max(0.8, Math.min(1.5, speed / 4.2));
      else if (cur === acts.Walk) cur.timeScale = Math.max(0.7, Math.min(1.4, speed / 1.6));
      else if (cur) cur.timeScale = 1;
      mixer.update(dt);
      // ngồi: không có hoạt ảnh sẵn, tự gập đùi ra trước và gập gối xuống (trục X của xương chân)
      if (sit > 0.01) { for (const b of legsU) b.rotateX(-1.15 * sit); for (const b of legsL) b.rotateX(1.35 * sit); }
    },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(obj); }
  };
}

/**
 * Thay hình của nhân vật a (có a.root, a.body) bằng Steve khi mô hình nạp xong.
 * isAlive(): nhân vật còn trên cảnh không (rời phòng thì thôi).
 */
export function attachHero(a, isAlive = () => true) {
  loadHero().then(g => {
    if (!g || !isAlive() || a.hero) return;
    const h = createHero(g);
    if (a.body) { a.root.remove(a.body); if (a.body.geometry) a.body.geometry.dispose(); }
    h.obj.rotation.y = a.face || 0;
    a.root.add(h.obj); a.body = h.obj; a.hero = h;
  });
}
