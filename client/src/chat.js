// Khung chat của khu. Máy chủ lọc và phát tin; điện thoại chỉ kiểm tra trước để báo lỗi nhanh.
import { $, esc } from "./ui.js";
import { blockReason, normalize, CHAT_GAP_MS } from "../../shared/chatFilter.js";

const QUICK = ["Chào cả khu 👋", "Gian nào dễ nhất vậy?", "Mình vừa phá kỷ lục 🎉", "Cố lên mọi người!", "Cảm ơn nha 🙏", "Hẹn gặp ở Bảng vàng 🏆"];
let log = [], open = false, on = true, unread = 0, lastSent = 0, ctx = null;
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* bỏ qua */ } } };
export const hiddenIds = () => new Set(store.get("hc_hidden") || []);

export function initChat(context) {
  ctx = context; log = []; unread = 0; on = !store.get("hc_chat_off");
  $("cquick").innerHTML = QUICK.map(q => "<button>" + q + "</button>").join("");
  $("cquick").querySelectorAll("button").forEach(b => b.onclick = () => send(b.textContent));
  $("cToggle").onclick = () => toggle(!open); $("cClose").onclick = () => toggle(false);
  $("cOff").onclick = () => { on = !on; store.set("hc_chat_off", !on); render(); };
  $("cform").onsubmit = e => { e.preventDefault(); send($("cin").value); $("cin").value = ""; };
  $("cKhu").textContent = ctx.khu;
  push({ sys: true, ok: true, text: "Chào mừng đến khu " + ctx.khu + "! Hãy chat lịch sự và không chia sẻ thông tin cá nhân." });
  unread = 0; render();
}

export function setHistory(items) { for (const m of items) push({ id: m.id, pid: m.pid, who: m.nick, text: m.text, mine: m.pid === ctx.myId }, true); render(); }
export function onChat(m) { push({ id: m.id, pid: m.pid, who: m.nick, text: m.text, mine: m.pid === ctx.myId }); if (m.pid !== ctx.myId) ctx.onPeerSay(m.pid, m.text); }
export function onSys(text, ok) { push({ sys: true, ok, text }); }
export function onHide(id) { log = log.filter(m => m.id !== id); render(); }
export function onEmoteSelf(text) { if (on) push({ who: ctx.nick(), text, mine: true }); }

function push(m, quiet) {
  if (m.pid && hiddenIds().has(m.pid)) return;
  log.push(m); if (log.length > 80) log.shift();
  if (!open && !m.mine && !m.sys && !quiet) unread++;
  if (!quiet) render();
}
function render() {
  const el = $("clog"); if (!el) return;
  const list = on ? (open ? log : log.slice(-3)) : (open ? [{ sys: true, text: "Chat đang tắt. Bấm “Bật chat” để xem và gửi tin." }] : []);
  el.innerHTML = list.map(m => '<div class="m' + (m.mine ? " mine" : "") + (m.sys ? " sys" + (m.ok ? " ok" : "") : "") + '" data-i="' + log.indexOf(m) + '">' + (m.sys ? esc(m.text) : "<b>" + esc(m.who) + ":</b> " + esc(m.text)) + "</div>").join("");
  if (open) { el.scrollTop = el.scrollHeight; el.querySelectorAll(".m:not(.mine):not(.sys)").forEach(x => x.onclick = () => menu(x)); }
  const d = $("cDot"); d.textContent = unread > 9 ? "9+" : unread; d.classList.toggle("on", on && unread > 0 && !open);
  $("cOff").textContent = on ? "Tắt chat" : "Bật chat"; $("cToggle").firstChild.textContent = on ? "💬" : "🔕";
}
function menu(el) {
  const m = log[+el.dataset.i]; if (!m || el.querySelector(".act")) return;
  const a = document.createElement("div"); a.className = "act"; a.innerHTML = '<button data-a="r">🚩 Báo cáo</button><button data-a="h">🙈 Ẩn người này</button>'; el.appendChild(a);
  a.querySelector('[data-a="r"]').onclick = ev => { ev.stopPropagation(); a.remove(); if (m.id) ctx.send({ t: "report", id: m.id }); };
  a.querySelector('[data-a="h"]').onclick = ev => {
    ev.stopPropagation(); const h = hiddenIds(); h.add(m.pid); store.set("hc_hidden", [...h]);
    log = log.filter(x => x.pid !== m.pid); ctx.onHide(m.pid); push({ sys: true, ok: true, text: "Đã ẩn tin nhắn và cử chỉ của " + m.who + "." });
  };
}
function send(raw) {
  const text = normalize(raw); if (!text) return;
  if (!on) return push({ sys: true, text: "Chat đang tắt. Bấm “Bật chat” để gửi tin." });
  if (Date.now() - lastSent < CHAT_GAP_MS) return push({ sys: true, text: "Bạn nhắn nhanh quá, đợi vài giây nhé." });
  const why = blockReason(text);
  if (why) return push({ sys: true, text: "⚠️ Tin chưa được gửi vì chứa " + why + ". Không chia sẻ những thông tin này ở nơi công cộng, cẩn thận lừa đảo!" });
  lastSent = Date.now(); ctx.send({ t: "chat", text }); ctx.onSelfSay(text);
}
function toggle(v) { open = v; $("chat").classList.toggle("open", v); if (v) { unread = 0; $("hint3").style.opacity = 0; } render(); if (v && on) setTimeout(() => $("cin").focus(), 50); }
