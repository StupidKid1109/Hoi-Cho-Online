import { existsSync } from "node:fs";
import { join } from "node:path";
import { config, ROOT_DIR } from "./config.js";
import { createApp } from "./app.js";

if (!process.env.SESSION_SECRET) console.warn("⚠️  Chưa đặt SESSION_SECRET trong server/.env: phiên đăng nhập sẽ mất mỗi khi khởi động lại.");
if (config.devLogin) console.warn("⚠️  DEV_LOGIN đang bật: ai cũng đăng nhập thử được. Tắt khi chạy thật.");
if (!config.adminKey) console.warn("⚠️  Chưa đặt ADMIN_KEY: trang quản trị /admin đang khóa.");

const app = createApp(config);
app.server.listen(config.port, config.host, () => {
  console.log("Hội chợ online đang chạy tại http://localhost:" + config.port);
  if (config.serveClient) console.log(existsSync(join(ROOT_DIR, "client", "www", "index.html")) ? "  Giao diện:   bản build client/www (đồ họa Three.js)" : "  Giao diện:   mã nguồn chưa build (đồ họa CSS 3D). Chạy \"npm run build\" trong client để có bản Three.js.");
  console.log("  Trò chơi:    http://localhost:" + config.port + "/");
  console.log("  Quản trị:    http://localhost:" + config.port + "/admin");
});
const stop = () => { console.log("Đang dừng máy chủ…"); app.close().then(() => process.exit(0)); };
process.on("SIGINT", stop); process.on("SIGTERM", stop);
