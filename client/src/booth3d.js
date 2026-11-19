// Không gian riêng bên trong mỗi gian hàng (Three.js): phòng theo chủ đề của gian, màn hình lớn báo số người,
// người chơi cùng phòng chờ đi lại, chào nhau. Toạ độ theo px của BOOTH_ROOM (shared/world.js), 100 px = 1 đơn vị.
import * as THREE from "three";
import { esc } from "./ui.js";
import { initialQuality } from "./gfx/webgl.js";
import { createRenderer, setMaxAniso, canvasTex, emojiSprite, glowTex, blobTex, rrect, fitText, disposeTree, FONT } from "./gfx/kit.js";
import { characterGeometry, characterMaterial, animateCharacter } from "./gfx/character.js";
import { BOOTH_ROOM } from "../../shared/world.js";

const U = 100, W = BOOTH_ROOM.w / U, H = BOOTH_ROOM.h / U, M = BOOTH_ROOM.margin;
const wx = x => (x - BOOTH_ROOM.w / 2) / U, wz = y => (y - BOOTH_ROOM.h / 2) / U;
const SPEED = 420; // px/giây
const NAME_MAX = 10;
const EMO = ["👋", "🙏", "👏", "🎉"];
const hash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };

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
  const q = initialQuality(), renderer = createRenderer(Math.min(q, 1)); // phòng nhỏ: không cần mức cao
  renderer.shadowMap.enabled = false; setMaxAniso(renderer);
  container.appendChild(renderer.domElement);
  const labels = document.createElement("div"); labels.className = "lbl3"; container.appendChild(labels);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(T.wall).multiplyScalar(0.55);
  const camera = new THREE.PerspectiveCamera(52, 1, 0.3, 80);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a7a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.5); sun.position.set(-4, 9, 6); scene.add(sun);

  /* ---------- Phòng ---------- */
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
  const wallMat = new THREE.MeshLambertMaterial({ color: T.wall }), trimMat = new THREE.MeshLambertMaterial({ color: T.trim });
  const back = new THREE.Mesh(new THREE.BoxGeometry(W + 0.4, 5, 0.2), wallMat); back.position.set(0, 2.5, -H / 2 - 0.1); scene.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.2, 5, H), wallMat); side.position.set(sx * (W / 2 + 0.1), 2.5, 0); scene.add(side);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.25, H), trimMat); trim.position.set(sx * (W / 2 + 0.1), 4.9, 0); scene.add(trim);
  }
  const btrim = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.25, 0.24), trimMat); btrim.position.set(0, 4.9, -H / 2 - 0.1); scene.add(btrim);
  // thảm lối vào ở cửa
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), new THREE.MeshLambertMaterial({ color: T.trim })); mat.rotation.x = -Math.PI / 2; mat.position.set(wx(BOOTH_ROOM.door.x), 0.03, wz(BOOTH_ROOM.door.y) + 0.3); scene.add(mat);

  // màn hình lớn trên tường sau: tên gian, số người, đếm ngược
  const scr = document.createElement("canvas"); scr.width = 1024; scr.height = 384;
  const scrTex = new THREE.CanvasTexture(scr); scrTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.4), new THREE.MeshBasicMaterial({ map: scrTex, toneMapped: false }));
  screen.position.set(0, 1.95, -H / 2 + 0.06); scene.add(screen);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(6.7, 2.7, 0.12), new THREE.MeshLambertMaterial({ color: 0x1d1f24 })); frame.position.set(0, 1.95, -H / 2 - 0.06); scene.add(frame);
  function drawScreen(big, line1, line2) {
    const g = scr.getContext("2d"), w = scr.width, h = scr.height;
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#14182a"); gr.addColorStop(1, "#24294a"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = T.trim; g.lineWidth = 10; rrect(g, 10, 10, w - 20, h - 20, 26); g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#ffc533"; fitText(g, title.toUpperCase(), w / 2, 64, w - 120, 50, 900);
    g.fillStyle = "#ffffff"; fitText(g, big, w / 2, 178, w - 120, 120, 900);
    g.fillStyle = "#cfe3ff"; fitText(g, line1, w / 2, 276, w - 120, 46, 800);
    g.fillStyle = "rgba(255,255,255,.7)"; fitText(g, line2 || "", w / 2, 334, w - 120, 32, 600);
    scrTex.needsUpdate = true;
  }
  drawScreen(solo ? "SẴN SÀNG" : "…", solo ? "Bấm “Bắt đầu chạy” khi đã sẵn sàng" : "Đang vào phòng chờ", "");

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
  const anim = [];
  [[-W / 2 + 1.1, -H / 2 + 1.1], [W / 2 - 1.1, -H / 2 + 1.1], [W / 2 - 1.1, H / 2 - 1.6]].forEach(([x, z], i) => {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.5, 20), trimMat); ped.position.set(x, 0.25, z); scene.add(ped);
    const sp = emojiSprite(T.props[i], 1.1); sp.position.set(x, 1.2, z); scene.add(sp); anim.push({ o: sp, y: 1.2, p: i });
  });
  if (game === "g3") { // cọc tiêu và vạch qua đường
    for (let i = 0; i < 4; i++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 12), new THREE.MeshLambertMaterial({ color: 0xff7a00 })); cone.position.set(-W / 2 + 0.6, 0.27, -1.5 + i * 0.9); scene.add(cone); }
    for (let i = 0; i < 6; i++) { const z = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.6), new THREE.MeshBasicMaterial({ color: 0xf4f1e8 })); z.rotation.x = -Math.PI / 2; z.position.set(-1.5 + i * 0.6, 0.03, 2.6); scene.add(z); }
  }
  // quán cà phê: quầy pha chế, bàn ghế, loa hai bên màn hình, nốt nhạc bay khi đang phát nhạc
  const notes = [];
  if (game === "cafe") {
    const wood = new THREE.MeshLambertMaterial({ color: 0x6b3f1f }), top = new THREE.MeshLambertMaterial({ color: 0xe9d3ad }), dark = new THREE.MeshLambertMaterial({ color: 0x2b2420 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.0, 0.7), wood); bar.position.set(-W / 2 + 2.3, 0.5, -H / 2 + 1.2); scene.add(bar);
    const btop = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.08, 0.8), top); btop.position.set(-W / 2 + 2.3, 1.04, -H / 2 + 1.2); scene.add(btop);
    const mach = emojiSprite("☕", 0.55); mach.position.set(-W / 2 + 1.5, 1.4, -H / 2 + 1.2); scene.add(mach);
    const cake = emojiSprite("🍰", 0.45); cake.position.set(-W / 2 + 2.8, 1.33, -H / 2 + 1.2); scene.add(cake);
    for (const [x, z] of [[1.6, -0.6], [3.6, 0.9], [-0.6, 1.6], [-3.4, 0.4]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 20), top); t.position.set(x, 0.72, z); scene.add(t);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, 0.7, 8), dark); leg.position.set(x, 0.35, z); scene.add(leg);
      const cup = emojiSprite(Math.random() < 0.5 ? "☕" : "🧋", 0.32); cup.position.set(x, 0.92, z); scene.add(cup);
      for (const a of [0, Math.PI]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 12), wood); st.position.set(x + Math.cos(a) * 0.75, 0.22, z + Math.sin(a) * 0.75); scene.add(st); }
    }
    for (const sx of [-1, 1]) {
      const spk = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.45), dark); spk.position.set(sx * 3.9, 2.2, -H / 2 + 0.3); scene.add(spk);
      for (const [y, r] of [[2.45, 0.17], [2.0, 0.1]]) { const cone = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshLambertMaterial({ color: 0x777777 })); cone.position.set(sx * 3.9, y, -H / 2 + 0.53); scene.add(cone); }
      for (let i = 0; i < 3; i++) { const n = emojiSprite(i % 2 ? "🎵" : "🎶", 0.4); n.position.set(sx * 3.9, 2.8, -H / 2 + 0.5); n.visible = false; scene.add(n); notes.push({ o: n, sx, p: i / 3 + (sx > 0 ? 0.15 : 0) }); }
    }
  }
  let musicOn = false;
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

  /* ---------- Nhân vật ---------- */
  const shadowGeo = new THREE.PlaneGeometry(0.9, 0.9); shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false });
  const people = new Map(); // khoá: "me" hoặc số thứ tự n
  function addPerson(key, name, x, y, mine) {
    if (people.has(key)) removePerson(key);
    const root = new THREE.Group(), m = characterMaterial(), body = new THREE.Mesh(characterGeometry(mine ? 7 : hash(name), mine), m), sh = new THREE.Mesh(shadowGeo, shadowMat);
    sh.position.y = 0.05; root.add(sh, body); scene.add(root);
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

  const me = addPerson("me", nick, BOOTH_ROOM.door.x, BOOTH_ROOM.door.y, true);
  let target = null, sentAt = 0, sentX = -1, sentY = -1;
  const keys = {};

  /* ---------- Điều khiển: chạm sàn để đi, W A S D ---------- */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  let down = null;
  const onDown = e => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = e => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; } down = null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) target = { x: Math.max(M, Math.min(BOOTH_ROOM.w - M, hit.x * U + BOOTH_ROOM.w / 2)), y: Math.max(M, Math.min(BOOTH_ROOM.h - M, hit.z * U + BOOTH_ROOM.h / 2)) };
  };
  const onKey = e => { if (!active || e.target.tagName === "INPUT") return; keys[e.key.toLowerCase()] = e.type === "keydown"; };
  renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointerup", onUp);
  document.addEventListener("keydown", onKey); document.addEventListener("keyup", onKey);

  let camD = 7.6;
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.8 ? 58 : 46; camera.updateProjectionMatrix();
    camD = w / h < 0.8 ? 10.5 : 7.6; // màn hình dọc: lùi xa hơn để thấy cả phòng
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  /* ---------- Vòng vẽ ---------- */
  let raf = 0, last = null, t = 0, active = true;
  const v3 = new THREE.Vector3(), camPos = new THREE.Vector3(wx(me.x) * 0.5, camD * 0.95, Math.min(wz(me.y), 1.2) * 0.7 + camD);
  function loop(ts) {
    const dt = last == null ? 0 : Math.min(0.05, (ts - last) / 1000); last = ts; t += dt;
    // đi lại
    const kx = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), ky = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
    const ox = me.x, oy = me.y;
    if (kx || ky) { target = null; const n = Math.hypot(kx, ky); me.x += kx / n * SPEED * dt; me.y += ky / n * SPEED * dt; }
    else if (target) { const dx = target.x - me.x, dy = target.y - me.y, d = Math.hypot(dx, dy); if (d < 4) target = null; else { const k = Math.min(d, SPEED * dt) / d; me.x += dx * k; me.y += dy * k; } }
    me.x = Math.max(M, Math.min(BOOTH_ROOM.w - M, me.x)); me.y = Math.max(M, Math.min(BOOTH_ROOM.h - M, me.y));
    if (!solo && (Math.abs(me.x - sentX) > 2 || Math.abs(me.y - sentY) > 2) && ts - sentAt > 110) { sentAt = ts; sentX = me.x; sentY = me.y; send({ t: "mpos", x: Math.round(me.x), y: Math.round(me.y) }); }
    // nhân vật
    for (const [key, a] of people) {
      let dx, dy;
      if (key === "me") { dx = me.x - ox; dy = me.y - oy; }
      else { const px = a.x, py = a.y, d = Math.hypot(a.tx - a.x, a.ty - a.y); if (d > 600) { a.x = a.tx; a.y = a.ty; } else { const k = Math.min(1, dt * 10); a.x += (a.tx - a.x) * k; a.y += (a.ty - a.y) * k; } dx = a.x - px; dy = a.y - py; }
      const walking = Math.abs(dx) + Math.abs(dy) > 0.3;
      a.root.position.set(wx(a.x), 0, wz(a.y));
      if (walking) { const want = Math.atan2(dx, dy), dd = ((want - a.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI; a.face += dd * Math.min(1, dt * 12); }
      a.body.rotation.y = a.face; a.phase += dt * (walking ? 11 : 2.2); a.hop = Math.max(0, a.hop - dt * 2.5);
      a.body.position.y = (walking ? Math.abs(Math.cos(a.phase)) * 0.05 : 0) + Math.sin(a.hop * Math.PI) * 0.22;
      animateCharacter(a, walking, dt);
    }
    // máy quay đi theo mình, nhìn chếch xuống
    const fz = Math.min(wz(me.y), 1.2) * 0.7; // nhìn về phía màn hình lớn, máy quay không lùi ra ngoài cửa quá xa
    camPos.lerp(v3.set(wx(me.x) * 0.5, camD * 0.95, fz + camD), Math.min(1, dt * 4));
    camera.position.copy(camPos); camera.lookAt(camPos.x, 0.8, camPos.z - camD * 1.05);
    for (const nt of notes) {
      nt.o.visible = musicOn;
      if (musicOn) { const k = (t * 0.45 + nt.p) % 1; nt.o.position.set(nt.sx * (3.9 + Math.sin(k * 6 + nt.p * 9) * 0.3), 2.8 + k * 1.6, -H / 2 + 0.6 + k * 0.6); nt.o.material.opacity = 1 - k; }
    }
    for (const o of anim) { if (o.swing) o.o.rotation.z = Math.sin(t * 2.3 + o.p) * 0.12; else o.o.position.y = o.y + Math.sin(t * 2.4 + o.p) * 0.1; }
    renderer.render(scene, camera);
    // nhãn tên: chỉ hiện 10 người gần mình nhất (và người đang chào) cho đỡ rối
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const near = [...people.values()].sort((p1, p2) => Math.hypot(p1.x - me.x, p1.y - me.y) - Math.hypot(p2.x - me.x, p2.y - me.y));
    near.forEach((a, i) => {
      v3.set(a.root.position.x, 1.45, a.root.position.z).project(camera);
      a.talk = Math.max(0, (a.talk || 0) - dt);
      const on = (i <= NAME_MAX || a.wave > 0 || a.talk > 0) && v3.z < 1 && Math.abs(v3.x) < 1.2 && Math.abs(v3.y) < 1.2;
      a.el.style.visibility = on ? "visible" : "hidden";
      if (on) a.el.style.transform = "translate3d(" + Math.round((v3.x + 1) / 2 * w) + "px," + Math.round((1 - v3.y) / 2 * h) + "px,0)";
    });
    if (active) raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  return {
    /** Tin "mspace": mình và những người đang ở trong gian. */
    setSpace(m) {
      for (const k of [...people.keys()]) if (k !== "me") removePerson(k);
      me.x = m.you.x; me.y = m.you.y; target = null;
      for (const p of m.peers) addPerson(p.n, p.nick, p.x, p.y, false);
    },
    addPeer(p) { addPerson(p.n, p.nick, p.x, p.y, false); },
    removePeer(n) { removePerson(n); },
    movePeers(list, myN) { for (const [n, x, y] of list) { if (n === myN) continue; const a = people.get(n); if (a) { a.tx = x; a.ty = y; } } },
    emote(n, e) { const a = people.get(n); if (a && EMO[e]) bubble(a, EMO[e]); },
    /** Tin chat của người số n (myN: số của mình) hiện thành bong bóng trên đầu. */
    say(n, text, myN) { const a = n === myN ? me : people.get(n); if (a) sayBubble(a, text); },
    setMusicOn(on) { musicOn = on; },
    selfEmote(e) { bubble(me, EMO[e]); if (!solo) send({ t: "memote", e }); },
    /** Cập nhật màn hình lớn trên tường. */
    setScreen: drawScreen,
    count: () => people.size,
    /** Tạm dừng vẽ khi đang chơi (không tốn pin), vẽ lại khi quay về phòng. */
    setActive(on) { if (on === active) return; active = on; cancelAnimationFrame(raf); for (const k in keys) keys[k] = false; if (on) { last = null; resize(); raf = requestAnimationFrame(loop); } },
    close() {
      cancelAnimationFrame(raf); ro.disconnect();
      document.removeEventListener("keydown", onKey); document.removeEventListener("keyup", onKey);
      for (const k of [...people.keys()]) removePerson(k);
      disposeTree(scene); renderer.dispose(); renderer.domElement.remove(); labels.remove();
    }
  };
}
