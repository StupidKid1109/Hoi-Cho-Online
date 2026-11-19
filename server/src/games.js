// Luật chơi và chấm điểm ở máy chủ. Đáp án không bao giờ gửi xuống điện thoại trước khi người chơi trả lời.
import { randomInt } from "node:crypto";
import { replay, validInputs, FPS } from "../../shared/runnerSim.js";

export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const strip = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().replace(/[^A-Z]/g, "");
export class GameError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

/* ---------- Gian 1: Thật hay giả ---------- */
export const swipe = {
  duration: 60,
  start(content) {
    const n = content.cards.length, order = [];
    while (order.length < 80) order.push(...shuffle([...Array(n).keys()]));
    const state = { order: order.slice(0, 80), n: 0, pen: 0, score: 0, streak: 0, top: 0, ok: 0, miss: [] };
    const cards = state.order.map((ci, k) => { const c = content.cards[ci]; return { k, icon: c.icon, from: c.from, text: c.text }; });
    return { state, view: { duration: this.duration, cards } };
  },
  left(run, now) { return this.duration - (now - run.started) / 1000 - run.state.pen; },
  answer(run, body, content, now) {
    const s = run.state, k = Number(body.k);
    if (k !== s.n) throw new GameError("Thẻ không đúng thứ tự");
    if (this.left(run, now) <= 0) return { done: true, score: s.score };
    const c = content.cards[s.order[k]], ok = Boolean(body.scam) === c.scam;
    s.n++;
    let gain = 0;
    if (ok) { s.streak++; s.ok++; s.top = Math.max(s.top, s.streak); gain = 50 + 10 * Math.min(5, s.streak - 1); s.score += gain; }
    else { s.streak = 0; s.pen += 3; if (!s.miss.includes(s.order[k])) s.miss.push(s.order[k]); }
    return { ok, scam: c.scam, why: c.why, gain, score: s.score, streak: s.streak, left: Math.max(0, this.left(run, now)), done: this.left(run, now) <= 0 };
  },
  result(run, content) {
    const s = run.state;
    return { score: s.score, stats: { ok: s.ok, n: s.n, top: s.top },
      review: s.miss.map(i => ({ icon: content.cards[i].icon, text: content.cards[i].text, scam: content.cards[i].scam, why: content.cards[i].why })) };
  }
};

/* ---------- Gian 2: Đuổi hình bắt chữ ---------- */
export function tilesFor(ans) {
  const fill = "ABCDEGHIKLMNOPQRSTUVXY", n = Math.max(14, Math.ceil((ans.length + 4) / 7) * 7), letters = ans.split("");
  while (letters.length < n) letters.push(fill[randomInt(fill.length)]);
  return shuffle(letters);
}
export const rebus = {
  start(content) {
    const set = shuffle([...content.puzzles.keys()]).slice(0, content.perRound || 5);
    const state = { set, i: 0, servedAt: 0, hints: 0, lock: [], score: 0, ok: 0, hintsUsed: 0, done: [] };
    return { state, view: { total: set.length, seconds: content.seconds || 40 } };
  },
  serve(run, content, now) {
    const s = run.state, p = content.puzzles[s.set[s.i]], words = p.name.split(/\s+/).map(w => strip(w).length);
    s.servedAt = now; s.hints = 0; s.lock = []; s.answered = false;
    return { index: s.i, total: s.set.length, pics: p.pics, words, tiles: tilesFor(strip(p.name)), seconds: content.seconds || 40 };
  },
  reveal(run, content, ok, gain, why) {
    const s = run.state, p = content.puzzles[s.set[s.i]];
    s.answered = true; s.done.push({ ok, name: p.name });
    return { ok, gain, why, name: p.name, info: p.info, pics: p.pics, score: s.score, last: s.i >= s.set.length - 1 };
  },
  left(run, content, now) { return 1 - (now - run.state.servedAt) / 1000 / (content.seconds || 40); },
  act(run, action, body, content, now) {
    const s = run.state, p = content.puzzles[s.set[s.i]], ans = strip(p.name);
    if (action === "next") {
      if (s.servedAt && !s.answered) throw new GameError("Câu hiện tại chưa xong");
      if (s.servedAt) s.i++;
      if (s.i >= s.set.length) return { done: true };
      return { puzzle: this.serve(run, content, now) };
    }
    if (!s.servedAt || s.answered) throw new GameError("Không có câu nào đang mở");
    const left = this.left(run, content, now);
    if (left < -0.03) return this.reveal(run, content, false, 0, "Hết giờ");   // cho phép trễ khoảng 1 giây do mạng
    if (action === "guess") {
      if (strip(body.guess || "") !== ans) return { ok: false, retry: true };
      const gain = Math.max(50, 200 + Math.round(200 * Math.max(0, left)) - 50 * s.hints);
      s.score += gain; s.ok++;
      return this.reveal(run, content, true, gain);
    }
    if (action === "hint") {
      const pos = [...ans].findIndex((_, i) => !s.lock.includes(i));
      if (pos < 0) throw new GameError("Đã mở hết chữ");
      s.lock.push(pos); s.hints++; s.hintsUsed++;
      return { pos, letter: ans[pos] };
    }
    if (action === "skip") return this.reveal(run, content, false, 0, body.timeout ? "Hết giờ" : "Bạn đã bỏ qua");
    throw new GameError("Thao tác không hợp lệ");
  },
  result(run, content) {
    const s = run.state;
    return { score: s.score, stats: { ok: s.ok, total: s.set.length, hints: s.hintsUsed },
      review: s.set.map(i => ({ pics: content.puzzles[i].pics, name: content.puzzles[i].name, info: content.puzzles[i].info })) };
  }
};

/* ---------- Gian 3: Đường về an toàn ---------- */
export const runner = {
  start() { const seed = randomInt(1, 2 ** 31); return { state: { seed }, view: { seed } }; },
  finish(run, body, now) {
    const inputs = body.inputs, frames = Number(body.frames);
    if (!validInputs(inputs) || !Number.isInteger(frames) || frames < 0) throw new GameError("Dữ liệu lượt chơi không hợp lệ");
    const r = replay(run.state.seed, inputs, frames);
    const wall = (now - run.started) / 1000;
    if (r.frames / FPS > wall + 3) throw new GameError("Thời gian chơi không khớp, kết quả không được ghi nhận", 422);
    run.state.result = r;
    return r;
  },
  result(run) { const r = run.state.result || { score: 0, dist: 0, coins: 0, stars: 0, tips: [] }; return { score: r.score, stats: { dist: r.dist, coins: r.coins, stars: r.stars }, tips: r.tips }; }
};
