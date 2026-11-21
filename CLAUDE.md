# Hội chợ online – ghi chú cho Claude Code

Mini game tuyên truyền cho Zalo Mini App của một UBND phường. Đối tượng chính: học sinh, sinh viên, người lao động. Trả lời người dùng bằng tiếng Việt, xưng "em", gọi người dùng là "anh".

## Dự án hiện có

- `server/`: Node.js thuần, không có thư viện ngoài. Dùng `node:sqlite` nên **cần Node 22.13 trở lên**. Máy anh đang có Node 18.12.1, phải nâng cấp trước (nodejs.org, bản LTS).
  - Đăng nhập Zalo (`src/auth.js`), chấm điểm 3 gian ở máy chủ (`src/games.js`), Bảng vàng theo đợt (`src/store.js`), WebSocket tự viết (`src/ws.js`), khu hội chợ + chat có lọc (`src/realtime.js`), API + trang quản trị (`src/app.js`).
  - Kiểm thử: `cd server && npm test` (24 nhóm: `test/api.test.js` 12 nhóm (chỗ ngồi, đấu phòng, chat phòng chờ, quán cà phê, nhạc) và `test/hacker.test.js` 12 nhóm cho Gian 1 "Ai là Hacker?").
  - **Gian 1 "Ai là Hacker?"** (`src/hacker.js`, thiết kế ở mục riêng bên dưới): hàng chờ ghép ngẫu nhiên, phòng bạn bè mã 6 số, ván 4–8 người, tin `hk:*` qua WebSocket của khu (`realtime.js` chuyển sang), bảng `hacker_games` và `g1_points` (`db.js`), điểm cộng dồn có giới hạn ngày/đợt `store.addG1` (giới hạn `g1DayCap`, `g1EventCap` trong đợt thưởng, sửa ở trang quản trị), `HACKER_SPEED` rút ngắn giờ khi kiểm thử. Gian vuốt thẻ cũ nằm ở `_legacy/`.
  - Đấu phòng Gian 2 (`src/match.js`; Gian 1 chỉ dùng phần không gian đi lại/chat như quán, `social`): phòng chờ theo gian, đủ `MATCH_MIN` (20) đếm ngược `MATCH_COUNTDOWN` (15 s), đủ `MATCH_MAX` (50) đóng phòng và bắt đầu sau 3 s. Tin qua WebSocket của khu: `mjoin/mleave/mguess/mhint/mpos/memote/mchat` → `mlobby/mspace/mpjoin/mpleave/mposes/memote/mchat/msys/cmusic/mstart/mround/mreveal/mguess/mhint/msolved/mend/merr`. Chat trong phòng chờ (`mchat`) dùng chung bộ lọc `shared/chatFilter.js`, không lưu vào cơ sở dữ liệu. Phòng chờ là một không gian riêng `BOOTH_ROOM` (1200×900 px, `shared/world.js`): `mspace` (mình + người đang chờ, có `n`), vị trí gom 100 ms (`mposes`). Mỗi người một run để giới hạn lượt/ngày và ghi Bảng vàng. `POST /api/runs` từ chối g1, g2 (chỉ chơi theo phòng). `GET /api/match`: số người đang chờ. Thử tải: `npm run loadtest` (100 người ảo một khu; đạt: CPU 3%, 14 tin/người/giây, 1.800 yêu cầu/giây không lỗi).
  - **Quán cà phê** (`g: "cafe"`, góc tây bắc, thay chỗ Gian 4): cùng cơ chế không gian của phòng chờ nhưng không bắt đầu ván, tối đa `CAFE_MAX` (50) người một phòng, đầy thì mở phòng mới. Nhạc: `src/music.js`, file ở `server/data/music` (lần đầu tự tạo bài mẫu WAV không lời), quản trị viên tải lên/phát/tắt ở `/admin` (`GET/PUT /api/admin/music`, `POST /api/admin/music/upload?name=`, `POST /api/admin/music/delete`); bài đang phát lưu ở `music/dang-phat.json`. Link YouTube: `POST /api/admin/music/youtube {url}` (lấy tên qua oEmbed, lưu `music/youtube.json`), `PUT /api/admin/music {yt}` để phát; người chơi phát bằng YouTube IFrame Player (không tải nhạc về máy chủ); có phòng 3D thì khung video 640×360 được gắn lên **màn hình lớn trên tường quán** bằng `CSS3DRenderer` (`room.attachScreen`, gắn trước khi tạo trình phát vì chuyển chỗ iframe làm tải lại; lớp CSS 3D nằm **sau** khung vẽ WebGL trong suốt (`createRenderer(q, {alpha})`, quán vẽ nền bằng `setClearColor`), màn hình đổi sang vật liệu "lỗ" `NoBlending` alpha 0 nên video lộ ra và người/đồ vật đứng trước che được video; màn hình quán 16:9 rộng 6,4 × 3,6, video lấp đầy), không có 3D thì khung nhỏ góc phải. Người chơi **không điều khiển được video**: tắt pointer-events trên khung/iframe, bị dừng thì tự phát tiếp đúng đoạn chung; chỉ có nút tắt tiếng riêng và nút **⛶ Xem to** (máy quay đứng trước màn hình, đi lại thì tự thoát, `room.setCinema`). Người trong quán nhận `cmusic {file,yt,title,startedAt,loop,volume,now}`, tự tua tới đúng đoạn; file phát qua `GET /api/music/file/<tên>` (có Range).
  - **Nhạc nền game** (`client/src/bgm.js`): **thư viện riêng, tách hẳn khỏi nhạc quán** (`makeMusic(config, "nhac-nen")` → `server/data/music/nhac-nen`, phát qua `GET /api/bgm/file/<tên>`). Quản trị viên tải file âm thanh lên ở `/admin` mục "Nhạc nền game" (`POST /api/admin/bgm/upload?name=`, `POST /api/admin/bgm/delete`, `GET/PUT /api/admin/bgm {files[], shuffle, on, volume}` — danh sách phát nhiều bài, lưu `music/nhac-nen.json`, mặc định bài mẫu; bản cũ chọn bài của quán thì tự chép sang). **Đã bỏ thêm nhạc bằng link** (YouTube Audio Library…). Gửi cho người chơi trong `GET /api/match` (`bgm`); phát ẩn, lặp lại, ở sảnh/phòng chờ/các gian, tắt khi vào quán cà phê (`bgm.setPlace`). Không dùng YouTube làm nhạc nền.
  - **Âm lượng của người chơi** (`client/src/sound.js`): nút 🔊 "Âm thanh" nổi bên phải (ẩn ở màn hình mở đầu) mở bảng 2 thanh trượt + nút tắt riêng cho "Nhạc nền game" và "Nhạc quán cà phê", nhớ trong `localStorage` `hc_sound`; âm lượng thật = quản trị viên × người chơi (`level(k)`), tắt nhạc nền thì dừng hẳn; nút 🔊 trên thanh nhạc trong quán dùng chung công tắc `cafe`.
  - Chịu tải: vị trí gom theo nhịp 100 ms (`{t:"poses", p:[[n,x,y],...]}`, n = số thứ tự ngắn trong khu, có trong `welcome`/`join`), khung WebSocket đóng gói một lần cho cả khu, người mạng chậm bị bỏ qua gói vị trí (>256 KB) hoặc ngắt (>4 MB). Mỗi khu 100 người. Sau Caddy/Nginx đặt `TRUST_PROXY=1` (giới hạn đăng nhập theo IP thật, `AUTH_PER_MIN` mặc định 120).
- **Màn hình mở đầu: chọn nhân vật Nam/Nữ và tên riêng có duyệt** (20/11/2026). Bảng `players` thêm cột `gender` (`nam`/`nu`), `name_req`, `name_state` (`pending`/`approved`/`rejected`), `name_note`, `name_at`, `name_tries`, `name_day` (`db.js` tự thêm cột cho bản cũ). `POST /api/me/profile {gender?, name?, cancelName?}`; `GET /api/me` trả thêm `gender`, `nameReq {name,state,note}`. Kiểm tra tên ở `shared/chatFilter.js` `nameReason` (2–16 ký tự, chữ/số/dấu cách, chặn số điện thoại, link, từ tục, tên cơ quan/cán bộ/quản trị), không trùng tên người khác (so không phân biệt hoa thường có dấu, hàm SQL `vlow`), 5 lần/ngày. Quản trị: `GET /api/admin/names?state=`, `POST /api/admin/names {id, action: approve|reject|revoke, note}`; duyệt/thu hồi thì `rt.rename` cho cả khu và `rt.tell` tin `name` cho riêng người đó; ở màn hình mở đầu (chưa nối WebSocket) client hỏi lại `/api/me` 8 giây một lần khi tên đang chờ. Giới tính đi kèm `gd` trong `welcome/join` (khu) và `mspace/mpjoin` (phòng chờ), đổi giữa chừng thì tin `look {id, gd}`. Client: `setupProfile()` trong `main.js`, xem trước 3D `gfx/preview.js`, nhân vật của mình `LOOK_OF {nam: "mu-do", nu: "nu-do"}` + `setMyGender` trong `gfx/character.js` (`hub.setGender`), **người khác cũng hiện đúng mô hình nam/nữ đã chọn** (`peerLook(gd)` → `characterGeometry(seed, LOOK_OF[gd], gd)`, chỉ màu da khác theo seed; mình phân biệt bằng vòng vàng dưới chân và chữ "(bạn)"; người chưa chọn thì ngẫu nhiên như cũ; bản CSS 3D dùng biểu tượng 👦/👧; người ảo `bots.mjs` chọn nam/nữ xen kẽ). **Trang phục tự chọn** (21/11/2026): kiểu mũ `cap`/`nonla`/`beanie`/`none` và 8 màu áo (`shared/looks.js`: `HATS`, `SHIRTS`, mã `"mũ-màu"` ví dụ `cap-do`, `isLook`, `parseLook`), cột `players.look`, `POST /api/me/profile {look}`, gửi kèm `lk` cùng `gd` (tin `look {id, gd, lk}`); màu mũ lưỡi trai/mũ len theo màu áo, áo vàng thì sao đỏ; `buildLook(gd, lk)` trong `character.js`, `setMyGender(g, lk)`, `peerLook(gd, lk)`, xem trước `preview.setLook`. Kiểm thử: nhóm "Nhân vật nam/nữ, mũ, màu áo và tên chờ quản trị viên duyệt" trong `test/api.test.js` (tổng 24 nhóm).
- `client/`: JavaScript (ES modules), build bằng Vite (`npm install`, `npm run build` → `client/www`; `npm run dev` ở cổng 3000, chuyển tiếp `/api`, `/ws` sang 8787). Máy chủ phục vụ `client/www` nếu có, không thì phục vụ mã nguồn (khi đó bản 3D không nạp được và tự dùng CSS 3D).
  - `hub.js`: lớp chọn bản vẽ, giữ nguyên giao diện hàm cho `main.js`. `prepareHub()` (gọi lúc tải) nạp `hub3d.js` (Three.js) nếu có WebGL; lỗi thì dùng `hubCss.js` (CSS 3D cũ).
  - `hub3d.js`: tọa độ thế giới theo px của `shared/world.js` (100 px = 1 đơn vị 3D). **Góc nhìn kiểu dichuaonline.site**: mặc định thứ ba sát sau vai (`VIEW`: lùi 4,2, lệch phải 0,55, cao 1,7), nút 🎥/👁️ (`#viewBtn`, phím V) đổi sang thứ nhất (mắt ở 0,98, ẩn nhân vật mình), nhớ trong `localStorage` `hc_view`; kéo màn hình xoay cả trái phải lẫn lên xuống (`lookPitch`); cần điều khiển `#joy` trên màn hình cảm ứng, W A S D trên máy tính, Shift chạy; mở đầu bay từ trên cao xuống (`intro`). `window.__hubView(x, y, yaw, "first"|"third", pitch)` để chụp thử. Đi 500 px/giây; vùng bóng đổ đi theo người chơi (vẽ lại khi đi xa hơn 6 đơn vị). Lại gần ghế trống thì hiện nút "Ngồi" (phím E). Nhãn kỷ lục gian hàng và hạng Bảng vàng vẽ trong cảnh, nội dung lấy từ phần tử ẩn `#bb_g1..3`, `#bdTop` mà `main.js` ghi vào.
  - Gian 1–3 trên sảnh dùng mô hình **quầy chợ đêm** "Night market stall" của alen60303 (Sketchfab, CC BY 4.0, đã nén còn 2,2 MB ở `client/public/models/gian-hang/cho-dem.glb`, ghi công ở màn hình mở đầu và `GIAY-PHEP.txt`): `usePavModel` trong `hub3d.js` nạp sẵn lúc `preload`, phóng `PAV_MODEL_SCALE` 1,3, lùi `PAV_BACK`, vật liệu Lambert riêng từng gian (sáng ×1,45), biển tên gian tiếng Việt che băng rôn chữ nước ngoài phía trên quầy; giữ thảm, cột cờ màu gian, nhãn kỷ lục. Nạp lỗi hoặc `?pav=0` thì dùng **nhà triển lãm tự dựng** cũ (`buildPavilion`, nhóm `old`: nền đá, cột sơn son, mái ngói hai tầng, quầy Kenney). Sketchfab tải được bằng khóa API đã lưu trên môi trường (`api.sketchfab.com/v3/models/<uid>/download`). Kích thước và vùng cản ở `PAVILION` (`shared/world.js`, phóng 1,5 lần); `standPoint` đứng trước thềm. Trước mỗi gian có nút **🚪 Vào phòng chờ** (Gian 3: ▶ Vào chơi; quán: ☕ Vào quán) vẽ theo vị trí 3D ngang tầm mắt (`buildEnterButtons`). **Chỉ vào được khi đứng trước gian** (trong `NEAR_BOOTH` 300 px quanh `standPoint`, `enterNear`): đứng xa thì nút ẩn hẳn, phím E cũng không có tác dụng; chạm vào gian hoặc nút ở thanh dưới (`goTo`) chỉ đi tới trước gian, không tự vào (Bảng vàng vẫn mở luôn); dòng chữ nhỏ báo số người đang chờ (`hub.setBoothInfo`, `main.js` hỏi `/api/match` 5 giây một lần khi ở sảnh).
  - `gfx/models.js`: nạp mô hình Kenney Fantasy Town Kit (CC0) trong `client/public/models/kenney` (quầy hàng, xe đẩy, ghế, cờ, đèn); gốc mô hình được đưa về tâm, vật liệu đổi sang Lambert cho nhẹ; `tint: "blue" | "gray"` để đổi màu bạt. Nạp lỗi hoặc `?kit=0` thì dùng gian tự dựng. `gfx/character.js`: nhân vật (tay chân, mắt chuyển động trong shader); nhân vật của mình chọn kiểu ở `MINE_LOOK` trong `MINE_LOOKS` (mặc định `mu-do`: mũ lưỡi trai đỏ sao vàng, tóc nâu, áo đỏ sao vàng; còn `non-la` kiểu cũ, `toc-nau`, `mu-vang`).
  - `gfx/webgl.js` (không nạp Three.js): phát hiện WebGL, mức chất lượng (`?q=0|1|2`, `?gfx=css`). `gfx/kit.js`: renderer, tự hạ chất lượng, kết cấu canvas, nhân vật gộp 1 mesh.
  - Quán cà phê: `buildCafe` trong `hub3d.js` (quầy, mái bạt, ly cà phê khổng lồ, bàn dù, dây đèn, nốt nhạc bay khi đang phát), nút "☕ Vào quán" và nút "Cà phê" ở thanh dưới; `main.js` `enterCafe()`; `CAFE` trong `config.js`. Không có WebGL vẫn vào quán dạng phẳng (chat, nhạc vẫn chạy).
  - `booth3d.js` (nạp động): không gian 3D riêng của từng gian. **Phòng chờ dùng mô hình Sketchfab (CC BY 4.0, `client/public/models/phong-cho`, `ROOM_MODELS`)**: Gian 1, Gian 2 dùng phòng rộng gấp đôi `MATCH_ROOM` 1700×1270 px (`roomOf`). Gian 1 "Hacker Room low poly" (Pudding_King; xoay, phóng 3,2, `widenRoom` giãn tường/sàn thêm 1,41 lần, đồ đạc giữ cỡ dàn thưa, đồ treo tường bám tường; nhân vật `k` 1,6; áp phích vẽ lại (`posterTex`: khung gỗ, biển cảnh báo, minh hoạ, khẩu hiệu, hơi phát sáng), bỏ chữ HACKER, màn hình đếm người treo ở vách phải), Gian 2 "Scifi Tron Studio" (ida61xq; phóng 0,56, vật liệu không cần đèn, màn hình trên sân khấu), Gian 3 "Cartoon Lowpoly Small City" (antonmoek; đứng ở ngã tư, màn hình dựng thành biển quảng cáo, `clearSpawn` dọn xe ở cửa). Vật cản `OBST` tính từ hộp bao đồ đạc (chỉ ở máy người chơi). Nạp lỗi thì dùng phòng tự dựng cũ ( màn hình lớn báo số người/đếm ngược, người chờ đi lại, chào). Cùng kiểu góc nhìn với sảnh (thứ ba sau vai / thứ nhất, nút 🎥/👁️, phím V, chung `hc_view`), kéo để nhìn, cần điều khiển, W A S D, Shift chạy; máy quay không lọt ra sau tường. Quán cà phê là phòng riêng to hơn (`CAFE_ROOM` 1822×2755 px trong `shared/world.js`; mô hình đã tách thành node `shell` (vỏ quán, phóng 1,25 và kéo ngang thêm `CF` 1,45) và 11 cụm bàn ghế `g0..g10` giữ đúng cỡ, đặt lại theo `CAFE_GROUPS` (`from` tâm gốc, `to` chỗ mới, ghế/mặt bàn dời theo cụm), bàn lùi xa màn chiếu: `roomOf(game)`, sàn đi lại `walk` (đa giác, `inPoly`), bàn `tables`, cột `posts`, màn chiếu `screen` trên tường gỗ dài), nội thất là mô hình Sketchfab "Low Poly Restaurant Interior Scene" của MarkoJantti (CC BY 4.0, `client/public/models/cafe/quan.gltf`, phóng 1,25 lần; nhân vật, tầm mắt, tốc độ trong quán phóng theo `K`; ghi công trong `CAFE.intro` và `models/cafe/GIAY-PHEP.txt`); máy quay không lọt qua tường/cột; có 39 ghế ngồi được đúng chỗ ghế trong mô hình (`CAFE_SEATS`): chạm ghế hoặc lại gần bấm "🪑 Ngồi" (phím E); máy chủ giữ ghế (`msit {s}` → `msit {n,s}` / `msitno`, đi xa >40 px hoặc rời quán thì nhả ghế, `mspace` có `seat`). `games/lobby.js` `createSpace()` dựng lớp phủ + HUD (Chat, Chào, Vỗ tay, Luật chơi, Ra hội chợ; Gian 3 có nút Bắt đầu chạy; quán có thanh nhạc + nút tắt tiếng; trình duyệt chặn tự phát có tiếng thì phát không tiếng, chạm màn hình lần đầu là bật tiếng (`autoplayBlocked`, không có nút chắn); trong quán ẩn tên trên đầu nhân vật (`.sp-cafe .avt .nm`)), `main.js` `enterBooth(id)` mở khi bấm gian; không có WebGL thì quay về thẻ luật + phòng chờ 2D.
  - `games/hacker.js` (Gian 1 "Ai là Hacker?"): bảng chọn chế độ nổi trên phòng chờ 3D (`space.panel()`, `space.status()` trong `lobby.js`), hàng chờ, phòng bạn bè (mời qua `share(title, text, "?hk=mã")`, mở link `?hk=` là vào thẳng phòng), thẻ chia từ chạm giữ để xem, bàn chơi xếp vòng tròn (mình ở giữa phía dưới, câu mô tả thành bong bóng `.hk-bub`), bỏ phiếu chạm chọn người, đoán từ, kết quả + Góc kiến thức; nhận tin `hk:*` (main.js chuyển khi `S.cur === "g1"`, nối lại thì gửi `hk:resume`). `games/rebus.js` (Gian 2): **đấu phòng**, nhận tin `m*` qua `onMsg(m)`, gửi qua `ctx.send`; phòng chờ ở `games/lobby.js`. `games/runner.js` (Gian 3: vòng mô phỏng bước cố định + ghi `inputs`), phần vẽ Gian 3 ở `games/runner3d.js` (Three.js) hoặc `games/runnerCss.js`.
  - `platform.js`: kết nối `zmp-sdk` (import động, ngoài Zalo tự chuyển sang chế độ thử).
- `shared/runnerSim.js`: mô phỏng tất định Gian 3, máy chủ chạy lại để chấm điểm. **Không được đổi luật mô phỏng ở một phía mà không đổi phía kia.** Chạy vô hạn tới khi hết 3 mạng (`MAX_FRAMES` chỉ chặn ở 2 giờ cho máy chủ chạy lại). Có đổi làn, nhảy, cúi (`act(s, d)`, d = -1/1/2/-2, `ACT`; máy tính: A/D hoặc ←/→ đổi làn, **Space**/W/↑ nhảy, S/↓ cúi); vật cản có cách vượt `low` (nhảy), `high` (cúi), `full` (đổi làn); từ giây 14 có hàng kín 3 làn luôn chừa một vật vượt được.
- `shared/world.js`: **bố cục khu hội chợ dùng chung** cho máy chủ, bản Three.js và bản CSS 3D: sân 7200×7200 px (`SCALE = 3` so với bố cục gốc 2400: khoảng cách nhân 3, kích thước đồ vật giữ nguyên), cổng phía nam, 3 gian ở tây/bắc/đông quay vào giữa, Bảng vàng góc tây nam, quán cà phê góc tây bắc, Gian 5 (sắp mở) góc đông bắc, sân trống giữa và 80 chỗ ngồi (`SEATS`: 16 ghế băng × 3, 8 bàn × 4 ghế đẩu). Máy chủ dùng `WORLD`, `SPAWN`, `SEATS` (tin nhắn `sit`/`sitno`, mỗi ghế một người, rời ghế >40 px hoặc thoát thì nhả ghế). Đổi bố cục chỉ sửa file này.
- `shared/chatFilter.js`: bộ lọc chat dùng chung.
- `admin/index.html`: trang quản trị (đợt thưởng, báo cáo chat, xuất CSV trúng giải, nạp lại nội dung).
- `chay-thu.cmd`: chạy máy chủ ở chế độ thử (DEV_LOGIN=1, ADMIN_KEY=hoicho2026) bằng cách bấm đúp.
- `nguoi-ao.cmd` / `server/tools/bots.mjs`: 60 người chơi ảo vào khu 1 (đi dạo, ghé gian, ngồi ghế, chào, chat, chào lại khi người thật nhắn "chào"). Cần máy chủ đang chạy với DEV_LOGIN=1.
- Nội dung mẫu: `server/content/*.json` (`hacker.json`: 20 cặp từ Gian 1, cần công an phường duyệt; `rebus.json`; `event.json`). Gian 2 đang là địa danh toàn quốc, chưa có địa danh của phường.
- `_legacy/`: Gian 1 cũ "Thật hay giả?" (vuốt thẻ, `cards.json`) để tham khảo, không được nạp.

## Quyết định của anh (18/11/2026)

- Làm **bản hoàn chỉnh** để chạy thật, không phải bản chạy thử.
- Đưa lên Zalo: **chưa rõ** ghép vào Mini App hiện có của phường hay làm Mini App riêng (cần hỏi đơn vị làm app). Làm theo hướng **Mini App riêng** trước, giữ cấu trúc để sau ghép được.
- Hạ tầng (Mini App ID, App Secret, máy chủ, tên miền): chưa xác định. Chuẩn bị gói triển khai dùng được trên VPS bất kỳ.
- Đồ họa: **nâng lên 3D thật bằng Three.js** (ánh sáng, bóng đổ, mô hình gian hàng, nhân vật), "cho đẹp hơn".
- Nội dung: **dùng nội dung mẫu**, cán bộ thay sau.
- **Thay Gian 1 "Thật hay giả?" (vuốt thẻ) bằng "Ai là Hacker?"** (20/11/2026), luật chơi kiểu "Ai là gián điệp" về an toàn thông tin, không có chế độ chơi chung một máy, không có bot ở bản chính thức, phòng 8 người có 2 Hacker. Thiết kế chi tiết ở mục dưới (đã làm xong 20/11/2026).
- Có chat tự do trong khu, đã có bộ lọc số điện thoại, link, OTP, từ tục, chống spam, báo cáo, tự ẩn khi đủ 3 báo cáo.

## Gian 1 mới: "Ai là Hacker?"

**Đã làm (20/11/2026).** Thay hoàn toàn gian vuốt thẻ. Đã chuyển `client/src/games/swipe.js` và phần `swipe` trong `server/src/games.js` vào thư mục `_legacy/` để tham khảo rồi gỡ khỏi danh sách gian. Gian vẫn là `g1`, đổi tên thành **"Ai là Hacker?"**, đổi biểu tượng, mô tả trong `client/src/config.js` (BOOTHS) và câu giới thiệu trong `main.js`.

### Luật chơi

1. **Chia từ:** mỗi ván 4–8 người thật. Đa số là **Công dân**, nhận cùng một từ (ví dụ "Mã OTP"). **Hacker** nhận từ gần giống (ví dụ "Mật khẩu"): **4–7 người thì có 1 Hacker, đủ 8 người thì có 2 Hacker** (áp dụng cho cả Ghép ngẫu nhiên và Phòng bạn bè). Hai Hacker nhận cùng một từ nhưng không được báo ai là Hacker còn lại. Không ai được biết vai của mình, chỉ biết từ của mình.
2. **Mô tả:** lần lượt mỗi người gõ một câu mô tả từ của mình, 30 giây mỗi lượt, không được chứa chính từ đó (máy chủ kiểm tra sau khi bỏ dấu, không phân biệt hoa thường; chứa thì từ chối và bắt gõ lại). Hết giờ chưa gõ thì bỏ lượt.
3. **Bỏ phiếu:** sau mỗi vòng mô tả, 20 giây để chạm chọn người nghi là Hacker (không tự chọn mình). Ai nhiều phiếu nhất bị loại. Hòa phiếu thì bỏ phiếu lại một lần, chỉ chọn giữa những người hòa (15 giây); vẫn hòa thì không ai bị loại, sang vòng mới. Để ván không kéo dài vô hạn, tối đa 10 vòng; hết 10 vòng mà chưa phân thắng thua thì ván **hòa**: không ai được điểm thắng, điểm bỏ phiếu trúng vẫn giữ.
4. **Thắng thua:** Công dân thắng khi loại được **tất cả** Hacker. Phe Hacker **chỉ thắng khi ván còn đúng 2 người** mà trong đó có ít nhất 1 Hacker (áp dụng cho cả ván 1 Hacker và 2 Hacker). Mỗi Hacker khi bị loại được 1 lần đoán từ của Công dân trong 20 giây; đoán trúng (so sánh sau khi bỏ dấu, không phân biệt hoa thường) thì phe Hacker lật kèo và thắng ngay. Ván 2 Hacker: Hacker thứ nhất bị loại mà đoán sai thì ván tiếp tục để tìm Hacker còn lại.
5. **Góc kiến thức:** sau mỗi ván hiện thẻ giải thích hai từ khác nhau thế nào và lời khuyên an toàn liên quan.

### Bộ từ khóa (nội dung mẫu, cần công an phường hoặc bộ phận chuyên môn duyệt)

Lưu ở `server/content/hacker.json`, mỗi cặp: `civ` (từ Công dân), `hacker` (từ Hacker), `knowledge` (thẻ Góc kiến thức). Cán bộ sửa được, nạp lại bằng nút trong trang quản trị như các file nội dung khác.

| Công dân | Hacker |
| --- | --- |
| Mã OTP | Mật khẩu |
| Tin nhắn lừa đảo | Tin nhắn quảng cáo |
| Wifi công cộng | Wifi ở nhà |
| Xác thực hai lớp | Mã PIN |
| Mã QR thanh toán | Mã vạch sản phẩm |
| Tin giả | Tin đồn |
| Deepfake | Ảnh chỉnh sửa |
| Mã độc tống tiền | Virus máy tính |
| Cuộc gọi giả danh công an | Cuộc gọi giả danh ngân hàng |
| Link rút gọn | Link lạ |
| Cập nhật phần mềm | Cài ứng dụng mới |
| Quyền truy cập danh bạ | Quyền truy cập vị trí |
| Sao lưu dữ liệu | Đồng bộ đám mây |
| Sim rác | Sim chính chủ |
| Tài khoản bị chiếm | Tài khoản ảo |
| Bắt nạt qua mạng | Bình luận tiêu cực |
| Trình quản lý mật khẩu | Sổ ghi mật khẩu |
| Việc nhẹ lương cao | Việc làm thêm |
| Ứng dụng VNeID | Ứng dụng ngân hàng |
| Chuyển khoản | Quét mã thanh toán |

Ví dụ thẻ Góc kiến thức (OTP/Mật khẩu): "Mật khẩu bạn tự đặt và dùng lâu dài; mã OTP do ngân hàng gửi, chỉ dùng một lần trong vài phút. Không bao giờ đọc OTP cho ai, kể cả người xưng là nhân viên ngân hàng."

### Hai chế độ chơi (KHÔNG có chế độ chơi chung một máy)

- **Ghép ngẫu nhiên:** vào hàng chờ chung. Đủ 8 người thì bắt đầu ngay; có từ 4 người trở lên và đã chờ 30 giây thì bắt đầu với số người hiện có. Màn hình chờ hiện "Đang chờ thêm người (3/8)". Chờ quá 90 giây chưa đủ 4 người thì gợi ý mời bạn bè.
- **Phòng bạn bè:** tạo phòng có mã 6 chữ số, mời qua `openShareSheet` của Zalo (deep link mở thẳng vào phòng). Chủ phòng bấm bắt đầu khi đủ 4–8 người.

**Không có bot ở bản chính thức.** Chỉ được dùng bot để kiểm thử khi `DEV_LOGIN=1` (ví dụ lệnh thêm bot vào phòng khi chạy thử); bản chạy thật không có cách nào thêm bot.

### Cách tính điểm (máy chủ tính khi ván kết thúc)

| Việc làm được | Điểm |
| --- | --- |
| Phe Công dân thắng: mỗi Công dân, kể cả người đã bị loại oan giữa ván | +100 |
| Phe Hacker thắng (ván còn 2 người, trong đó có Hacker): mỗi Hacker, kể cả Hacker đã bị loại | +200 |
| Hacker bị loại nhưng đoán trúng từ: phe Hacker thắng, người đoán trúng được thêm | +100 (tổng 300) |
| Mỗi vòng Công dân bỏ phiếu trúng một Hacker (kể cả khi vòng đó Hacker chưa bị loại). Hacker bỏ phiếu cho Hacker kia không được điểm này | +50 |
| Rời ván giữa chừng (mất kết nối quá 30 giây hoặc tự thoát) | 0 điểm cả ván |

Ví dụ ván 6 người, Hacker là An:
- **Vòng 1:** Bình, Chi, Dũng chọn An; Em chọn Giang; Giang chọn Em; An chọn Bình. An có 3 phiếu nên bị loại, đoán từ sai. Công dân thắng. Bình, Chi, Dũng mỗi người được 100 + 50 = 150; Em, Giang mỗi người 100; An 0.
- **Nếu An đoán trúng từ:** An được 300. Công dân không được điểm thắng, nhưng Bình, Chi, Dũng vẫn giữ 50 điểm vì bỏ phiếu trúng.
- **Nếu vòng 1 loại oan Giang, các vòng sau tiếp tục loại oan cho tới khi chỉ còn An và một Công dân:** An được 200; ai từng chọn trúng An ở vòng nào thì mỗi vòng đó được 50.

Ví dụ ván 8 người, Hacker là An và Bình:
- Vòng 1 loại An, An đoán sai: ván tiếp tục. Vòng 3 loại Bình, Bình đoán sai: Công dân thắng, mỗi Công dân được 100 cộng 50 cho mỗi vòng đã chọn trúng An hoặc Bình. An và Bình được 0.
- Vòng 1 loại An, An đoán sai; Bình trụ đến khi chỉ còn Bình và một Công dân: phe Hacker thắng, An và Bình mỗi người 200.
- Vòng 3 loại Bình, Bình đoán trúng từ: phe Hacker thắng ngay, An 200, Bình 300.

### Điểm Gian 1 trên Bảng vàng

- Gian 2 và Gian 3 tính **điểm cao nhất của một lượt**. Gian 1 là trò nhiều người, mỗi ván chỉ được tối đa 100–300 điểm nên tính **tổng điểm tích lũy trong đợt**.
- **Giới hạn 1.000 điểm mỗi ngày** (khoảng 4–7 ván thắng). Vượt mức thì vẫn chơi, ván vẫn hiện điểm, nhưng không cộng thêm vào Bảng vàng hôm đó.
- **Giới hạn cả đợt 3.000 điểm cho Bảng vàng chung** (anh đã duyệt 20/11/2026), để Gian 1 ngang cỡ Gian 2 (tối đa khoảng 2.000) và Gian 3 (người chơi giỏi khoảng 1.500–3.500). Không giới hạn cả đợt thì sau vài tuần, người chơi Gian 1 nhiều sẽ bỏ xa mọi người, Bảng vàng chỉ còn đo ai chơi nhiều nhất. Tab riêng "Gian 1" trên Bảng vàng vẫn hiện tổng tích lũy thật (không giới hạn cả đợt) để vinh danh người chơi tích cực.
- **Tổng Bảng vàng chung = điểm Gian 1 (tối đa 3.000) + điểm cao nhất Gian 2 + điểm cao nhất Gian 3.**
- **Chỉ ván Ghép ngẫu nhiên được tính điểm.** Phòng bạn bè là giải trí, không tính, để tránh người quen báo từ cho nhau (anh đã duyệt 20/11/2026).
- Cả hai mức giới hạn đặt trong cấu hình đợt thưởng (trang quản trị), cán bộ đổi được.

### Thiết kế kỹ thuật

- **Máy chủ:** thêm `server/src/hacker.js` quản lý hàng chờ, phòng và vòng đời ván theo trạng thái: `lobby → deal → describe → vote → (guess) → reveal`. Mỗi bước có hẹn giờ phía máy chủ; người không thao tác kịp thì máy chủ tự xử lý (bỏ lượt mô tả, không bỏ phiếu). Dùng chung kết nối WebSocket hiện có (thêm các loại tin `hk:*`), một người chỉ ở một phòng tại một thời điểm, rớt mạng được nối lại trong 30 giây trước khi bị coi là rời ván.
- **Bí mật vai và từ:** máy chủ chỉ gửi cho mỗi người từ của chính họ; không bao giờ gửi vai hay từ của người khác xuống điện thoại trước khi ván kết thúc.
- **Câu mô tả:** đi qua `shared/chatFilter.js` (chặn số điện thoại, link, OTP dạng số, từ tục) và kiểm tra không chứa từ khóa; tối đa 80 ký tự; có nút báo cáo như chat khu. Không dùng giọng nói.
- **Lưu trữ:** bảng `hacker_games` (mã ván, chế độ, cặp từ, người chơi, phiếu từng vòng, kết quả, thời gian) để tính điểm và để cán bộ xem lại khi có khiếu nại; bảng điểm Gian 1 theo đợt lưu cả điểm từng ngày để áp giới hạn ngày và giới hạn đợt (thêm cách tính tích lũy cho `g1` trong `store.js`, các gian khác giữ "điểm cao nhất").
- **Giao diện:** `client/src/games/hacker.js` gồm màn hình chọn chế độ, hàng chờ, xem từ (chạm giữ để hiện, thả ra để che), bàn chơi (ảnh đại diện xếp vòng tròn, câu mô tả hiện thành bong bóng), bỏ phiếu, kết quả và Góc kiến thức. Phong cách đồ họa đồng bộ với bản nâng cấp Three.js của sảnh.
- **Kiểm thử:** thêm vào `server/test/` các kịch bản: chia vai đúng (4–7 người: đúng 1 Hacker; 8 người: đúng 2 Hacker cùng từ, không ai được báo vai), ván 2 Hacker: loại Hacker thứ nhất đoán sai thì ván tiếp tục, Hacker bỏ phiếu cho Hacker kia không được +50, không lộ từ của người khác, câu mô tả chứa từ khóa bị từ chối, hòa phiếu và bỏ phiếu lại, hết 10 vòng thì ván hòa, Hacker chỉ thắng khi còn đúng 2 người (cả ván 1 và 2 Hacker; ván 2 Hacker còn 3 người gồm 2 Hacker thì ván vẫn tiếp tục), Hacker đoán từ đúng/sai, hết giờ tự xử lý, rời ván không được điểm, phòng bạn bè không tính điểm, giới hạn điểm ngày và đợt, không thêm được bot khi `DEV_LOGIN=0`.

### Ghi chú khi làm (20/11/2026)

- Vào Gian 1 vẫn vào phòng chờ 3D "Hacker Room" (đi lại, chào, chat như quán cà phê); bảng chọn chế độ, hàng chờ, phòng bạn bè nổi trên phòng, màn hình lớn trong phòng báo trạng thái hàng chờ. Ván bắt đầu thì phòng 3D ẩn, hiện bàn chơi.
- Giờ mỗi bước: chia từ 8 s, mô tả 30 s/lượt, bỏ phiếu 20 s (bỏ phiếu lại 15 s), đoán từ 20 s, chờ ghép 30 s khi có từ 4 người, giữ chỗ khi rớt mạng 30 s.
- Người bị loại thì lộ vai ngay (Hacker bị loại còn phải đoán từ công khai). Rời ván (tự thoát hoặc rớt mạng quá 30 giây) tính như bị loại và được 0 điểm.
- Câu mô tả bị báo cáo được lưu như tin chat ẩn (`khu = 0`, có tiền tố "[Ai là Hacker?]") để hiện trong mục Báo cáo của trang quản trị.
- Link mời phòng bạn bè: ngoài Zalo là `?hk=mã`; trong Zalo gửi `openShareSheet` kiểu `zmp_deep_link` kèm `path: "?hk=mã"`, cần thử lại khi có Mini App ID thật.
- Người chơi ảo chỉ thêm được ở phòng bạn bè khi `DEV_LOGIN=1` (nút "+ Thêm người ảo"); `nguoi-ao.cmd` chỉ cho người ảo ghé phòng chờ 3D Gian 1, không vào ván.

## Việc cần làm tiếp

1. ~~Nâng Node lên 22+ trên máy, chạy `npm test`~~ (đã kiểm tra trên máy đám mây Node 22: 8/8 đạt). Máy anh vẫn cần Node 22.13+.
2. ~~Nâng đồ họa bằng Three.js~~ (xong 18/11/2026, còn thử trên điện thoại Android thật):
   - Thêm `three` vào `client/package.json`, chuyển `client/` sang build bằng Vite (đã có `vite.config.js`, lệnh `npm run dev`, `npm run build`).
   - Viết lại `client/src/hub.js` bằng Three.js nhưng **giữ nguyên giao diện hàm** mà `main.js` đang gọi: `buildHub(ctx)`, `startHub()`, `zoomOut()`, `goTo(id)`, `addPeer`, `removePeer`, `movePeer`, `renamePeer`, `peerEmote`, `peerSay`, `selfSay`, `hidePeer`, `resetPeers`, `peerCount`, `EMOTES`. Giữ điều khiển: chạm đất để đi, kéo để xoay, W A S D, chạm gian hàng để đi tới và phóng to.
   - Viết lại phần vẽ của `client/src/games/runner.js` bằng Three.js, **giữ nguyên** vòng mô phỏng bước cố định và việc ghi `inputs` gửi máy chủ.
   - Gian 1 (bàn chơi) và Gian 2 (ô chữ) giữ bố cục dễ đọc, chỉ làm đẹp thêm.
   - Tối ưu cho Android cấu hình thấp: giới hạn pixel ratio, bóng đổ có thể tắt, hạ chất lượng tự động khi khung hình thấp; tính năng phải chạy được cả khi không có WebGL (thông báo hoặc quay về bản CSS 3D).
3. Đóng gói Mini App riêng theo chuẩn Zalo hiện hành (tham khảo https://miniapp.zaloplatforms.com/documents/), đặt `VITE_API_BASE` tới máy chủ thật.
4. Gói triển khai máy chủ: Dockerfile, docker-compose, cấu hình Caddy hoặc Nginx (HTTPS, chuyển tiếp WebSocket `/ws`), hướng dẫn sao lưu `server/data/hoicho.db`.
5. **Xác nhận cách xác thực người dùng Zalo** trong `server/src/auth.js` (`graph.zalo.me/v2.0/me` + `appsecret_proof`) với tài liệu Zalo hiện hành và thử bằng tài khoản thật.
6. Khi chạy thật: `DEV_LOGIN=0`, đặt `SESSION_SECRET`, `ZALO_APP_SECRET`, `ADMIN_KEY`, `CORS_ORIGIN` trong `server/.env`.
