// Máy chủ WebSocket tối giản theo RFC 6455, chỉ dùng thư viện có sẵn của Node.
// Hỗ trợ tin nhắn văn bản, ping/pong, đóng kết nối. Giới hạn 16KB mỗi tin.
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_PAYLOAD = 16 * 1024;

export class WsConn extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket; this.buf = Buffer.alloc(0); this.frag = null; this.open = true; this.alive = true;
    socket.setNoDelay(true);
    socket.on("data", d => this._onData(d));
    socket.on("close", () => this._closed());
    socket.on("error", () => this._closed());
  }
  send(text) {
    if (!this.open) return;
    const payload = Buffer.from(text);
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x81, n]);
    else if (n < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(n, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  sendJSON(obj) { this.send(JSON.stringify(obj)); }
  ping() { if (this.open) this.socket.write(Buffer.from([0x89, 0])); }
  close(code = 1000) {
    if (!this.open) return;
    const b = Buffer.alloc(4); b[0] = 0x88; b[1] = 2; b.writeUInt16BE(code, 2);
    try { this.socket.write(b); } catch (e) { /* bỏ qua */ }
    this.socket.end(); this._closed();
  }
  _closed() { if (!this.open) return; this.open = false; this.emit("close"); }
  _onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1], fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const big = this.buf.readBigUInt64BE(2); if (big > BigInt(MAX_PAYLOAD)) return this.close(1009); len = Number(big); off = 10; }
      if (len > MAX_PAYLOAD) return this.close(1009);
      if (!masked) return this.close(1002); // trình duyệt luôn phải che (mask) dữ liệu gửi lên
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4), data = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = this.buf.subarray(off + 4 + len);
      if (op === 0x8) return this.close();
      if (op === 0x9) { const p = Buffer.alloc(2 + data.length); p[0] = 0x8a; p[1] = data.length; data.copy(p, 2); this.socket.write(p); continue; }
      if (op === 0xa) { this.alive = true; continue; }
      if (op === 0x1 || op === 0x0) {
        this.frag = op === 0x1 ? data : Buffer.concat([this.frag || Buffer.alloc(0), data]);
        if (this.frag.length > MAX_PAYLOAD) return this.close(1009);
        if (fin) { const text = this.frag.toString("utf8"); this.frag = null; this.alive = true; this.emit("message", text); }
        continue;
      }
      return this.close(1003);
    }
  }
}

/** Gắn WebSocket vào máy chủ HTTP tại đường dẫn path. */
export function attachWebSocket(server, path, onConnection) {
  const conns = new Set();
  server.on("upgrade", (req, socket) => {
    const url = new URL(req.url, "http://x");
    const key = req.headers["sec-websocket-key"];
    if (url.pathname !== path || !key || String(req.headers.upgrade).toLowerCase() !== "websocket") { socket.destroy(); return; }
    const accept = createHash("sha1").update(key + GUID).digest("base64");
    socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " + accept + "\r\n\r\n");
    const conn = new WsConn(socket);
    conns.add(conn); conn.on("close", () => conns.delete(conn));
    onConnection(conn, url, req);
  });
  // Nhịp tim: ngắt các kết nối không phản hồi.
  const timer = setInterval(() => { for (const c of conns) { if (!c.alive) { c.close(1001); continue; } c.alive = false; c.ping(); } }, 30000);
  timer.unref();
  return { conns, stop: () => { clearInterval(timer); for (const c of conns) c.close(1001); } };
}
