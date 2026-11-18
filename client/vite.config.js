import { defineConfig } from "vite";

// Cho phép giao diện dùng chung code trong thư mục ../shared với máy chủ.
export default defineConfig({
  root: ".",
  base: "./",
  server: { port: 3000, fs: { allow: [".."] } },
  build: { outDir: "www", emptyOutDir: true, target: "es2020" }
});
