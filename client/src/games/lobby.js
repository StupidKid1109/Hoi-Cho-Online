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
