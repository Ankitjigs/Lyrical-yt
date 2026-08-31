import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  build: {
    emptyOutDir: false, // Important: Don't delete other build artifacts
    outDir: "dist",
    lib: {
      entry: fileURLToPath(new URL("./src/background/index.ts", import.meta.url)),
      name: "LyricalBackground", // unique global name for IIFE
      fileName: () => "background.js",
      formats: ["iife"],
    },
  },
  resolve: {
    alias: {
      undici: fileURLToPath(new URL("./src/background/undici-shim.ts", import.meta.url)),
    },
  },
  define: {
    "process.env": {},
    "process.versions.node": '"20.0.0"',
    "process.platform": '"browser"',
    process: {
      env: {},
      versions: { node: "20.0.0" },
      platform: "browser",
    },
  },
  publicDir: false, // Prevent re-copying public assets
});
