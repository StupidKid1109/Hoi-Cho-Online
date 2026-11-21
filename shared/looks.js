// Trang phục người chơi tự chọn ở màn hình mở đầu: kiểu mũ và màu áo. Dùng chung cho máy chủ (kiểm tra) và giao diện (vẽ).
// Mã trang phục gửi qua mạng: "<mũ>-<màu>", ví dụ "cap-do".
export const HATS = [
  ["cap", "🧢", "Mũ lưỡi trai"],
  ["nonla", "👒", "Nón lá"],
  ["beanie", "🧶", "Mũ len"],
  ["none", "🙂", "Không đội"]
];
export const SHIRTS = [
  ["do", "#d62839", "Đỏ"], ["cam", "#f77f00", "Cam"], ["vang", "#f2b705", "Vàng"], ["xanhla", "#2a9d8f", "Xanh lá"],
  ["xanhduong", "#3a86ff", "Xanh dương"], ["tim", "#8338ec", "Tím"], ["hong", "#ef476f", "Hồng"], ["den", "#2b2d42", "Đen"]
];
export const DEFAULT_LOOK = "cap-do";
const HAT_SET = new Set(HATS.map(h => h[0])), SHIRT_OF = Object.fromEntries(SHIRTS.map(s => [s[0], s[1]]));
/** Mã trang phục hợp lệ không. */
export function isLook(lk) { const [h, c] = String(lk || "").split("-"); return HAT_SET.has(h) && !!SHIRT_OF[c] && String(lk).split("-").length === 2; }
/** Tách mã trang phục: { hat, color, key }; mã sai thì về mặc định. */
export function parseLook(lk) { const [h, c] = String(isLook(lk) ? lk : DEFAULT_LOOK).split("-"); return { hat: h, key: c, color: SHIRT_OF[c] }; }
