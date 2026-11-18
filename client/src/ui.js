// Tiện ích giao diện dùng chung.
export const $ = id => document.getElementById(id);
export const fmt = n => Number(n || 0).toLocaleString("vi-VN");
export const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function show(id) { document.querySelectorAll(".screen").forEach(s => s.classList.toggle("on", s.id === id)); }

let toastT;
export function toast(m) { const t = $("toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("on"), 2600); }

export function msg(el, cls, html, ms) { el.className = "gmsg on " + cls; el.innerHTML = html; clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), ms || 1400); }

let ac;
export function beep(kind) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = kind === "bad" ? "square" : "sine"; o.frequency.value = kind === "bad" ? 180 : kind === "coin" ? 1320 : 880; g.gain.value = .05;
    o.connect(g); g.connect(ac.destination); o.start();
    if (kind === "ok") o.frequency.setValueAtTime(1175, ac.currentTime + .08);
    o.stop(ac.currentTime + (kind === "coin" ? .07 : .2));
  } catch (e) { /* trình duyệt chặn âm thanh: bỏ qua */ }
}

let onSheetClose = null;
export function closeSheet() { $("veil").classList.remove("on"); $("sheet").innerHTML = ""; const f = onSheetClose; onSheetClose = null; if (f) f(); }
export function openSheet(html, { dismiss = true, onClose = null } = {}) {
  onSheetClose = onClose;
  $("sheet").innerHTML = html; $("veil").classList.add("on"); $("sheet").scrollTop = 0; $("veil").dataset.dismiss = dismiss ? "1" : "0";
  const x = $("sheet").querySelector(".xx"); if (x) x.onclick = closeSheet;
}
export function initSheet() { $("veil").onclick = e => { if (e.target === $("veil") && $("veil").dataset.dismiss === "1") closeSheet(); }; }
