// Vẽ biển báo giao thông bằng canvas cho câu hỏi luật ở Gian 3 (không cần file ảnh).
// Hình vẽ minh họa theo QCVN 41 (đơn giản hóa), dùng chung cho thẻ câu hỏi và cổng đáp án 3D.
const RED = "#d62828", BLUE = "#1d5fbf", YEL = "#ffc928", INK = "#1a1a1a";

function ring(g, c, r, fill, edge = RED) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = edge; g.fill(); g.beginPath(); g.arc(c, c, r * 0.8, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); }
function slash(g, c, r, w) { g.save(); g.translate(c, c); g.rotate(Math.PI / 4); g.fillStyle = RED; g.fillRect(-w / 2, -r * 0.8, w, r * 1.6); g.restore(); }
function emoji(g, e, x, y, px) { g.font = px + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(e, x, y); }
function tri(g, c, s) {
  const top = c - s * 0.42, bot = c + s * 0.36, half = s * 0.45;
  const path = (k) => { g.beginPath(); g.moveTo(c, top + (1 - k) * s * 0.18); g.lineTo(c + half * k, bot - (1 - k) * s * 0.08); g.lineTo(c - half * k, bot - (1 - k) * s * 0.08); g.closePath(); };
  g.lineJoin = "round"; path(1); g.fillStyle = RED; g.fill(); g.lineWidth = s * 0.05; g.strokeStyle = RED; g.stroke(); path(0.78); g.fillStyle = YEL; g.fill();
}

/** Vẽ biển có mã code (xem shared/trafficQuiz.js) vào ngữ cảnh g, ô vuông cạnh s bắt đầu từ (0,0). */
export function drawSign(g, code, s) {
  const c = s / 2, r = s * 0.46;
  g.save();
  switch (code) {
    case "P102": ring(g, c, r, RED, RED); g.fillStyle = "#fff"; g.fillRect(c - r * 0.62, c - r * 0.13, r * 1.24, r * 0.26); break;
    case "P101": ring(g, c, r, "#fff"); break;
    case "P111": ring(g, c, r, "#fff"); emoji(g, "🏍️", c, c + s * 0.02, s * 0.42); slash(g, c, r, s * 0.07); break;
    case "P127": ring(g, c, r, "#fff"); g.fillStyle = INK; g.font = "900 " + (s * 0.4) + "px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("40", c, c + s * 0.03); break;
    case "P121": ring(g, c, r, "#fff"); emoji(g, "📯", c, c + s * 0.02, s * 0.4); slash(g, c, r, s * 0.07); break;
    case "P130": ring(g, c, r, BLUE); slash(g, c, r, s * 0.08); g.save(); g.translate(c, c); g.rotate(Math.PI / 2); g.translate(-c, -c); slash(g, c, r, s * 0.08); g.restore(); break;
    case "P131": ring(g, c, r, BLUE); slash(g, c, r, s * 0.08); break;
    case "STOP": {
      const oct = k => { g.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; g[i ? "lineTo" : "moveTo"](c + Math.cos(a) * r * k, c + Math.sin(a) * r * k); } g.closePath(); };
      oct(1); g.fillStyle = "#fff"; g.fill(); oct(0.92); g.fillStyle = RED; g.fill();
      g.fillStyle = "#fff"; g.font = "900 " + (s * 0.24) + "px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("STOP", c, c + s * 0.01); break;
    }
    case "W224": tri(g, c, s); emoji(g, "🚶", c, c + s * 0.06, s * 0.3); g.fillStyle = INK; for (let i = 0; i < 4; i++) g.fillRect(c - s * 0.18 + i * s * 0.1, c + s * 0.22, s * 0.06, s * 0.03); break;
    case "W225": tri(g, c, s); emoji(g, "🚸", c, c + s * 0.06, s * 0.32); break;
    case "R303": {
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = BLUE; g.fill(); g.lineWidth = s * 0.012; g.strokeStyle = "#fff"; g.stroke();
      g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = s * 0.07;
      for (let i = 0; i < 3; i++) {
        const a0 = i * Math.PI * 2 / 3 + 0.35, a1 = a0 + Math.PI * 2 / 3 - 0.75, rr = r * 0.52;
        g.beginPath(); g.arc(c, c, rr, a0, a1); g.stroke();
        const ax = c + Math.cos(a1) * rr, ay = c + Math.sin(a1) * rr, t = a1 + Math.PI / 2, h = s * 0.1;
        g.beginPath(); g.moveTo(ax + Math.cos(t) * h, ay + Math.sin(t) * h); g.lineTo(ax + Math.cos(t + 2.4) * h * 0.8, ay + Math.sin(t + 2.4) * h * 0.8); g.lineTo(ax + Math.cos(t - 2.4) * h * 0.8, ay + Math.sin(t - 2.4) * h * 0.8); g.closePath(); g.fill();
      }
      break;
    }
    case "I407": {
      const m = s * 0.07; g.fillStyle = "#fff"; g.beginPath(); g.roundRect(m, m, s - 2 * m, s - 2 * m, s * 0.08); g.fill();
      g.fillStyle = BLUE; g.beginPath(); g.roundRect(m * 1.5, m * 1.5, s - 3 * m, s - 3 * m, s * 0.06); g.fill();
      g.fillStyle = "#fff"; g.fillRect(c - s * 0.07, c - s * 0.12, s * 0.14, s * 0.42);
      g.beginPath(); g.moveTo(c, c - s * 0.36); g.lineTo(c + s * 0.2, c - s * 0.1); g.lineTo(c - s * 0.2, c - s * 0.1); g.closePath(); g.fill(); break;
    }
    default: // câu hỏi chữ: biểu tượng chấm hỏi trên nền vàng
      g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.fillStyle = YEL; g.fill(); g.lineWidth = s * 0.04; g.strokeStyle = "#5a3a00"; g.stroke();
      g.fillStyle = "#5a3a00"; g.font = "900 " + (s * 0.52) + "px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("?", c, c + s * 0.03);
  }
  g.restore();
}
/** Ảnh biển báo dạng data URL (cho thẻ câu hỏi HTML). */
const cache = {};
export function signURL(code, s = 160) {
  const k = (code || "?") + s; if (cache[k]) return cache[k];
  const cv = document.createElement("canvas"); cv.width = cv.height = s; drawSign(cv.getContext("2d"), code, s);
  return (cache[k] = cv.toDataURL());
}
