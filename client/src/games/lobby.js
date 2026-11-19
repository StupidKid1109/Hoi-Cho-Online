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
const SPACE_MSG = new Set(["mspace", "mpjoin", "mpleave", "mposes", "memote", "mchat", "msys", "cmusic"]);
/**
 * Mở không gian riêng của gian `game` (lớp phủ trong màn hình của gian). Trả về bộ điều khiển ngay;
 * phần 3D nạp sau (tin đến trước thì xếp hàng). Không có WebGL thì trả về null (game dùng thẻ phòng chờ 2D),
 * riêng quán cà phê vẫn mở dạng phẳng (chat, nhạc vẫn dùng được).
 *   solo: Gian 3 (không phòng chờ, có nút "Bắt đầu chạy" gọi onStart)
 *   cafe: quán cà phê (không có ván chơi; có nhạc quản trị viên bật)
 *   rules: [icon, tiêu đề, [[icon, dòng], ...]] để hiện "Luật chơi"
 */
export function createSpace({ game, title, tag, color, nick, solo, cafe, send, rules, onLeave, onStart, use3d, apiBase = "", toast }) {
  if (!use3d && !cafe) return null;
  const scr = document.getElementById(game);
  const el = document.createElement("div"); el.className = "space on" + (use3d ? "" : " flat"); el.style.setProperty("--c", color);
  el.innerHTML = '<div class="sp-view"></div>' +
    '<div class="sp-top"><div class="sp-t"><small>' + esc(tag) + '</small>' + esc(title) + '</div><div class="sp-st"></div></div>' +
    (cafe ? '<div class="sp-music"><span class="mt">🎵 Chưa bật nhạc</span><button class="tv" aria-label="Ẩn, hiện video" hidden>📺</button><button class="mute" aria-label="Tắt tiếng">🔊</button></div><button class="btn sp-unlock" hidden>🔊 Bấm để nghe nhạc</button><div class="sp-yt" hidden><div></div></div>' : "") +
    '<div class="sp-log" aria-live="polite"></div>' +
    '<form class="sp-chat" autocomplete="off"><input maxlength="80" placeholder="' + (cafe ? "Trò chuyện trong quán…" : "Nhắn cho cả phòng chờ…") + '" enterkeyhint="send"><button>Gửi</button></form>' +
    '<div class="sp-bar">' +
    (solo ? "" : '<button class="sp-b" data-a="chat">💬<span>Chat</span></button>') +
    '<button class="sp-b" data-a="wave">👋<span>Chào</span></button>' +
    '<button class="sp-b" data-a="clap">👏<span>Vỗ tay</span></button>' +
    '<button class="sp-b" data-a="rules">' + (cafe ? "☕<span>Giới thiệu</span>" : "📜<span>Luật chơi</span>") + "</button>" +
    '<button class="sp-b" data-a="out">🚪<span>Ra hội chợ</span></button></div>' +
    (solo ? '<button class="btn sp-go">🛵 Bắt đầu chạy</button>' : "") +
    (use3d ? '<div class="sp-help">Chạm sàn để đi lại · máy tính: W A S D</div>' : "") +
    '<div class="sp-fade"><div>' + (cafe ? "☕" : solo ? "🛵" : "🚪") + "<b>Đang vào " + esc(tag) + "…</b></div></div>" +
    '<div class="sp-rules"></div>';
  scr.appendChild(el);
  const $q = s => el.querySelector(s);
  let room = null, myN = -1, closed = false, queue = [], lastLobby = null, cd = 0;
  const st = $q(".sp-st"), log = $q(".sp-log"), form = $q(".sp-chat"), input = form.querySelector("input");

  function showRules(first) {
    const r = $q(".sp-rules");
    r.innerHTML = '<div class="box"><div class="big">' + rules[0] + "</div><h2>" + esc(rules[1]) + "</h2><ul>" + rules[2].map(x => "<li><i>" + x[0] + "</i>" + esc(x[1]) + "</li>").join("") +
      '</ul><button class="btn" style="background:' + color + '">' + (first ? (cafe ? "Vào quán" : "Đã hiểu, vào phòng") : "Đã hiểu") + "</button></div>";
    r.classList.add("on"); r.querySelector("button").onclick = () => r.classList.remove("on");
  }
  el.querySelector(".sp-bar").onclick = e => {
    const b = e.target.closest("button"); if (!b) return;
    const a = b.dataset.a;
    if (a === "chat") { const on = !form.classList.contains("on"); form.classList.toggle("on", on); b.classList.toggle("on", on); if (on) input.focus(); }
    else if (a === "wave" || a === "clap") { if (room) room.selfEmote(a === "wave" ? 0 : 2); else send({ t: "memote", e: a === "wave" ? 0 : 2 }); }
    else if (a === "rules") showRules(false);
    else if (a === "out") onLeave();
  };
  form.onsubmit = e => { e.preventDefault(); const text = input.value.trim(); if (!text) return; send({ t: "mchat", text }); input.value = ""; };
  if (solo) $q(".sp-go").onclick = () => onStart();
  try { const k = "hoicho-rules-" + game; if (!localStorage.getItem(k)) { localStorage.setItem(k, "1"); showRules(true); } } catch (e) { /* bỏ qua */ }

  /* ---------- Khung chat: 6 tin gần nhất, mờ dần ---------- */
  function addLog(html, cls) {
    const d = document.createElement("div"); d.className = "ln " + (cls || ""); d.innerHTML = html; log.appendChild(d);
    while (log.children.length > 6) log.firstChild.remove();
    setTimeout(() => d.classList.add("old"), 12000);
  }

  /* ---------- Nhạc của quán: phát đúng đoạn đang phát chung cho cả quán ---------- */
  let audio = null, muted = false, mstate = null, skew = 0;
  function musicUi() {
    if (!cafe) return;
    const on = !!(mstate && (mstate.file || mstate.yt));
    $q(".sp-music .mt").textContent = on ? "🎵 " + mstate.title : "🎵 Chưa bật nhạc";
    $q(".sp-music .mute").textContent = muted ? "🔇" : "🔊";
    $q(".sp-music").classList.toggle("on", on);
    if (room) room.setMusicOn(on && !muted && !(mstate.yt && ytHidden));
    drawLobby();
  }
  function seek() {
    if (!audio || !mstate || !mstate.file) return;
    const d = audio.duration; let t = (Date.now() - skew - mstate.startedAt) / 1000;
    if (isFinite(d) && d > 0) { if (mstate.loop) t %= d; else if (t >= d) { audio.pause(); return; } }
    try { if (Math.abs(audio.currentTime - t) > 1.5) audio.currentTime = Math.max(0, t); } catch (e) { /* bỏ qua */ }
  }
  function playNow() {
    if (!audio || !mstate || !mstate.file) return;
    const p = audio.play(); if (p && p.then) p.then(() => { $q(".sp-unlock").hidden = true; }).catch(e => { if (e && e.name === "AbortError") return; console.warn("Chưa phát được nhạc:", e && e.name); $q(".sp-unlock").hidden = false; });
  }
  /* ---------- Video YouTube: trình phát nhúng chính thức của YouTube (hiện trên màn hình, không tải nhạc về) ---------- */
  let yt = null, ytId = null, ytHidden = false, ytCheck = 0;
  const ytBox = cafe ? $q(".sp-yt") : null;
  function loadYT() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    if (!loadYT.p) loadYT.p = new Promise((res, rej) => {
      const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(); };
      const sc = document.createElement("script"); sc.src = "https://www.youtube.com/iframe_api"; sc.onerror = () => { loadYT.p = null; rej(new Error("yt")); }; document.head.appendChild(sc);
      setTimeout(() => rej(new Error("timeout")), 15000);
    });
    return loadYT.p;
  }
  /** Giây đang phát chung của cả quán (âm: video đã hết, không lặp). */
  function ytTarget() {
    let t = (Date.now() - skew - mstate.startedAt) / 1000; const d = yt && yt.getDuration ? yt.getDuration() : 0;
    if (d > 0) { if (mstate.loop !== false) t %= d; else if (t >= d) return -1; }
    return Math.max(0, t);
  }
  function syncYT() {
    if (!yt || !yt.seekTo || !mstate || !mstate.yt) return;
    yt.setVolume(Math.round((mstate.volume ?? 0.8) * 100)); if (muted) yt.mute(); else yt.unMute();
    if (ytHidden) return yt.pauseVideo();
    const t = ytTarget(); if (t < 0) return yt.pauseVideo();
    if (Math.abs((yt.getCurrentTime() || 0) - t) > 2) yt.seekTo(t, true);
    yt.playVideo();
    clearTimeout(ytCheck); ytCheck = setTimeout(() => { // trình duyệt chặn tự phát có tiếng: hiện nút bấm để nghe
      const st = yt && yt.getPlayerState ? yt.getPlayerState() : -1;
      if (mstate && mstate.yt && !ytHidden && st !== 1 && st !== 3) $q(".sp-unlock").hidden = false;
    }, 2500);
  }
  async function applyYT(m) {
    ytBox.hidden = ytHidden; $q(".sp-music .tv").hidden = false;
    try { await loadYT(); } catch (e) { ytBox.hidden = true; addLog("Không tải được trình phát YouTube (kiểm tra mạng Internet).", "sys"); return; }
    if (closed || mstate !== m) return;
    const start = Math.floor(Math.max(0, (Date.now() - skew - m.startedAt) / 1000));
    if (!yt) {
      ytId = m.yt;
      yt = new window.YT.Player(ytBox.firstElementChild, {
        width: 220, height: 200, videoId: m.yt,
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1, rel: 0, iv_load_policy: 3, start },
        events: {
          onReady: () => syncYT(),
          onStateChange: e => { if (e.data === 1) $q(".sp-unlock").hidden = true; if (e.data === 0 && mstate && mstate.loop !== false) syncYT(); },
          onError: e => addLog("Video YouTube này không phát được ở đây" + (e.data === 101 || e.data === 150 ? " (chủ video không cho phát nhúng)" : "") + ".", "sys")
        }
      });
    } else if (ytId !== m.yt) { ytId = m.yt; yt.loadVideoById({ videoId: m.yt, startSeconds: start }); setTimeout(syncYT, 1200); }
    else syncYT();
  }
  function stopYT() { clearTimeout(ytCheck); if (yt && yt.stopVideo) yt.stopVideo(); if (ytBox) ytBox.hidden = true; if (cafe) $q(".sp-music .tv").hidden = true; }

  function applyMusic(m) {
    mstate = m; skew = Date.now() - (m.now || Date.now());
    if (m.yt) { if (audio) audio.pause(); $q(".sp-unlock").hidden = true; applyYT(m); return musicUi(); }
    stopYT();
    if (!m.file) { if (audio) audio.pause(); $q(".sp-unlock").hidden = true; return musicUi(); }
    if (!audio) { audio = new Audio(); audio.preload = "auto"; audio.addEventListener("loadedmetadata", seek); window.__cafeAudio = audio; }
    const src = apiBase + "/api/music/file/" + encodeURIComponent(m.file);
    if (audio.dataset.src !== src) { audio.src = src; audio.dataset.src = src; }
    audio.loop = m.loop !== false; audio.volume = Math.max(0, Math.min(1, m.volume ?? 0.8)); audio.muted = muted;
    if (audio.readyState >= 1) seek();
    playNow(); musicUi();
  }
  if (cafe) {
    $q(".sp-music .mute").onclick = () => { muted = !muted; if (mstate && mstate.yt) syncYT(); else if (audio) { audio.muted = muted; if (!muted) { seek(); playNow(); } } musicUi(); };
    $q(".sp-unlock").onclick = () => { if (mstate && mstate.yt) { if (yt && yt.unMute) { yt.unMute(); yt.playVideo(); } syncYT(); } else { seek(); playNow(); } };
    // ẩn video thì dừng phát cho riêng mình (YouTube yêu cầu trình phát phải hiện khi đang phát)
    $q(".sp-music .tv").onclick = () => { ytHidden = !ytHidden; ytBox.hidden = ytHidden; $q(".sp-music .tv").classList.toggle("off", ytHidden); syncYT(); musicUi(); };
  }

  function drawLobby() {
    const m = lastLobby; if (!m && !cafe) return;
    clearInterval(cd);
    if (cafe) {
      const n = m ? m.n : 1, on = mstate && (mstate.file || mstate.yt);
      if (room) room.setScreen(on ? "♪ " + mstate.title : "☕ Mời bạn ngồi chơi", n + " người đang trong quán", on ? "Nhạc do ban tổ chức bật" : "Ban tổ chức sẽ bật nhạc sớm thôi");
      st.innerHTML = "☕ <b>" + n + "</b> người trong quán";
    } else if (m.startIn != null) {
      const at = Date.now() + m.startIn;
      const tick = () => { const s = Math.max(0, Math.ceil((at - Date.now()) / 1000)); room && room.setScreen(m.n + " NGƯỜI", "Bắt đầu sau " + s + " giây!", "Tối đa " + m.max + " người mỗi phòng"); st.innerHTML = "⏱ Bắt đầu sau <b>" + s + "</b> giây"; };
      tick(); cd = setInterval(tick, 250);
    } else {
      const need = Math.max(0, m.min - m.n);
      if (room) room.setScreen(m.n + " / " + m.min, "Cần thêm " + need + " người nữa để bắt đầu", "Ít nhất " + m.min + ", tối đa " + m.max + " người · mời bạn bè vào cùng chơi!");
      st.innerHTML = "👥 <b>" + m.n + "</b>/" + m.min + " người · cần thêm <b>" + need + "</b>";
    }
  }
  // tin không cần phần 3D (chat, nhạc) xử lý ngay; tin về nhân vật thì chờ phòng 3D dựng xong
  function handleNow(m) {
    if (m.t === "mchat") { addLog("<b>" + esc(m.nick) + ":</b> " + esc(m.text), m.n === myN ? "me" : ""); if (room) room.say(m.n, m.text, myN); return true; }
    if (m.t === "msys") { addLog(esc(m.text), "sys"); if (toast) toast(m.text); return true; }
    if (m.t === "cmusic") { applyMusic(m); return true; }
    if (m.t === "mspace") myN = m.you.n;
    return false;
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
    /** Tin không gian (mspace, mpjoin, chat, nhạc...). Trả về true nếu đã xử lý. */
    msg(m) {
      if (cafe && m.t === "mlobby") { ctl.lobby(m); return true; }
      if (!SPACE_MSG.has(m.t)) return false;
      if (handleNow(m)) return true;
      if (room) handle(m); else if (use3d) queue.push(m);
      return true;
    },
    /** Ẩn khi ván bắt đầu, hiện lại khi chơi lại. */
    hide() { clearInterval(cd); el.classList.remove("on"); form.classList.remove("on"); if (room) room.setActive(false); },
    show() { el.classList.add("on"); if (room) { room.setActive(true); drawLobby(); } if (!solo && !cafe) st.textContent = "Đang vào phòng chờ…"; },
    close() { closed = true; clearInterval(cd); clearTimeout(ytCheck); if (yt && yt.destroy) yt.destroy(); if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); } if (room) room.close(); el.remove(); }
  };
  st.textContent = cafe ? "☕ Đang vào quán…" : solo ? "Sẵn sàng thì bấm Bắt đầu" : "Đang vào phòng chờ…";
  if (!use3d) { setTimeout(() => $q(".sp-fade").classList.add("off"), 300); return ctl; }
  const t0 = performance.now();
  import("../booth3d.js").then(mod => mod.openRoom({ container: $q(".sp-view"), game, title, nick, solo, send }))
    .then(r => {
      if (closed) { r.close(); return; }
      room = r; queue.forEach(handle); queue = []; drawLobby(); musicUi();
      if (!el.classList.contains("on")) r.setActive(false);
      setTimeout(() => $q(".sp-fade").classList.add("off"), Math.max(0, 450 - (performance.now() - t0)));
    })
    .catch(e => { console.warn("Không dựng được không gian gian hàng", e); $q(".sp-fade").classList.add("off"); el.classList.add("flat"); });
  return ctl;
}
