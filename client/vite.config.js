import { defineConfig } from "vite";

// - Cho phép giao diện dùng chung code trong thư mục ../shared với máy chủ.
// - npm run dev: mở http://localhost:3000, API và WebSocket chuyển tiếp sang máy chủ ở cổng 8787.
// - npm run build: xuất ra thư mục www (máy chủ tự phục vụ thư mục này nếu có).
const API = process.env.API_TARGET || "http://localhost:8787";

export default defineConfig({
  root: ".",
  base: "./",
  server: {
    port: 3000,
    host: true,
    fs: { allow: [".."] },
    proxy: {
      "/api": { target: API, changeOrigin: true },
      "/ws": { target: API.replace(/^http/, "ws"), ws: true }
    }
  },
  build: {
    outDir: "www",
    emptyOutDir: true,
    target: "es2020",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Three.js tách riêng để màn hình chào hiện nhanh, đồ họa nạp sau.
        manualChunks: id => (id.includes("node_modules/three") ? "three" : id.includes("node_modules/zmp-sdk") ? "zmp" : undefined)
      }
    }
  }
});
