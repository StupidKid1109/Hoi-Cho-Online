// Luật chơi và chấm điểm ở máy chủ. Đáp án không bao giờ gửi xuống điện thoại trước khi người chơi trả lời.
import { randomInt } from "node:crypto";
import { replay, validInputs, FPS, dailyMissions } from "../../shared/runnerSim.js";

export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const strip = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toUpperCase().replace(/[^A-Z]/g, "");
export class GameError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }

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
  start(now = Date.now()) {
    const seed = randomInt(1, 2 ** 31), day = new Date(now + 7 * 36e5).toISOString().slice(0, 10), missions = dailyMissions(day); // nhiệm vụ theo ngày giờ Việt Nam
    return { state: { seed, missions }, view: { seed, missions } };
  },
  finish(run, body, now) {
    const inputs = body.inputs, frames = Number(body.frames);
    if (!validInputs(inputs) || !Number.isInteger(frames) || frames < 0) throw new GameError("Dữ liệu lượt chơi không hợp lệ");
    const r = replay(run.state.seed, inputs, frames, run.state.missions || []);
    const wall = (now - run.started) / 1000;
    if (r.frames / FPS > wall + 3) throw new GameError("Thời gian chơi không khớp, kết quả không được ghi nhận", 422);
    run.state.result = r;
    return r;
  },
  result(run) {
    const r = run.state.result || { score: 0, dist: 0, coins: 0, stars: 0, tips: [] };
    return { score: r.score, stats: { dist: r.dist, coins: r.coins, stars: r.stars, qOk: r.qOk || 0, qN: r.qN || 0 }, tips: r.tips, qWrong: r.qWrong || [], missions: r.missions || [] };
  }
};
