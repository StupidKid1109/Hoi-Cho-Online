# Hội chợ online – Mini game cho Zalo Mini App của phường

Hội chợ 3D có 3 gian trò chơi tuyên truyền, Bảng vàng chung để treo thưởng theo đợt, người chơi trong cùng khu thấy nhau, chat có kiểm duyệt và trang quản trị cho cán bộ.

| Gian | Trò chơi | Chủ đề |
| --- | --- | --- |
| Gian 1 | Thật hay giả? (vuốt trái/phải) · **đấu phòng 20–50 người** | Phòng chống lừa đảo |
| Gian 2 | Đuổi hình bắt chữ · **đấu phòng 20–50 người** | Địa danh, văn hóa |
| Gian 3 | Đường về an toàn (chạy vô tận 3D: đổi làn, nhảy, cúi) | An toàn giao thông |

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

**Lấy mã từ GitHub về:** thư mục `client/www` không đưa lên GitHub, nên bản clone chưa có đồ họa Three.js cho tới khi build. Cách dễ nhất trên Windows là bấm đúp `chay-thu.cmd`. Mỗi lần chạy, file này so mã giao diện với lần build trước (bằng `client/scripts/build-check.mjs`, so theo nội dung chứ không theo ngày giờ file):
- mã chưa đổi: mở ngay;
- mã đã đổi (ví dụ sau khi `git pull` hoặc tự sửa trong `client/src`): tự build lại;
- `package-lock.json` đổi hoặc chưa cài thư viện: tự chạy `npm install` rồi build (cần mạng, khoảng 1 phút).

Lệnh build tạo thư mục `client/www`. Máy chủ thấy thư mục này thì tự phục vụ bản build (dòng `Giao diện:` khi khởi động sẽ báo). Sửa giao diện xong thì build lại.
Chưa build vẫn chơi được: máy chủ phục vụ thẳng mã nguồn, sảnh và Gian 3 tự dùng bản CSS 3D.

**Sửa giao diện cho nhanh:** chạy máy chủ như trên, mở thêm một Terminal, `cd client` rồi `npm run dev`, mở http://localhost:3000. Trang tự tải lại khi sửa file; API và chat được chuyển tiếp sang máy chủ ở cổng 8787.

**Mô hình 3D có sẵn:** quầy hàng, xe đẩy, ghế, cờ, đèn đường lấy từ bộ *Fantasy Town Kit* của Kenney (www.kenney.nl), giấy phép CC0: được dùng cả cho mục đích thương mại, không bắt buộc ghi nguồn. File nằm ở `client/public/models/kenney` (kèm `License.txt`, khoảng 280 KB). Nếu không tải được mô hình, sảnh tự dùng gian hàng tự dựng. Thêm `?kit=0` vào địa chỉ để xem bản tự dựng.

**Máy yếu và máy không có WebGL:**
- Mức chất lượng (0 thấp, 1 vừa, 2 cao) tự chọn theo cấu hình máy. Nếu khung hình xuống dưới 40 hình/giây, trò chơi tự hạ một mức (giảm độ nét, tắt bóng đổ) và nhớ cho lần sau.
- Thử một mức cố định: thêm `?q=0`, `?q=1` hoặc `?q=2` vào địa chỉ.
- Máy không có WebGL tự dùng bản CSS 3D. Thử bản này trên máy tính: thêm `?gfx=css` vào địa chỉ.

**Thử nhiều người chơi:** mở thêm một cửa sổ ẩn danh (Ctrl+Shift+N), vào cùng một khu sẽ thấy nhau đi lại và chat với nhau.

**Người chơi ảo (thử khi đông người):** khi máy chủ đang chạy ở chế độ thử (`chay-thu.cmd`), bấm đúp `nguoi-ao.cmd` để 60 người ảo vào khu 1: họ đi dạo quanh sân, ghé gian hàng, tìm ghế trống ngồi rồi đứng dậy, thỉnh thoảng chào và chat; mình nhắn có chữ "chào" thì có người chào lại. Đóng cửa sổ để họ rời khu. Đổi số người, khu: sửa dòng `set SO=60`, `set KHU=1` trong `nguoi-ao.cmd`, hoặc chạy `node tools/bots.mjs 80 2` trong thư mục `server`. Chỉ dùng được khi `DEV_LOGIN=1`.

**Thử trên điện thoại:** điện thoại và máy tính dùng chung wifi. Trên máy tính chạy `ipconfig` để xem địa chỉ IPv4 (ví dụ 192.168.1.10), rồi mở `http://192.168.1.10:8787` trên điện thoại. Lần đầu Windows có thể hỏi cho phép Node.js qua tường lửa, chọn cho phép với mạng riêng.

**Kiểm thử tự động:** trong thư mục `server` chạy `npm test` (9 nhóm kiểm thử: chấm điểm 3 gian, chống gian lận, Bảng vàng, chat, chỗ ngồi, quản trị).

## Khu hội chợ

- Cổng chào ở phía nam. Ba gian ở ba phía còn lại, mặt quay vào giữa: Gian 1 phía tây, Gian 2 phía bắc, Gian 3 phía đông. Bảng vàng ở góc tây nam, Gian 4 và 5 (sắp mở) ở hai góc phía bắc.
- Giữa là sân trống để trò chuyện, có **80 chỗ ngồi**: 16 ghế băng (mỗi ghế 3 chỗ) quay vào giữa và 8 bàn tròn (mỗi bàn 4 ghế đẩu). Sân rộng 7200×7200 (gấp 3 lần mỗi chiều so với bản đầu), có đèn lồng dọc các lối đi. Đi lại gần một ghế trống thì chỗ ngồi sáng viền vàng và hiện nút **🪑 Ngồi** ngay trên ghế (trên máy tính nhấn phím **E**); bấm là nhân vật ngồi vào đúng chỗ đó. Khi đang ngồi, trên đầu hiện nút **🚶 Đứng dậy** (hoặc nhấn E). Cũng có thể chạm thẳng vào ghế, hoặc bấm nút **🪑 Ngồi** ở dưới để đi tới ghế trống gần nhất; đi tiếp thì tự đứng dậy. Người khác trong khu thấy mình ngồi; mỗi ghế chỉ một người.
- Bố cục nằm trong `shared/world.js`, dùng chung cho máy chủ và giao diện.

## Gian 1, Gian 2: đấu phòng 20–50 người

- Trước thềm mỗi gian trên sảnh có nút **🚪 Vào phòng chờ** (Gian 3: **▶ Vào chơi**), hiện luôn số người đang chờ; đứng gần thì nút to lên, máy tính bấm phím E.
- Mỗi gian là **một không gian 3D riêng**: bấm nút vào (hoặc bấm vào gian) trên sảnh thì máy quay phóng tới rồi bước vào phòng của gian đó (Gian 1 tông đỏ, Gian 2 tông xanh lá, Gian 3 mặt đường). Trong phòng thấy những người đang chờ cùng mình, đi lại (chạm sàn hoặc W A S D), bấm Chào hoặc Vỗ tay. Màn hình lớn trên tường báo số người và đếm ngược. Nút 📜 Luật chơi (lần đầu vào tự hiện), 🚪 Ra hội chợ.
- Đủ **20 người** thì đếm ngược 15 giây để người khác kịp vào; đủ **50 người** thì đóng phòng và bắt đầu sau 3 giây, người đến sau vào phòng chờ mới. Ván bắt đầu thì chuyển sang màn hình chơi; "Chơi lại" đưa về phòng chờ của gian.
- Gian 3 chơi một mình: phòng riêng có nút **🛵 Bắt đầu chạy**.
- Máy không có WebGL: dùng thẻ luật chơi và phòng chờ 2D như cũ.
- **Gian 1:** cả phòng cùng xem 10 tin nhắn, mỗi tin 10 giây chọn Lừa đảo hay An toàn. Đúng được 500 điểm cộng tối đa 500 điểm theo tốc độ, đúng liên tiếp thưởng thêm. Sau mỗi tin: đáp án, giải thích, tỉ lệ cả phòng chọn, 3 người dẫn đầu.
- **Gian 2:** cả phòng cùng đoán 5 câu, mỗi câu 30 giây. Đúng được 300 điểm cộng tối đa 700 điểm theo tốc độ; ai đúng nhất, nhì, ba được thêm 200, 100, 50; mỗi gợi ý trừ 100.
- Cuối ván: xếp hạng trong phòng; điểm vẫn tính vào Bảng vàng (điểm cao nhất của mỗi gian). Rời giữa ván vẫn giữ số điểm đã có.
- Máy chủ ghép phòng, gửi đề, giữ đáp án, tính giờ và chấm điểm (`server/src/match.js`); hai gian này không chơi một mình được. Số người đổi bằng `MATCH_MIN`, `MATCH_MAX`, thời gian đếm ngược `MATCH_COUNTDOWN` (mili giây) trong `server/.env`.
- Thử khi chưa đủ người thật: bấm đúp `nguoi-ao.cmd` (khoảng 80% người ảo vào phòng đấu và chơi).




## Góc nhìn và điều khiển ở sảnh

- Mặc định **góc nhìn thứ ba sát sau vai** nhân vật; nút **🎥 / 👁️** ở góc phải (máy tính: phím **V**) đổi sang **góc nhìn thứ nhất** (nhìn bằng mắt nhân vật). Lựa chọn được nhớ cho lần sau.
- Điện thoại: **cần điều khiển** góc dưới bên phải để đi, **kéo màn hình** để nhìn quanh (cả trái phải và lên xuống), chạm mặt đất để đi tới đó.
- Máy tính: **W A S D** để đi, giữ **Shift** để chạy, giữ chuột trái và kéo để nhìn, nhấp lên sàn để đi tới.
- Trong phòng chờ và quán cà phê cũng dùng cùng góc nhìn và cách điều khiển này. Trong quán, **chạm vào ghế** (hoặc lại gần rồi bấm **🪑 Ngồi**, máy tính phím **E**) để ngồi; mỗi ghế một người, đi đi là tự đứng dậy.

## Chat trong phòng chờ và quán cà phê có nhạc

- Trong phòng chờ Gian 1, Gian 2 bấm **💬 Chat** để nhắn cho cả phòng: tin hiện thành bong bóng trên đầu nhân vật và trong khung chat góc trái. Dùng chung bộ lọc với chat ở sảnh (chặn số điện thoại, link, mã OTP, che từ tục, chống gửi liên tục).
- **Quán cà phê** ở góc tây bắc sân (nút **☕ Cà phê** ở thanh dưới, hoặc nút **☕ Vào quán** trước quán): bước vào là tới không gian riêng của quán, thấy những người đang ngồi quán (trong quán không hiện tên trên đầu, chỉ hiện bong bóng chat), đi lại, chào, chat.
- **Nhân vật của mình** là mô hình 3D “Steve” của **Quaternius** (giấy phép CC0, `client/public/models/nhan-vat/`), có sẵn hoạt ảnh đi, chạy, vẫy tay; ngồi ghế được. Người chơi khác vẫn hiện bằng nhân vật cũ.
- **Nội thất quán**: phòng rộng (khoảng 17 × 26 m, gấp khoảng 4 lần phòng chờ; bàn ghế đặt thưa, chừa khoảng trống trước màn chiếu), dùng mô hình 3D [“Low Poly Restaurant Interior Scene”](https://sketchfab.com/3d-models/low-poly-restaurant-interior-scene-ce81c3ee5c45471ea75fb6222fd64f9e) của **MarkoJantti** trên Sketchfab, giấy phép **CC BY 4.0** (đã tách bàn ghế ra để sắp xếp lại và kéo rộng phòng; được dùng, sửa, kể cả mục đích thương mại, miễn là ghi công tác giả; ghi công đã có trong bảng giới thiệu của quán và trong `client/public/models/cafe/GIAY-PHEP.txt`, **không xoá**). 39 ghế trong quán đều ngồi được, không đi xuyên bàn, cột, quầy; màn chiếu video dán trên bức tường gỗ dài.
- **Nhạc trong quán do quản trị viên bật**: vào `/admin` → mục *☕ Nhạc quán cà phê*: tải bài lên (mp3, m4a, ogg, wav, tối đa 40 MB), bấm **▶ Phát** hoặc **⏹ Tắt nhạc**, chỉnh âm lượng, lặp lại. Cả quán nghe cùng một đoạn; người vào sau nghe tiếp đúng đoạn đang phát. Có sẵn một bài nhạc mẫu không lời để thử. Người chơi tắt/bật tiếng bằng nút loa góc trên. Điện thoại chặn tự phát có tiếng thì nhạc vẫn chạy không tiếng, chạm màn hình lần đầu là có tiếng. Chỉ dùng nhạc được phép phát công khai.
- **Phát video YouTube**: cùng mục đó, dán link YouTube rồi bấm **Thêm**, sau đó **▶ Phát**. Video phát bằng trình phát nhúng chính thức của YouTube, **chiếu trên màn hình lớn trên tường quán** (cả quán xem cùng một đoạn; người chơi không bấm dừng hay phát được, chỉ tắt tiếng riêng và bấm **⛶** để xem to; máy không có 3D thì hiện khung nhỏ góc phải); không tải nhạc từ YouTube về máy chủ vì YouTube không cho phép. Video bị chủ kênh chặn nhúng thì không phát được; có thể có quảng cáo. Người chơi bấm 📺 để ẩn video (khi ẩn thì dừng phát cho riêng mình). Khi đưa lên Zalo Mini App cần khai báo thêm tên miền `www.youtube.com` trong danh sách tên miền được phép của Mini App.

## Nhạc nền game

- Nhạc nền phát ở sảnh, phòng chờ và các gian (vào quán cà phê thì tắt để nghe nhạc của quán, ra khỏi quán thì phát lại).
- Quản trị viên chọn bài ở `/admin` → mục **🎶 Nhạc nền game**: tích chọn một hay nhiều bài (phát lần lượt như playlist, có **Trộn bài**), chỉnh âm lượng, bật/tắt, bấm **Lưu nhạc nền**.
- Thêm bài: tải file lên, hoặc dán **link tải trực tiếp** rồi bấm **Tải từ link** (ví dụ YouTube Studio → Thư viện âm thanh → chuột phải nút Tải xuống → Sao chép địa chỉ liên kết). Link video YouTube thông thường không dùng được. Mặc định là bài nhạc mẫu không lời. Chỉ dùng nhạc được phép phát công khai.
- Điện thoại chặn tự phát có tiếng thì nhạc vẫn chạy không tiếng, chạm màn hình lần đầu là có tiếng.

## Chơi thử trên điện thoại (cùng Wi-Fi)

1. Bấm đúp `chay-thu.cmd` trên máy tính. Lần đầu Windows hỏi tường lửa cho Node.js: tick **Private networks** rồi bấm **Allow access**.
2. Cửa sổ máy chủ in dòng "Điện thoại … mở một trong các địa chỉ", ví dụ `http://192.168.1.15:8787/`.
3. Điện thoại bắt **cùng Wi-Fi** với máy tính, mở Chrome và gõ đúng địa chỉ đó.

Không vào được: kiểm tra mạng Wi-Fi trên máy tính đang để chế độ **Private** (Cài đặt → Mạng → Wi-Fi → Thuộc tính), tắt chế độ "cách ly thiết bị" (AP isolation, hay gặp ở Wi-Fi khách, quán cà phê), hoặc dùng điểm phát Wi-Fi từ chính điện thoại cho máy tính bắt vào.

## Gian 3: vượt chướng ngại vật

- Điện thoại: vuốt trái, phải (hoặc chạm hai bên xe) để đổi làn, **vuốt lên để nhảy**, **vuốt xuống để cúi**. Máy tính: A, D (hoặc mũi tên trái, phải) đổi làn, **W nhảy**, **S cúi**. Đang nhảy mà cúi thì rơi nhanh xuống.
- Ba loại vật cản: **rào thấp nhảy qua được** (két bia, rào thi công, biển có ⬆), **biển treo cúi qua được** (cấm ngược chiều, cờ đua, biển có ⬇), **vật cao phải đổi làn** (cột đèn đỏ, điện thoại). Từ giây 14 có hàng chắn kín 3 làn, luôn chừa một vật nhảy hoặc cúi qua được.
- Luật nằm trong `shared/runnerSim.js` (máy chủ chạy lại đúng file này để chấm điểm). Thao tác gửi lên: `[khung hình, d]` với d = -1/1 đổi làn, 2 nhảy, -2 cúi.

## Sức chịu tải (100 người cùng lúc)

- Mỗi khu chứa tối đa **100 người** (`KHU_CAPACITY`), có 8 khu (`KHU_COUNT`), tổng cộng 800 người.
- Vị trí người chơi được máy chủ **gom lại và gửi theo nhịp 0,1 giây** (một gói cho cả khu), thay vì chuyển từng bước đi. Người mạng chậm được bỏ qua gói vị trí khi đang dồn ứ, dồn quá 4 MB thì ngắt để kết nối lại.
- Trên điện thoại: khu đông chỉ hiện tên 12 người gần nhất (người xa đang chat vẫn hiện bong bóng), bóng dưới chân mọi nhân vật gộp thành 1 lần vẽ, nhân vật được dựng dần vài người mỗi khung hình.
- **Thử tải:** trong thư mục `server` chạy `npm run loadtest` (100 người ảo cùng một khu trong 30 giây: đi lại, chat, ngồi ghế, rồi cùng chơi Gian 1). Đổi số người, số giây: `node tools/loadtest.mjs 200 60`.

  Kết quả trên máy thử (1 nhân CPU), 100 người trong một khu:

  | Chỉ số | Trước khi tối ưu | Sau |
  | --- | --- | --- |
  | CPU máy chủ | 22% | 3% |
  | Bộ nhớ máy chủ | 99 MB | 60 MB |
  | Tin mỗi điện thoại nhận/giây | 664 | 14 |
  | Dữ liệu mỗi điện thoại/giây | 31 KB | 10 KB |
  | Độ trễ thấy nhau | 3 ms | khoảng 50 ms (95% dưới 95 ms) |

  Đấu phòng: 100 người vào 2 phòng 50 người cùng chơi Gian 1, máy chủ dùng khoảng 2% CPU. 100 người cùng gọi API: khoảng 1.650 yêu cầu/giây, không lỗi.
- **Khi chạy sau Caddy/Nginx phải đặt `TRUST_PROXY=1`**: nếu không, máy chủ thấy mọi người chung một IP và giới hạn đăng nhập (`AUTH_PER_MIN`, mặc định 120 lần/phút cho mỗi IP) sẽ chặn bớt người vào.
- Theo dõi khi chạy thật: `GET /api/health` trả về số người đang online ở từng khu và bộ nhớ máy chủ.

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
