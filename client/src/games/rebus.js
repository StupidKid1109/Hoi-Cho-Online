// Gian 2: Đuổi hình bắt chữ. Máy chủ giữ đáp án, kiểm tra từng lần đoán và tính giờ.
import { $, beep, esc } from "../ui.js";
import { post } from "../api.js";

export const pre = ["🖼️", "Đuổi hình bắt chữ", [["👀", "Nhìn các hình ghép lại để đoán địa danh"], ["🔤", "Chạm chữ cái để điền, chạm ô đã điền để gỡ"], ["💡", "Gợi ý mở 1 chữ, trừ 50 điểm"], ["⏱️", "5 câu, 40 giây mỗi câu"]]];
let g = null;

export async function start(ctx) {
  const r = await post("/api/runs", { game: "g2" });
  g = { ctx, run: r.runId, total: r.total, score: 0, running: true, raf: 0 };
  $("g2sc").textContent = "0";
  if (!r.counted) ctx.toast("Ngoài thời gian đợt thưởng: lượt này để luyện tập, không tính điểm");
  await next();
}
export function stop() { if (g) { g.running = false; cancelAnimationFrame(g.raf); } }
export function hint() { doHint(); }
export function skip() { if (g && !g.locked) act("skip"); }

async function next() {
  const r = await post("/api/runs/" + g.run + "/next");
  if (r.done) return end();
  const p = r.puzzle;
  Object.assign(g, { p, tiles: p.tiles.map(ch => ({ ch, used: false })), slots: Array(p.words.reduce((a, b) => a + b, 0)).fill(null), lock: [], locked: false, t0: performance.now(), sec: p.seconds });
  $("g2pic").innerHTML = p.pics.map(e => "<span>" + e + "</span>").join('<span class="plus">+</span>'); $("g2pic").classList.remove("flip"); void $("g2pic").offsetWidth; $("g2pic").classList.add("flip");
  $("g2n").textContent = "Câu " + (p.index + 1) + "/" + p.total; $("g2rev").className = "reveal";
  render(); cancelAnimationFrame(g.raf); tick();
}
const left = () => Math.max(0, 1 - (performance.now() - g.t0) / 1000 / g.sec);
function tick() {
  if (!g || !g.running) return; const l = left();
  $("g2t").style.transform = "scaleX(" + l + ")"; $("g2tb").classList.toggle("warn", l < .25); $("g2sec").textContent = Math.ceil(l * g.sec) + "s";
  if (l <= 0 && !g.locked) return act("skip", { timeout: true }); // hết giờ: máy chủ trả về đáp án
  g.raf = requestAnimationFrame(tick);
}
function render() {
  let k = 0, h = "";
  g.p.words.forEach(len => { h += '<div class="word">'; for (let j = 0; j < len; j++, k++) { const t = g.slots[k]; h += '<button class="slot' + (t != null ? " f" : "") + (g.lock.includes(k) ? " lock" : "") + '" data-s="' + k + '">' + (t != null ? g.tiles[t].ch : "") + "</button>"; } h += "</div>"; });
  const sl = $("g2slots"); sl.className = "slots"; sl.innerHTML = h;
  sl.querySelectorAll(".slot").forEach(el => el.onclick = () => { const s = +el.dataset.s; if (g.locked || g.lock.includes(s) || g.slots[s] == null) return; g.tiles[g.slots[s]].used = false; g.slots[s] = null; render(); });
  $("g2tiles").innerHTML = g.tiles.map((t, i) => '<button class="tile' + (t.used ? " u" : "") + '" data-t="' + i + '">' + t.ch + "</button>").join("");
  $("g2tiles").querySelectorAll(".tile").forEach(el => el.onclick = () => put(+el.dataset.t));
  $("g2hint").disabled = g.locked;
}
function put(ti) {
  if (g.locked || g.tiles[ti].used) return; const s = g.slots.indexOf(null); if (s < 0) return;
  g.slots[s] = ti; g.tiles[ti].used = true; render();
  if (!g.slots.includes(null)) act("guess", { guess: g.slots.map(t => g.tiles[t].ch).join("") });
}
function clearLoose() { g.slots.forEach((t, s) => { if (!g.lock.includes(s) && t != null) { g.tiles[t].used = false; g.slots[s] = null; } }); }
async function doHint() {
  if (!g || g.locked) return; g.locked = true;
  try {
    const r = await post("/api/runs/" + g.run + "/hint");
    g.locked = false;
    if (r.name) return reveal(r); // hết giờ trong lúc chờ
    clearLoose(); const ti = g.tiles.findIndex(t => !t.used && t.ch === r.letter);
    if (ti >= 0) { g.slots[r.pos] = ti; g.tiles[ti].used = true; g.lock.push(r.pos); }
    render(); g.ctx.toast("Đã mở 1 chữ (−50 điểm)");
    if (!g.slots.includes(null)) act("guess", { guess: g.slots.map(t => g.tiles[t].ch).join("") });
  } catch (e) { g.locked = false; g.ctx.toast(e.message); }
}
async function act(action, body) {
  if (g.locked) return; g.locked = true;
  let r;
  try { r = await post("/api/runs/" + g.run + "/" + action, body); } catch (e) { g.locked = false; g.ctx.toast(e.message); return; }
  if (r.retry) { const sl = $("g2slots"); sl.classList.add("bad"); beep("bad"); setTimeout(() => { clearLoose(); g.locked = false; render(); }, 450); return; }
  reveal(r);
}
function reveal(r) {
  g.locked = true; cancelAnimationFrame(g.raf); g.score = r.score; $("g2sc").textContent = g.score;
  if (r.ok) { $("g2slots").classList.add("good"); beep("ok"); } else beep("bad");
  const rv = $("g2rev");
  setTimeout(() => {
    rv.innerHTML = '<div class="rv ' + (r.ok ? "ok" : "no") + '">' + (r.ok ? "✓ Chính xác! +" + r.gain + " điểm" : "✕ " + esc(r.why || "Chưa đúng") + ". Đáp án là:") + '</div><div class="pics">' + r.pics.join(" ") + '</div><div class="nm">' + esc(r.name) + "</div><p>" + esc(r.info) + '</p><button class="btn" style="background:#0f8a5f;max-width:280px">' + (r.last ? "Xem kết quả" : "Câu tiếp theo") + "</button>";
    rv.className = "reveal on";
    rv.querySelector("button").onclick = () => { rv.querySelector("button").disabled = true; next().catch(e => { g.ctx.toast(e.message); g.ctx.leave(); }); };
  }, r.ok ? 450 : 150);
}
async function end() {
  g.running = false;
  try {
    const r = await post("/api/runs/" + g.run + "/finish");
    g.ctx.result("g2", r, [[r.stats.ok + "/" + r.stats.total, "Đoán đúng"], [r.stats.hints, "Gợi ý đã dùng"], [r.stats.total - r.stats.ok, "Bỏ lỡ"]],
      '<div class="lbl">Địa danh trong lượt này</div><ul class="rev">' + r.review.map(p => "<li><b>" + p.pics.join(" ") + " → " + esc(p.name) + "</b>" + esc(p.info) + "</li>").join("") + "</ul>");
  } catch (e) { g.ctx.toast(e.message); g.ctx.leave(); }
}
