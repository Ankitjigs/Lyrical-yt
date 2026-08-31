// vite.background.config.ts
import { defineConfig } from "file:///F:/Web%20Development/Lyrics%20Projects/Lyrical-port-ts/node_modules/vite/dist/node/index.js";
import { fileURLToPath, URL } from "node:url";
var __vite_injected_original_import_meta_url = "file:///F:/Web%20Development/Lyrics%20Projects/Lyrical-port-ts/vite.background.config.ts";
var vite_background_config_default = defineConfig({
  build: {
    emptyOutDir: false,
    // Important: Don't delete other build artifacts
    outDir: "dist",
    lib: {
      entry: fileURLToPath(new URL("./src/background/index.ts", __vite_injected_original_import_meta_url)),
      name: "LyricalBackground",
      // unique global name for IIFE
      fileName: () => "background.js",
      formats: ["iife"]
    }
  },
  resolve: {
    alias: {
      undici: fileURLToPath(new URL("./src/background/undici-shim.ts", __vite_injected_original_import_meta_url))
    }
  },
  define: {
    "process.env": {},
    "process.versions.node": '"20.0.0"',
    "process.platform": '"browser"',
    process: {
      env: {},
      versions: { node: "20.0.0" },
      platform: "browser"
    }
  },
  publicDir: false
  // Prevent re-copying public assets
});
export {
  vite_background_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5iYWNrZ3JvdW5kLmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIkY6XFxcXFdlYiBEZXZlbG9wbWVudFxcXFxMeXJpY3MgUHJvamVjdHNcXFxcTHlyaWNhbC1wb3J0LXRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJGOlxcXFxXZWIgRGV2ZWxvcG1lbnRcXFxcTHlyaWNzIFByb2plY3RzXFxcXEx5cmljYWwtcG9ydC10c1xcXFx2aXRlLmJhY2tncm91bmQuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9GOi9XZWIlMjBEZXZlbG9wbWVudC9MeXJpY3MlMjBQcm9qZWN0cy9MeXJpY2FsLXBvcnQtdHMvdml0ZS5iYWNrZ3JvdW5kLmNvbmZpZy50c1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoLCBVUkwgfSBmcm9tIFwibm9kZTp1cmxcIjtcblxyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIGJ1aWxkOiB7XHJcbiAgICBlbXB0eU91dERpcjogZmFsc2UsIC8vIEltcG9ydGFudDogRG9uJ3QgZGVsZXRlIG90aGVyIGJ1aWxkIGFydGlmYWN0c1xyXG4gICAgb3V0RGlyOiBcImRpc3RcIixcbiAgICBsaWI6IHtcbiAgICAgIGVudHJ5OiBmaWxlVVJMVG9QYXRoKG5ldyBVUkwoXCIuL3NyYy9iYWNrZ3JvdW5kL2luZGV4LnRzXCIsIGltcG9ydC5tZXRhLnVybCkpLFxuICAgICAgbmFtZTogXCJMeXJpY2FsQmFja2dyb3VuZFwiLCAvLyB1bmlxdWUgZ2xvYmFsIG5hbWUgZm9yIElJRkVcbiAgICAgIGZpbGVOYW1lOiAoKSA9PiBcImJhY2tncm91bmQuanNcIixcclxuICAgICAgZm9ybWF0czogW1wiaWlmZVwiXSxcclxuICAgIH0sXHJcbiAgfSxcclxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgIHVuZGljaTogZmlsZVVSTFRvUGF0aChuZXcgVVJMKFwiLi9zcmMvYmFja2dyb3VuZC91bmRpY2ktc2hpbS50c1wiLCBpbXBvcnQubWV0YS51cmwpKSxcbiAgICB9LFxuICB9LFxuICBkZWZpbmU6IHtcclxuICAgIFwicHJvY2Vzcy5lbnZcIjoge30sXHJcbiAgICBcInByb2Nlc3MudmVyc2lvbnMubm9kZVwiOiAnXCIyMC4wLjBcIicsXHJcbiAgICBcInByb2Nlc3MucGxhdGZvcm1cIjogJ1wiYnJvd3NlclwiJyxcclxuICAgIHByb2Nlc3M6IHtcclxuICAgICAgZW52OiB7fSxcclxuICAgICAgdmVyc2lvbnM6IHsgbm9kZTogXCIyMC4wLjBcIiB9LFxyXG4gICAgICBwbGF0Zm9ybTogXCJicm93c2VyXCIsXHJcbiAgICB9LFxyXG4gIH0sXHJcbiAgcHVibGljRGlyOiBmYWxzZSwgLy8gUHJldmVudCByZS1jb3B5aW5nIHB1YmxpYyBhc3NldHNcclxufSk7XHJcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMFcsU0FBUyxvQkFBb0I7QUFDdlksU0FBUyxlQUFlLFdBQVc7QUFEMkwsSUFBTSwyQ0FBMkM7QUFHL1EsSUFBTyxpQ0FBUSxhQUFhO0FBQUEsRUFDMUIsT0FBTztBQUFBLElBQ0wsYUFBYTtBQUFBO0FBQUEsSUFDYixRQUFRO0FBQUEsSUFDUixLQUFLO0FBQUEsTUFDSCxPQUFPLGNBQWMsSUFBSSxJQUFJLDZCQUE2Qix3Q0FBZSxDQUFDO0FBQUEsTUFDMUUsTUFBTTtBQUFBO0FBQUEsTUFDTixVQUFVLE1BQU07QUFBQSxNQUNoQixTQUFTLENBQUMsTUFBTTtBQUFBLElBQ2xCO0FBQUEsRUFDRjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsUUFBUSxjQUFjLElBQUksSUFBSSxtQ0FBbUMsd0NBQWUsQ0FBQztBQUFBLElBQ25GO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sZUFBZSxDQUFDO0FBQUEsSUFDaEIseUJBQXlCO0FBQUEsSUFDekIsb0JBQW9CO0FBQUEsSUFDcEIsU0FBUztBQUFBLE1BQ1AsS0FBSyxDQUFDO0FBQUEsTUFDTixVQUFVLEVBQUUsTUFBTSxTQUFTO0FBQUEsTUFDM0IsVUFBVTtBQUFBLElBQ1o7QUFBQSxFQUNGO0FBQUEsRUFDQSxXQUFXO0FBQUE7QUFDYixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
