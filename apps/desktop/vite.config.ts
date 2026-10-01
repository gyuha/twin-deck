/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // 아이콘 SVG(1,199개)가 base64로 JS 번들에 들어가지 않게 파일로 두고 URL만 참조한다.
  build: { assetsInlineLimit: (file) => (file.endsWith(".svg") ? false : undefined) },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
