# Hội chợ online – Mini game cho Zalo Mini App của phường

Hội chợ 3D có 3 gian trò chơi tuyên truyền, Bảng vàng chung để treo thưởng theo đợt, người chơi trong cùng khu thấy nhau, chat có kiểm duyệt và trang quản trị cho cán bộ.

| Gian | Trò chơi | Chủ đề |
| --- | --- | --- |
| Gian 1 | Thật hay giả? (vuốt trái/phải) | Phòng chống lừa đảo |
| Gian 2 | Đuổi hình bắt chữ | Địa danh, văn hóa |
| Gian 3 | Đường về an toàn (chạy vô tận 3D) | An toàn giao thông |

## Cấu trúc thư mục

```
hoi-cho-online/
├─ server/            Máy chủ Node.js (KHÔNG cần cài thư viện ngoài)
│  ├─ src/            Đăng nhập, chấm điểm, Bảng vàng, WebSocket, quản trị
│  ├─ content/        Câu hỏi và đợt thưởng (file JSON, cán bộ sửa được)
│  ├─ test/           Kiểm thử tự động
│  └─ .env.example    Mẫu cấu hình
├─ client/            Giao diện (chạy trong Zalo Mini App hoặc trình duyệt)
│  ├─ index.html
│  ├─ www/            Bản build (tạo bằng npm run build, không đưa lên git)
│  └─ src/
│     ├─ main.js, chat.js, ui.js, api.js, platform.js
│     ├─ hub.js       Chọn bản vẽ sảnh: Three.js nếu có WebGL, không thì CSS 3D
│     ├─ hub3d.js     Sảnh hội chợ bằng Three.js
│     ├─ hubCss.js    Sảnh hội chợ bằng CSS 3D (dự phòng)
│     ├─ gfx/         Phát hiện WebGL, mức chất lượng, công cụ Three.js dùng chung
│     └─ games/       swipe.js (Gian 1), rebus.js (Gian 2), runner.js (Gian 3:
│                     mô phỏng) + runner3d.js / runnerCss.js (Gian 3: phần vẽ)
├─ shared/            Code dùng chung cho cả máy chủ và giao diện
│  ├─ runnerSim.js    Mô phỏng Gian 3 (máy chủ chạy lại để chấm điểm)
│  └─ chatFilter.js   Bộ lọc chat
├─ admin/index.html   Trang quản trị
└─ .vscode/           Lệnh chạy sẵn cho Visual Studio Code
```

## Chạy thử trên máy tính (Windows, Visual Studio Code)

**Cần có:** Node.js bản 22.13 trở lên (tải tại https://nodejs.org, chọn bản LTS) và Visual Studio Code.

1. Giải nén file zip, mở Visual Studio Code, chọn **File → Open Folder…** và chọn thư mục `hoi-cho-online`.
2. Trong thư mục `server`, sao chép file `.env.example` thành `.env`. Để nguyên `DEV_LOGIN=1` và đặt một mã bất kỳ cho `ADMIN_KEY`, ví dụ `ADMIN_KEY=matkhau123`.
3. Mở Terminal (**Terminal → New Terminal**) rồi chạy:
   ```
   cd server
   npm start
   ```
   Không cần `npm install`: máy chủ chỉ dùng thư viện có sẵn của Node.js.
   Cách khác: **Terminal → Run Task… → Chạy máy chủ Hội chợ online**.
4. Mở trình duyệt:
   - Trò chơi: http://localhost:8787
   - Quản trị: http://localhost:8787/admin (đăng nhập bằng `ADMIN_KEY`)

### Đồ họa 3D (Three.js)

Sảnh hội chợ và Gian 3 vẽ bằng Three.js (ánh sáng, bóng đổ, gian hàng, nhân vật). Phần này cần build giao diện một lần:

```
cd client
npm install
npm run build
```

Lệnh build tạo thư mục `client/www`. Máy chủ thấy thư mục này thì tự phục vụ bản build (dòng `Giao diện:` khi khởi động sẽ báo). Sửa giao diện xong thì build lại.
Chưa build vẫn chơi được: máy chủ phục vụ thẳng mã nguồn, sảnh và Gian 3 tự dùng bản CSS 3D.

**Sửa giao diện cho nhanh:** chạy máy chủ như trên, mở thêm một Terminal, `cd client` rồi `npm run dev`, mở http://localhost:3000. Trang tự tải lại khi sửa file; API và chat được chuyển tiếp sang máy chủ ở cổng 8787.

**Máy yếu và máy không có WebGL:**
- Mức chất lượng (0 thấp, 1 vừa, 2 cao) tự chọn theo cấu hình máy. Nếu khung hình xuống dưới 40 hình/giây, trò chơi tự hạ một mức (giảm độ nét, tắt bóng đổ) và nhớ cho lần sau.
- Thử một mức cố định: thêm `?q=0`, `?q=1` hoặc `?q=2` vào địa chỉ.
- Máy không có WebGL tự dùng bản CSS 3D. Thử bản này trên máy tính: thêm `?gfx=css` vào địa chỉ.

**Thử nhiều người chơi:** mở thêm một cửa sổ ẩn danh (Ctrl+Shift+N), vào cùng một khu sẽ thấy nhau đi lại và chat với nhau.

**Thử trên điện thoại:** điện thoại và máy tính dùng chung wifi. Trên máy tính chạy `ipconfig` để xem địa chỉ IPv4 (ví dụ 192.168.1.10), rồi mở `http://192.168.1.10:8787` trên điện thoại. Lần đầu Windows có thể hỏi cho phép Node.js qua tường lửa, chọn cho phép với mạng riêng.

**Kiểm thử tự động:** trong thư mục `server` chạy `npm test` (8 nhóm kiểm thử: chấm điểm 3 gian, chống gian lận, Bảng vàng, chat, quản trị).

## Cơ chế chống gian lận (quan trọng khi treo thưởng)

- **Gian 1, Gian 2:** đáp án chỉ nằm trên máy chủ. Điện thoại gửi lựa chọn, máy chủ chấm và tính giờ theo đồng hồ của máy chủ.
- **Gian 3:** điện thoại chỉ gửi mã lượt chơi (seed) và chuỗi thao tác đổi làn. Máy chủ chạy lại mô phỏng `shared/runnerSim.js` để tự tính điểm, và từ chối nếu thời gian chơi khai báo dài hơn thời gian thực.
- Mỗi tài khoản Zalo là một người chơi. Bảng vàng tính điểm cao nhất của mỗi gian, bằng điểm thì ai đạt trước xếp trên.
- Lượt chơi ngoài thời gian đợt thưởng vẫn chơi được nhưng không tính điểm.

## Chat và an toàn

- Máy chủ chặn tin có số điện thoại, số tài khoản, đường link, từ khóa OTP, chuyển khoản, nạp tiền, mật khẩu. Từ thô tục bị thay bằng `***`.
- Mỗi tin tối đa 80 ký tự, cách nhau ít nhất 3 giây.
- Người chơi báo cáo được tin nhắn. Tin có từ 3 báo cáo tự động ẩn. Cán bộ xử lý trong trang quản trị (bỏ qua, ẩn tin, khóa chat).
- Bộ lọc tự động không bắt được mọi cách viết lách, nên cần người trực xử lý báo cáo trong giờ cao điểm.

## Sửa nội dung câu hỏi và đợt thưởng

- `server/content/cards.json`: thẻ tin nhắn của Gian 1 (`scam: true` là lừa đảo).
- `server/content/rebus.json`: câu đuổi hình bắt chữ của Gian 2. **Hiện là câu mẫu toàn quốc, cần thay bằng địa danh của phường.**
- Sửa nội dung xong, vào trang quản trị bấm **Nạp lại nội dung**.
- Đợt thưởng (tên, thời gian, giải, thể lệ) sửa trong trang quản trị. **Đổi mã đợt** sẽ bắt đầu một Bảng vàng mới.
- Danh sách trúng giải: trang quản trị → **Tải file CSV**.

## Đưa lên Zalo Mini App

Giao diện viết bằng JavaScript thuần (ES modules), kết nối Zalo qua `zmp-sdk` trong `client/src/platform.js`. Khi mở ngoài Zalo, trò chơi tự chuyển sang chế độ chạy thử.

### Cách 1 (khuyên dùng): tích hợp vào Mini App hiện có của phường

Đơn vị đang làm Mini App đưa `client/src`, `client/index.html` (phần giao diện) và `shared/` vào dự án hiện có thành một trang/mục "Hội chợ online", gắn một nút ở trang chủ. Nếu Mini App viết bằng React, có thể bọc toàn bộ giao diện này trong một component và gọi khởi động khi mở trang.

### Cách 2: đóng gói thành Mini App riêng

Trong thư mục `client`:
```
npm install
copy .env.example .env      (rồi điền VITE_API_BASE=https://ten-mien-may-chu)
npm run build               (kết quả nằm trong client/www)
```
Sau đó đăng nhập và triển khai bằng Zalo Mini App CLI hoặc tiện ích Zalo Mini App trong VS Code theo hướng dẫn hiện hành tại https://miniapp.zaloplatforms.com/documents/. Cấu hình ứng dụng nằm trong `client/app-config.json`.

### Triển khai máy chủ thật

- Thuê máy chủ (VPS hoặc dịch vụ đám mây) có Node.js 22.13+, chạy `npm start` trong thư mục `server` bằng trình quản lý tiến trình (ví dụ PM2 hoặc dịch vụ Windows).
- Đặt Nginx hoặc Caddy phía trước để có **HTTPS**, nhớ bật chuyển tiếp **WebSocket** cho đường dẫn `/ws`.
- File `server/.env` khi chạy thật:
  - `DEV_LOGIN=0` (bắt buộc)
  - `SESSION_SECRET=` chuỗi ngẫu nhiên dài
  - `ZALO_APP_SECRET=` App Secret của Mini App
  - `ADMIN_KEY=` mật khẩu mạnh
  - `CORS_ORIGIN=` tên miền của Mini App
- Khai báo tên miền máy chủ trong phần cấu hình tên miền của Mini App trên trang quản lý của Zalo.
- Sao lưu định kỳ file dữ liệu `server/data/hoicho.db`.

## Việc cần làm trước khi chạy thật

- [ ] **Xác nhận cách xác thực người dùng Zalo:** hàm `verifyZalo` trong `server/src/auth.js` gọi `graph.zalo.me/v2.0/me` kèm `appsecret_proof`. Cần đối chiếu với tài liệu Zalo hiện hành và thử bằng tài khoản thật.
- [ ] Thay câu hỏi Gian 2 bằng địa danh của phường, bộ phận chuyên môn duyệt nội dung cả 3 gian.
- [ ] Thay tên phường trong `client/src/config.js` (`PLACE_NAME`).
- [ ] Thay hình emoji bằng đồ họa riêng nếu có họa sĩ.
- [ ] Nội quy chat hiển thị khi mở lần đầu và người trực xử lý báo cáo.
- [ ] Thông báo cách thu thập, sử dụng dữ liệu người chơi (chỉ lưu mã người dùng Zalo, biệt danh, điểm, tin nhắn chat).
- [ ] Thử tải với số người chơi dự kiến trên vài điện thoại Android cấu hình thấp.

## Giới hạn hiện tại

- Dữ liệu lưu bằng SQLite trên một máy chủ, phù hợp quy mô một phường. Nếu mở rộng lớn (nhiều máy chủ chạy song song), chuyển sang PostgreSQL và dùng Redis cho phần thời gian thực.
- Đồ họa 3D dựng bằng CSS 3D để nhẹ và không phụ thuộc thư viện. Muốn mô hình 3D đẹp hơn thì làm lại phần sảnh bằng Three.js hoặc Babylon.js, giữ nguyên máy chủ.
