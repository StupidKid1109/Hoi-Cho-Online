// Gian 1 cũ "Thật hay giả?" (vuốt thẻ), đã thay bằng "Ai là Hacker?" (server/src/hacker.js). Giữ lại để tham khảo.
// Dùng kèm _legacy/cards.json và _legacy/swipe-client.js; không còn được nạp ở đâu.
import { GameError } from "../server/src/games.js";
const shuffle = a => a.slice().sort(() => Math.random() - 0.5);

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

