// Địa chỉ máy chủ (server).
// - Chạy thử trên máy tính: để trống, trang và API cùng một địa chỉ (http://localhost:8787).
// - Trong Zalo Mini App: đặt VITE_API_BASE=https://ten-mien-may-chu trong file client/.env
//   (tên miền này phải được khai báo trong phần cấu hình tên miền của Mini App).
const env = (import.meta && import.meta.env) || {};
export const API_BASE = (env.VITE_API_BASE || "").replace(/\/$/, "");

export const BOOTHS = [
  { id: "g1", c: "#c8102e", tag: "Gian 1", name: "Thật hay giả?", icons: "🕵️📱", topic: "Phòng chống lừa đảo", goods: "Soi tin · bắt lừa",
    desc: "Đọc tin nhắn rồi vuốt trái nếu là lừa đảo, vuốt phải nếu an toàn. 60 giây, đúng liên tiếp được thưởng thêm, sai bị trừ 3 giây." },
  { id: "g2", c: "#0f8a5f", tag: "Gian 2", name: "Đuổi hình bắt chữ", icons: "🖼️🔤", topic: "Văn hóa, địa danh", goods: "Nhìn hình · đoán chữ",
    desc: "Nhìn các hình ghép lại và đoán tên địa danh. Mỗi lượt 5 câu, 40 giây mỗi câu, trả lời càng nhanh càng nhiều điểm." },
  { id: "g3", c: "#2563eb", tag: "Gian 3", name: "Đường về an toàn", icons: "🛵🚦", topic: "An toàn giao thông", goods: "Lái xe · né vi phạm",
    desc: "Lái xe về nhà, đổi làn để né các lỗi vi phạm, nhặt xu, sao và mũ bảo hiểm. Có 3 mạng, chạy càng xa càng nhiều điểm." }
];
export const BOOTH = id => BOOTHS.find(b => b.id === id);
export const PLACE_NAME = "Phường … (tên mẫu)"; // thay bằng tên phường
