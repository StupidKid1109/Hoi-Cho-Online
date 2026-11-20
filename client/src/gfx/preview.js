// Xem trước nhân vật nam / nữ ở màn hình mở đầu (một khung vẽ nhỏ, hai nhân vật đứng cạnh nhau).
import * as THREE from "three";
import { characterGeometry, characterMaterial, animateCharacter, LOOK_OF } from "./character.js";

/** Dựng khung xem trước trên canvas. onPick("nam" | "nu") khi chạm vào một nhân vật. */
export function mountPreview(canvas, onPick) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 2, 0.1, 50);
  cam.position.set(0, 1.05, 4.1); cam.lookAt(0, 0.62, 0);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b4b3a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 4, 3); scene.add(sun);
  const ringGeo = new THREE.RingGeometry(0.42, 0.52, 40); ringGeo.rotateX(-Math.PI / 2);
  const disc = new THREE.CircleGeometry(0.5, 40); disc.rotateX(-Math.PI / 2);
  const people = {};
  for (const [g, x] of [["nam", -0.68], ["nu", 0.68]]) {
    const root = new THREE.Group(), mat = characterMaterial();
    root.add(new THREE.Mesh(characterGeometry(7, LOOK_OF[g]), mat));
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffc533, transparent: true, opacity: 0 }));
    ring.position.y = 0.02; root.add(ring);
    const pad = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false }));
    pad.position.y = 0.01; root.add(pad);
    root.position.x = x; scene.add(root);
    people[g] = { root, ring, mat, phase: 0, wave: 0, spin: 0 };
  }
  let sel = null, raf = 0, last = performance.now(), alive = true;
  function size() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 170;
    if (canvas.width !== Math.round(w * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  }
  function frame(now) {
    if (!alive) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; size();
    for (const [g, p] of Object.entries(people)) {
      const on = sel === g;
      p.ring.material.opacity += ((on ? 0.95 : 0) - p.ring.material.opacity) * Math.min(1, dt * 8);
      const s = on ? 1.08 : sel ? 0.92 : 1; p.root.scale.setScalar(p.root.scale.x + (s - p.root.scale.x) * Math.min(1, dt * 8));
      p.spin += dt * (on ? 0.9 : 0.35); p.root.rotation.y = Math.sin(p.spin) * 0.55;
      animateCharacter(p, false, dt);
    }
    r.render(scene, cam); raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  canvas.addEventListener("click", e => { const b = canvas.getBoundingClientRect(); onPick && onPick(e.clientX - b.left < b.width / 2 ? "nam" : "nu"); });
  return {
    set(g) { if (g !== sel && people[g]) { people[g].wave = 1.6; } sel = g; },
    stop() { alive = false; cancelAnimationFrame(raf); r.dispose(); r.forceContextLoss && r.forceContextLoss(); }
  };
}
