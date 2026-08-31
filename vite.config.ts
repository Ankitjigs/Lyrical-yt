import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    modulePreload: false,
    rollupOptions: {
      input: {
        popup: fileURLToPath(new URL("./src/popup/popup.html", import.meta.url)),
        panel: fileURLToPath(new URL("./src/content/main.tsx", import.meta.url)),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunk-[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  publicDir: "public",
});
