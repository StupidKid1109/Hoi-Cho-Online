# Hội chợ online – ghi chú cho Claude Code

Mini game tuyên truyền cho Zalo Mini App của một UBND phường. Đối tượng chính: học sinh, sinh viên, người lao động. Trả lời người dùng bằng tiếng Việt, xưng "em", gọi người dùng là "anh".

## Dự án hiện có

- `server/`: Node.js thuần, không có thư viện ngoài. Dùng `node:sqlite` nên **cần Node 22.13 trở lên**. Máy anh đang có Node 18.12.1, phải nâng cấp trước (nodejs.org, bản LTS).
  - Đăng nhập Zalo (`src/auth.js`), chấm điểm 3 gian ở máy chủ (`src/games.js`), Bảng vàng theo đợt (`src/store.js`), WebSocket tự viết (`src/ws.js`), khu hội chợ + chat có lọc (`src/realtime.js`), API + trang quản trị (`src/app.js`).
  - Kiểm thử: `cd server && npm test` (9 nhóm, có nhóm chỗ ngồi).
- `client/`: JavaScript (ES modules), build bằng Vite (`npm install`, `npm run build` → `client/www`; `npm run dev` ở cổng 3000, chuyển tiếp `/api`, `/ws` sang 8787). Máy chủ phục vụ `client/www` nếu có, không thì phục vụ mã nguồn (khi đó bản 3D không nạp được và tự dùng CSS 3D).
  - `hub.js`: lớp chọn bản vẽ, giữ nguyên giao diện hàm cho `main.js`. `prepareHub()` (gọi lúc tải) nạp `hub3d.js` (Three.js) nếu có WebGL; lỗi thì dùng `hubCss.js` (CSS 3D cũ).
  - `hub3d.js`: tọa độ thế giới vẫn theo px (sân 1400×1400, 100 px = 1 đơn vị) vì máy chủ dùng hệ này. Nhãn kỷ lục gian hàng và hạng Bảng vàng vẽ trong cảnh, nội dung lấy từ phần tử ẩn `#bb_g1..3`, `#bdTop` mà `main.js` ghi vào.
  - `gfx/models.js`: nạp mô hình Kenney Fantasy Town Kit (CC0) trong `client/public/models/kenney` (quầy hàng, xe đẩy, ghế, cờ, đèn); gốc mô hình được đưa về tâm, vật liệu đổi sang Lambert cho nhẹ; `tint: "blue" | "gray"` để đổi màu bạt. Nạp lỗi hoặc `?kit=0` thì dùng gian tự dựng. `gfx/character.js`: nhân vật (tay chân, mắt chuyển động trong shader).
  - `gfx/webgl.js` (không nạp Three.js): phát hiện WebGL, mức chất lượng (`?q=0|1|2`, `?gfx=css`). `gfx/kit.js`: renderer, tự hạ chất lượng, kết cấu canvas, nhân vật gộp 1 mesh.
  - `games/swipe.js` (Gian 1), `games/rebus.js` (Gian 2), `games/runner.js` (Gian 3: vòng mô phỏng bước cố định + ghi `inputs`), phần vẽ Gian 3 ở `games/runner3d.js` (Three.js) hoặc `games/runnerCss.js`.
  - `platform.js`: kết nối `zmp-sdk` (import động, ngoài Zalo tự chuyển sang chế độ thử).
- `shared/runnerSim.js`: mô phỏng tất định Gian 3, máy chủ chạy lại để chấm điểm. **Không được đổi luật mô phỏng ở một phía mà không đổi phía kia.**
- `shared/world.js`: **bố cục khu hội chợ dùng chung** cho máy chủ, bản Three.js và bản CSS 3D: sân 2400×2400 px, cổng phía nam, 3 gian ở tây/bắc/đông quay vào giữa, Bảng vàng góc tây nam, Gian 4–5 góc bắc, sân trống giữa và 40 chỗ ngồi (`SEATS`: 8 ghế băng × 3, 4 bàn × 4 ghế đẩu). Máy chủ dùng `WORLD`, `SPAWN`, `SEATS` (tin nhắn `sit`/`sitno`, mỗi ghế một người, rời ghế >40 px hoặc thoát thì nhả ghế). Đổi bố cục chỉ sửa file này.
- `shared/chatFilter.js`: bộ lọc chat dùng chung.
- `admin/index.html`: trang quản trị (đợt thưởng, báo cáo chat, xuất CSV trúng giải, nạp lại nội dung).
- `chay-thu.cmd`: chạy máy chủ ở chế độ thử (DEV_LOGIN=1, ADMIN_KEY=hoicho2026) bằng cách bấm đúp.
- Nội dung mẫu: `server/content/*.json`. Gian 2 đang là địa danh toàn quốc, chưa có địa danh của phường.

## Quyết định của anh (18/11/2026)

- Làm **bản hoàn chỉnh** để chạy thật, không phải bản chạy thử.
- Đưa lên Zalo: **chưa rõ** ghép vào Mini App hiện có của phường hay làm Mini App riêng (cần hỏi đơn vị làm app). Làm theo hướng **Mini App riêng** trước, giữ cấu trúc để sau ghép được.
- Hạ tầng (Mini App ID, App Secret, máy chủ, tên miền): chưa xác định. Chuẩn bị gói triển khai dùng được trên VPS bất kỳ.
- Đồ họa: **nâng lên 3D thật bằng Three.js** (ánh sáng, bóng đổ, mô hình gian hàng, nhân vật), "cho đẹp hơn".
- Nội dung: **dùng nội dung mẫu**, cán bộ thay sau.
- Có chat tự do trong khu, đã có bộ lọc số điện thoại, link, OTP, từ tục, chống spam, báo cáo, tự ẩn khi đủ 3 báo cáo.

## Việc cần làm tiếp

1. ~~Nâng Node lên 22+ trên máy, chạy `npm test`~~ (đã kiểm tra trên máy đám mây Node 22: 8/8 đạt). Máy anh vẫn cần Node 22.13+.
2. ~~Nâng đồ họa bằng Three.js~~ (xong 18/11/2026, còn thử trên điện thoại Android thật):
   - Thêm `three` vào `client/package.json`, chuyển `client/` sang build bằng Vite (đã có `vite.config.js`, lệnh `npm run dev`, `npm run build`).
   - Viết lại `client/src/hub.js` bằng Three.js nhưng **giữ nguyên giao diện hàm** mà `main.js` đang gọi: `buildHub(ctx)`, `startHub()`, `zoomOut()`, `goTo(id)`, `addPeer`, `removePeer`, `movePeer`, `renamePeer`, `peerEmote`, `peerSay`, `selfSay`, `hidePeer`, `resetPeers`, `peerCount`, `EMOTES`. Giữ điều khiển: chạm đất để đi, kéo để xoay, W A S D, chạm gian hàng để đi tới và phóng to.
   - Viết lại phần vẽ của `client/src/games/runner.js` bằng Three.js, **giữ nguyên** vòng mô phỏng bước cố định và việc ghi `inputs` gửi máy chủ.
   - Gian 1, Gian 2 giữ dạng thẻ và ô chữ (dễ đọc), chỉ làm đẹp thêm.
   - Tối ưu cho Android cấu hình thấp: giới hạn pixel ratio, bóng đổ có thể tắt, hạ chất lượng tự động khi khung hình thấp; tính năng phải chạy được cả khi không có WebGL (thông báo hoặc quay về bản CSS 3D).
3. Đóng gói Mini App riêng theo chuẩn Zalo hiện hành (tham khảo https://miniapp.zaloplatforms.com/documents/), đặt `VITE_API_BASE` tới máy chủ thật.
4. Gói triển khai máy chủ: Dockerfile, docker-compose, cấu hình Caddy hoặc Nginx (HTTPS, chuyển tiếp WebSocket `/ws`), hướng dẫn sao lưu `server/data/hoicho.db`.
5. **Xác nhận cách xác thực người dùng Zalo** trong `server/src/auth.js` (`graph.zalo.me/v2.0/me` + `appsecret_proof`) với tài liệu Zalo hiện hành và thử bằng tài khoản thật.
6. Khi chạy thật: `DEV_LOGIN=0`, đặt `SESSION_SECRET`, `ZALO_APP_SECRET`, `ADMIN_KEY`, `CORS_ORIGIN` trong `server/.env`.
