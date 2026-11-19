// Nhạc trong quán cà phê: thư mục server/data/music (cạnh cơ sở dữ liệu), quản trị viên tải bài lên và bật/tắt.
// Lần đầu chạy (thư mục trống) tự tạo một bài nhạc mẫu không lời để thử ngay, không vướng bản quyền.
import { mkdirSync, readdirSync, statSync, writeFileSync, readFileSync, existsSync, unlinkSync, createReadStream } from "node:fs";
import { join, dirname, extname, basename } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";

const EXT = { ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".wav": "audio/wav", ".webm": "audio/webm" };
export const MUSIC_MAX_BYTES = 40 * 1024 * 1024;
const SAMPLE = "nhac-mau-thu-gian.wav";

/** Lấy mã video từ link YouTube (youtu.be/…, watch?v=…, shorts/…, embed/…, music.youtube.com), không hợp lệ thì null. */
/** Đuôi file theo kiểu nội dung tải về (khi link không có đuôi). */
export function extFromType(type) {
  const t = String(type || "").split(";")[0].trim().toLowerCase();
  return { "audio/mpeg": ".mp3", "audio/mp3": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/aac": ".aac", "audio/ogg": ".ogg", "audio/wav": ".wav", "audio/x-wav": ".wav", "audio/wave": ".wav", "audio/webm": ".webm" }[t] || null;
}
export const AUDIO_EXT = EXT;

export function youtubeId(url) {
  const s = String(url || "").trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  let u; try { u = new URL(s); } catch (e) { return null; }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, "");
  let id = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = u.searchParams.get("v");
    const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/); if (!id && m) id = m[2];
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export function makeMusic(config) {
  // cơ sở dữ liệu trong bộ nhớ (kiểm thử): dùng thư mục tạm
  const dir = config.musicDir || (config.dbFile === ":memory:" ? mkdtempSync(join(tmpdir(), "hoicho-music-")) : join(dirname(config.dbFile), "music"));
  mkdirSync(dir, { recursive: true });
  const stateFile = join(dir, "dang-phat.json"), namesFile = join(dir, "ten-bai.json"), ytFile = join(dir, "youtube.json");
  let yt = []; try { yt = JSON.parse(readFileSync(ytFile, "utf8")); } catch (e) { /* chưa có */ }
  const saveYt = () => { try { writeFileSync(ytFile, JSON.stringify(yt, null, 1)); } catch (e) { /* bỏ qua */ } };
  // tên bài có dấu (tên file trên đĩa bỏ dấu cho an toàn)
  let names = {}; try { names = JSON.parse(readFileSync(namesFile, "utf8")); } catch (e) { /* chưa có */ }
  const saveNames = () => { try { writeFileSync(namesFile, JSON.stringify(names, null, 1)); } catch (e) { /* bỏ qua */ } };
  if (!readdirSync(dir).some(f => EXT[extname(f).toLowerCase()])) {
    try { writeFileSync(join(dir, SAMPLE), sampleWav()); names[SAMPLE] = "Nhạc mẫu thư giãn (không lời)"; saveNames(); } catch (e) { console.warn("Không tạo được nhạc mẫu:", e.message); }
  }
  /** Tên file an toàn: bỏ đường dẫn, chỉ giữ chữ, số, gạch, chấm. */
  const safe = name => {
    const ext = extname(String(name)).toLowerCase(); if (!EXT[ext]) return null;
    const base = basename(String(name), extname(String(name))).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
      .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "bai-hat";
    return base + ext;
  };
  const title = f => names[f] || basename(f, extname(f)).replace(/[-_]+/g, " ").replace(/^\w/, c => c.toUpperCase());
  const has = f => { const s = safe(f); return s && s === f && existsSync(join(dir, f)); };
  return {
    dir,
    list: () => readdirSync(dir).filter(f => EXT[extname(f).toLowerCase()]).sort().map(f => ({ file: f, title: title(f), size: statSync(join(dir, f)).size })),
    title, has,
    save(name, buf) {
      const f = safe(name); if (!f) throw new Error("Chỉ nhận file nhạc .mp3, .m4a, .aac, .ogg, .wav");
      writeFileSync(join(dir, f), buf);
      names[f] = basename(String(name), extname(String(name))).replace(/[_]+/g, " ").trim().slice(0, 80) || f; saveNames();
      return f;
    },
    remove(f) { if (has(f)) { unlinkSync(join(dir, f)); delete names[f]; saveNames(); } },
    /* ---------- Danh sách link YouTube (phát bằng trình phát nhúng của YouTube, không tải về máy chủ) ---------- */
    ytList: () => yt.slice(),
    ytGet: id => yt.find(v => v.id === id) || null,
    ytAdd(v) { yt = yt.filter(x => x.id !== v.id); yt.unshift({ id: v.id, title: String(v.title || "Video YouTube").slice(0, 120) }); if (yt.length > 100) yt.length = 100; saveYt(); return yt.slice(); },
    ytRemove(id) { yt = yt.filter(x => x.id !== id); saveYt(); return yt.slice(); },
    /* ---------- Nhạc nền của game (ngoài quán cà phê) ---------- */
    loadBgm() { try { return JSON.parse(readFileSync(join(dir, "nhac-nen.json"), "utf8")); } catch (e) { return null; } },
    saveBgm(b) { try { writeFileSync(join(dir, "nhac-nen.json"), JSON.stringify(b)); } catch (e) { /* bỏ qua */ } },
    loadState() { try { return JSON.parse(readFileSync(stateFile, "utf8")); } catch (e) { return null; } },
    saveState(s) { try { writeFileSync(stateFile, JSON.stringify(s)); } catch (e) { /* bỏ qua */ } },
    /** Gửi file nhạc, hỗ trợ Range để trình duyệt tua tới đúng đoạn đang phát. */
    serve(req, res, f) {
      if (!has(f)) { res.writeHead(404); return res.end(); }
      const path = join(dir, f), size = statSync(path).size, type = EXT[extname(f).toLowerCase()];
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (m) {
        let a = m[1] === "" ? size - Number(m[2]) : Number(m[1]), b = m[1] !== "" && m[2] !== "" ? Number(m[2]) : size - 1;
        a = Math.max(0, a); b = Math.min(size - 1, b);
        if (a > b) { res.writeHead(416, { "content-range": "bytes */" + size }); return res.end(); }
        res.writeHead(206, { "content-type": type, "content-length": b - a + 1, "content-range": "bytes " + a + "-" + b + "/" + size, "accept-ranges": "bytes", "cache-control": "public, max-age=3600" });
        return req.method === "HEAD" ? res.end() : createReadStream(path, { start: a, end: b }).pipe(res);
      }
      res.writeHead(200, { "content-type": type, "content-length": size, "accept-ranges": "bytes", "cache-control": "public, max-age=3600" });
      return req.method === "HEAD" ? res.end() : createReadStream(path).pipe(res);
    }
  };
}

/** Nhạc mẫu: vòng hợp âm nhẹ nhàng kiểu lofi (đàn phím rải, bass, tiếng gõ nhẹ), 32 giây, lặp liền mạch. */
function sampleWav() {
  const SR = 22050, SEC = 32, N = SR * SEC, out = new Float32Array(N);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  // Cmaj7 – Am7 – Fmaj7 – G7, mỗi hợp âm 4 giây, lặp 2 lần
  const chords = [[48, 60, 64, 67, 71], [45, 57, 60, 64, 67], [41, 57, 60, 65, 69], [43, 55, 59, 62, 65]];
  const note = (t0, m, dur, vol, bright) => {
    const f = hz(m), s0 = Math.floor(t0 * SR), len = Math.floor(dur * SR);
    for (let i = 0; i < len && s0 + i < N; i++) {
      const t = i / SR, env = Math.min(1, t * 80) * Math.exp(-t * (bright ? 2.6 : 1.4));
      out[(s0 + i) % N] += vol * env * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t) * (bright ? 1 : 0.4) + 0.12 * Math.sin(6 * Math.PI * f * t));
    }
  };
  const beat = 0.5; // 120 nhịp/phút, nốt móc đơn
  for (let k = 0; k < 8; k++) {
    const c = chords[k % 4], t0 = k * 4;
    note(t0, c[0] - 12 + 12, 3.8, 0.22, false);                 // bass
    note(t0 + 2, c[0] - 12 + 12 + 7, 1.9, 0.12, false);
    for (const m of c.slice(1)) note(t0, m, 3.6, 0.045, false);  // hợp âm nền
    const arp = [1, 2, 3, 4, 3, 2, 3, 4];
    arp.forEach((j, i) => note(t0 + i * beat, c[j] + 12, 1.2, 0.06 + (i % 4 === 0 ? 0.02 : 0), true)); // rải
  }
  // tiếng gõ nhẹ (nhiễu ngắn) mỗi nhịp, nhịp lẻ nhỏ hơn
  let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
  for (let b = 0; b < SEC / beat; b++) {
    const s0 = Math.floor(b * beat * SR), vol = b % 2 ? 0.025 : 0.05;
    for (let i = 0; i < SR * 0.05; i++) out[(s0 + i) % N] += rnd() * vol * Math.exp(-i / (SR * 0.012));
  }
  // ghi WAV 16-bit
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  const buf = Buffer.alloc(44 + N * 2), k = 0.85 / (peak || 1);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(N * 2, 40);
  for (let i = 0; i < N; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out[i] * k * 32767))), 44 + i * 2);
  return buf;
}
