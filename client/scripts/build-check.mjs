// Kiểm tra giao diện có cần cài thư viện hoặc build lại không (chay-thu.cmd gọi trước khi chạy máy chủ).
// So "dấu vân tay" (mã băm nội dung) của mã nguồn với lần build trước, không dựa vào ngày giờ file
// vì giải nén hay git pull có thể làm sai ngày giờ.
//
//   node scripts/build-check.mjs              thoát mã 0: không cần làm gì
//                                             thoát mã 1: cần build lại (npm run build)
//                                             thoát mã 2: cần cài thư viện (npm install) rồi build
//   node scripts/build-check.mjs --write      ghi dấu vân tay mã nguồn vào www/.build-stamp (sau khi build)
//   node scripts/build-check.mjs --installed  ghi dấu vân tay package-lock.json vào node_modules (sau khi cài)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const CLIENT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(CLIENT, "..");
const INPUTS = [join(CLIENT, "src"), join(CLIENT, "public"), join(CLIENT, "index.html"), join(CLIENT, "vite.config.js"), join(CLIENT, "package.json"), join(CLIENT, "package-lock.json"), join(CLIENT, ".env"), join(ROOT, "shared")];
const STAMP = join(CLIENT, "www", ".build-stamp");
const LOCK_STAMP = join(CLIENT, "node_modules", ".hoicho-lock");

function files(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return [p];
  return readdirSync(p, { recursive: true }).map(f => join(p, String(f))).filter(f => statSync(f).isFile());
}
function hashOf(paths) {
  const h = createHash("sha1");
  for (const f of paths.flatMap(files).sort()) {
    h.update(relative(ROOT, f).split(sep).join("/")); h.update("\0");
    h.update(readFileSync(f)); h.update("\0");
  }
  return h.digest("hex");
}
const lockHash = () => hashOf([join(CLIENT, "package-lock.json")]);
const read = f => (existsSync(f) ? readFileSync(f, "utf8").trim() : "");

const arg = process.argv[2];
if (arg === "--write") { writeFileSync(STAMP, hashOf(INPUTS) + "\n"); process.exit(0); }
if (arg === "--installed") { writeFileSync(LOCK_STAMP, lockHash() + "\n"); process.exit(0); }

// Bản build khớp mã nguồn (kể cả package-lock.json) thì không cần làm gì, dù chưa cài thư viện (ví dụ bản zip đã build sẵn).
const built = existsSync(join(CLIENT, "www", "index.html"));
if (built && read(STAMP) === hashOf(INPUTS)) process.exit(0);
console.log(built ? "Ma giao dien da thay doi so voi lan build truoc." : "Chua co ban build giao dien.");
// Cần build: kiểm tra thư viện đã cài và đúng với package-lock.json chưa
const hasDeps = ["three", "vite"].every(m => existsSync(join(CLIENT, "node_modules", m, "package.json")));
if (!hasDeps || read(LOCK_STAMP) !== lockHash()) { console.log("Can cai thu vien giao dien (npm install)."); process.exit(2); }
process.exit(1);
