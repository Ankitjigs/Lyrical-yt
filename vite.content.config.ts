import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    emptyOutDir: false, // Don't wipe dist (keeps popup build)
    lib: {
      entry: fileURLToPath(new URL("./src/content/main.tsx", import.meta.url)),
      name: "LyricalPanel",
      fileName: () => "panel.js",
      formats: ["iife"], // Force IIFE for Content Script
    },
    rollupOptions: {
      output: {
        extend: true,
      },
    },
  },
  publicDir: false, // Don't copy public again
});
