import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts: true,
    port: 5173,
    watch: {
      ignored: [
        "**/vitest.config.*",
        "**/vitest.workspace.*",
        "**/vitest.setup.*",
      ],
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:7345",
        changeOrigin: true,
      },
    },
  },
});
