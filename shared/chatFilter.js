// Bộ lọc chat dùng chung cho máy chủ (bắt buộc) và giao diện (báo lỗi sớm cho người dùng).
// Máy chủ luôn lọc lại, không tin kết quả lọc ở phía điện thoại.

export const CHAT_MAX = 80;
export const CHAT_GAP_MS = 3000;

const BAD_WORDS = ["đm", "dm", "đmm", "dmm", "vcl", "vkl", "vl", "clm", "đéo", "địt", "lồn", "buồi", "đĩ", "cặc"];
const BAD_PHRASES = ["óc chó"];

/** Trả về lý do chặn (chuỗi) hoặc null nếu tin nhắn được phép gửi. */
export function blockReason(text) {
  const low = String(text || "").toLowerCase();
  const digits = low.replace(/[\s.\-_,]/g, "");
  if (/\d{8,}/.test(digits)) return "số điện thoại hoặc số tài khoản";
  if (/(https?:\/\/|www\.|\.(com|vn|net|org|me|link|vip|xyz|io|info|top|site|online)(\/|\b))/.test(low)) return "đường link";
  if (/(\bstk\b|\botp\b|chuyển khoản|chuyen khoan|số tài khoản|so tai khoan|nạp tiền|nap tien|mật khẩu|mat khau)/.test(low)) {
    return "nội dung liên quan đến tiền, tài khoản hoặc mã OTP";
  }
  return null;
}

/** Thay từ thô tục bằng dấu sao, giữ nguyên phần còn lại. */
export function cleanText(text) {
  let out = String(text || "").split(/(\s+)/).map(w => {
    const k = w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    return BAD_WORDS.includes(k) ? "*".repeat(Math.max(3, k.length)) : w;
  }).join("");
  for (const p of BAD_PHRASES) out = out.replace(new RegExp(p, "gi"), "***");
  return out;
}

/** Chuẩn hóa: bỏ ký tự điều khiển, gộp khoảng trắng, cắt độ dài. */
export function normalize(text) {
  return String(text || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
}

export const NAME_MIN = 2, NAME_MAX = 16;
const NAME_RESERVED = ["admin", "quản trị", "quan tri", "công an", "cong an", "ubnd", "cán bộ", "can bo", "ban tổ chức", "ban to chuc", "zalo", "moderator", "hệ thống", "he thong"];
/** Lý do không nhận tên người chơi xin đặt (chuỗi), hoặc null nếu được gửi duyệt. */
export function nameReason(name) {
  const n = String(name || "").replace(/\s+/g, " ").trim();
  if (n.length < NAME_MIN) return "Tên cần ít nhất " + NAME_MIN + " ký tự";
  if (n.length > NAME_MAX) return "Tên tối đa " + NAME_MAX + " ký tự";
  if (!/^[\p{L}\p{M}0-9 ]+$/u.test(n)) return "Tên chỉ gồm chữ cái, chữ số và dấu cách";
  if ((n.match(/\d/g) || []).length > 4) return "Tên có quá nhiều chữ số";
  if (blockReason(n)) return "Tên không được chứa " + blockReason(n);
  if (cleanText(n) !== n) return "Tên có từ ngữ không phù hợp";
  const low = n.toLowerCase();
  if (NAME_RESERVED.some(w => low.includes(w))) return "Tên không được giống tên cơ quan, cán bộ hoặc quản trị viên";
  return null;
}
/** Gọn tên: gộp khoảng trắng. */
export const tidyName = name => String(name || "").replace(/\s+/g, " ").trim();
