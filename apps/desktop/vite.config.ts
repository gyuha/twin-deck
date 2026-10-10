/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  // 터미널은 처음 열 때 동적으로 불러온다. 개발 서버가 그때서야 의존성을 발견해 다시 번들하면 이미 뜬 화면의 import가
  // 낡은 주소가 되어 "Importing a module script failed"로 깨지므로, 시작할 때 미리 번들한다.
  optimizeDeps: { include: ["@xterm/xterm", "@xterm/addon-fit"] },
  server: { port: 1420, strictPort: true },
  // 아이콘 SVG(1,199개)가 base64로 JS 번들에 들어가지 않게 파일로 두고 URL만 참조한다.
  build: { assetsInlineLimit: (file) => (file.endsWith(".svg") ? false : undefined) },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
