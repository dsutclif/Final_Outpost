import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// Relative import: the config is bundled by esbuild, and this file only imports types.
import { marsGreenhouse as skin } from "../skins/src/mars_greenhouse";

export default defineConfig({
  server: { host: "0.0.0.0", port: 5180, strictPort: true },
  preview: { host: "0.0.0.0", port: 5181 },
  build: { outDir: "dist", target: "es2022", sourcemap: false, chunkSizeWarningLimit: 800 },
  plugins: [
    VitePWA({
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        name: `Farthest Outpost: ${skin.name}`,
        short_name: "Outpost",
        description: skin.tagline,
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        theme_color: skin.themeColor,
        background_color: skin.palette.ui.bg,
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icons/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // generated level packs: fetched once, then served from the phone
            urlPattern: ({ url }) => url.pathname.includes("/levels/"),
            handler: "CacheFirst",
            options: { cacheName: "fo-levels", expiration: { maxEntries: 600 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});
