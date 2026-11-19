// Phòng chờ dùng chung cho đấu phòng Gian 1, Gian 2: hiện số người, danh sách biệt danh, đếm ngược.
import { esc } from "../ui.js";

/** Tạo (hoặc lấy lại) lớp phủ phòng chờ trong màn hình của gian. */
export function lobbyEl(screenId) {
  let el = document.getElementById(screenId + "lobby");
  if (!el) {
    el = document.createElement("div"); el.id = screenId + "lobby"; el.className = "lobby";
    document.getElementById(screenId).appendChild(el);
  }
  return el;
}
/** Vẽ phòng chờ theo tin "mlobby" của máy chủ. onLeave: bấm "Rời phòng". */
export function renderLobby(el, m, title, color, onLeave) {
  const need = Math.max(0, m.min - m.n), pct = Math.min(100, Math.round(100 * m.n / m.min));
  const status = m.startIn != null
    ? '<div class="lb-go">Bắt đầu sau <b data-cd="' + (Date.now() + m.startIn) + '">' + Math.ceil(m.startIn / 1000) + "</b> giây</div>"
    : '<div class="lb-wait">Cần thêm <b>' + need + "</b> người nữa để bắt đầu</div>";
  el.innerHTML = '<div class="lb-box" style="--c:' + color + '"><div class="lb-t">👥 Phòng chờ · ' + esc(title) + "</div>" +
    '<div class="lb-n"><b>' + m.n + "</b>/" + m.min + " người</div>" +
    '<div class="lb-bar"><i style="width:' + pct + '%"></i></div>' + status +
    '<div class="lb-rule">Cần ít nhất ' + m.min + " người, tối đa " + m.max + " người mỗi phòng. Mời bạn bè vào cùng chơi!</div>" +
    '<div class="lb-names">' + m.names.slice(0, 50).map(n => "<span>" + esc(n) + "</span>").join("") + "</div>" +
    '<button class="btn ghost lb-leave">Rời phòng</button></div>';
  el.classList.add("on");
  el.querySelector(".lb-leave").onclick = onLeave;
  clearInterval(el._cd);
  const cd = el.querySelector("[data-cd]");
  if (cd) el._cd = setInterval(() => { cd.textContent = Math.max(0, Math.ceil((+cd.dataset.cd - Date.now()) / 1000)); }, 250);
}
export function hideLobby(el) { if (el) { clearInterval(el._cd); el.classList.remove("on"); } }

/** Bảng xếp hạng phòng (top + hạng của mình) để chèn vào màn hình kết quả. */
export function roomBoard(m) {
  return '<div class="lbl">Xếp hạng phòng: bạn hạng #' + m.rank + "/" + m.n + '</div><ol class="lb">' +
    m.top.map((p, i) => '<li class="' + (i + 1 === m.rank ? "me" : "") + '"><span class="rk">' + (i + 1) + '</span><span class="nm">' + esc(p.nick) + '</span><span class="pt">' + p.score.toLocaleString("vi-VN") + "</span></li>").join("") + "</ol>";
}
/** Ba người dẫn đầu sau mỗi câu. */
export function top3(top) {
  return '<div class="top3">' + top.map((p, i) => "<span>" + ["🥇", "🥈", "🥉"][i] + " " + esc(p.nick) + " <b>" + p.score.toLocaleString("vi-VN") + "</b></span>").join("") + "</div>";
}

/* ---------- Không gian 3D riêng của gian hàng ---------- */
const SPACE_MSG = new Set(["mspace", "mpjoin", "mpleave", "mposes", "memote"]);
/**
 * Mở không gian riêng của gian `game` (lớp phủ trong màn hình của gian). Trả về bộ điều khiển ngay;
 * phần 3D nạp sau (tin đến trước thì xếp hàng). Không có WebGL thì trả về null, game dùng thẻ phòng chờ 2D.
 *   solo: Gian 3 (không phòng chờ, có nút "Bắt đầu chạy" gọi onStart)
 *   rules: [icon, tiêu đề, [[icon, dòng], ...]] để hiện "Luật chơi"
 */
export function createSpace({ game, title, tag, color, nick, solo, send, rules, onLeave, onStart, use3d }) {
  if (!use3d) return null;
  const scr = document.getElementById(game);
  const el = document.createElement("div"); el.className = "space on"; el.style.setProperty("--c", color);
  el.innerHTML = '<div class="sp-view"></div>' +
    '<div class="sp-top"><div class="sp-t"><small>' + esc(tag) + '</small>' + esc(title) + '</div><div class="sp-st"></div></div>' +
    '<div class="sp-bar">' +
    '<button class="sp-b" data-a="wave">👋<span>Chào</span></button>' +
    '<button class="sp-b" data-a="clap">👏<span>Vỗ tay</span></button>' +
    '<button class="sp-b" data-a="rules">📜<span>Luật chơi</span></button>' +
    '<button class="sp-b" data-a="out">🚪<span>Ra hội chợ</span></button></div>' +
    (solo ? '<button class="btn sp-go">🛵 Bắt đầu chạy</button>' : "") +
    '<div class="sp-help">Chạm sàn để đi lại · máy tính: W A S D</div>' +
    '<div class="sp-fade"><div>' + (solo ? "🛵" : "🚪") + "<b>Đang vào " + esc(tag) + "…</b></div></div>" +
    '<div class="sp-rules"></div>';
  scr.appendChild(el);
  const $q = s => el.querySelector(s);
  let room = null, myN = -1, closed = false, queue = [], lastLobby = null, cd = 0;
  const st = $q(".sp-st");

  function showRules(first) {
    const r = $q(".sp-rules");
    r.innerHTML = '<div class="box"><div class="big">' + rules[0] + "</div><h2>" + esc(rules[1]) + "</h2><ul>" + rules[2].map(x => "<li><i>" + x[0] + "</i>" + esc(x[1]) + "</li>").join("") +
      '</ul><button class="btn" style="background:' + color + '">' + (first ? "Đã hiểu, vào phòng" : "Đã hiểu") + "</button></div>";
    r.classList.add("on"); r.querySelector("button").onclick = () => r.classList.remove("on");
  }
  el.querySelector(".sp-bar").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    const a = b.dataset.a;
    if (a === "wave" || a === "clap") { if (room) room.selfEmote(a === "wave" ? 0 : 2); }
    else if (a === "rules") showRules(false);
    else if (a === "out") onLeave();
  };
  if (solo) $q(".sp-go").onclick = () => onStart();
  try { const k = "hoicho-rules-" + game; if (!localStorage.getItem(k)) { localStorage.setItem(k, "1"); showRules(true); } } catch (e) { /* bỏ qua */ }

  function drawLobby() {
    const m = lastLobby; if (!m) return;
    clearInterval(cd);
    if (m.startIn != null) {
      const at = Date.now() + m.startIn;
      const tick = () => { const s = Math.max(0, Math.ceil((at - Date.now()) / 1000)); room && room.setScreen(m.n + " NGƯỜI", "Bắt đầu sau " + s + " giây!", "Tối đa " + m.max + " người mỗi phòng"); st.innerHTML = "⏱ Bắt đầu sau <b>" + s + "</b> giây"; };
      tick(); cd = setInterval(tick, 250);
    } else {
      const need = Math.max(0, m.min - m.n);
      if (room) room.setScreen(m.n + " / " + m.min, "Cần thêm " + need + " người nữa để bắt đầu", "Ít nhất " + m.min + ", tối đa " + m.max + " người · mời bạn bè vào cùng chơi!");
      st.innerHTML = "👥 <b>" + m.n + "</b>/" + m.min + " người · cần thêm <b>" + need + "</b>";
    }
  }
  function handle(m) {
    if (m.t === "mspace") { myN = m.you.n; room.setSpace(m); }
    else if (m.t === "mpjoin") room.addPeer(m.peer);
    else if (m.t === "mpleave") room.removePeer(m.n);
    else if (m.t === "mposes") room.movePeers(m.p, myN);
    else if (m.t === "memote") room.emote(m.n, m.e);
  }
  const ctl = {
    /** Tin "mlobby": số người, đếm ngược. */
    lobby(m) { lastLobby = m; drawLobby(); },
    /** Tin không gian (mspace, mpjoin, ...) */
    msg(m) { if (!SPACE_MSG.has(m.t)) return false; if (room) handle(m); else queue.push(m); return true; },
    /** Ẩn khi ván bắt đầu, hiện lại khi chơi lại. */
    hide() { clearInterval(cd); el.classList.remove("on"); if (room) room.setActive(false); },
    show() { el.classList.add("on"); if (room) { room.setActive(true); drawLobby(); } if (!solo) st.textContent = "Đang vào phòng chờ…"; },
    close() { closed = true; clearInterval(cd); if (room) room.close(); el.remove(); }
  };
  if (!solo) st.textContent = "Đang vào phòng chờ…"; else st.textContent = "Sẵn sàng thì bấm Bắt đầu";
  const t0 = performance.now();
  import("../booth3d.js").then(mod => mod.openRoom({ container: $q(".sp-view"), game, title, nick, solo, send }))
    .then(r => {
      if (closed) { r.close(); return; }
      room = r; queue.forEach(handle); queue = []; drawLobby();
      if (!el.classList.contains("on")) r.setActive(false);
      setTimeout(() => $q(".sp-fade").classList.add("off"), Math.max(0, 450 - (performance.now() - t0)));
    })
    .catch(e => { console.warn("Không dựng được không gian gian hàng", e); $q(".sp-fade").classList.add("off"); el.classList.add("flat"); });
  return ctl;
}
