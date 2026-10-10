import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
// Relative import: the config is bundled by esbuild, and this file only imports types.
import { marsGreenhouse as skin } from "../skins/src/mars_greenhouse";

const here = dirname(fileURLToPath(import.meta.url));
const PACKS = resolve(here, "../../levels/packs");

/** Pack folders (those with a pack.json) under levels/packs; none when the folder is absent. */
function packIds(): string[] {
  if (!existsSync(PACKS)) return [];
  return readdirSync(PACKS).filter((d) => existsSync(join(PACKS, d, "pack.json"))).sort();
}

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

/**
 * Level packs as static files: the build copies levels/packs/** to dist/levels/packs/** and
 * writes levels/packs/index.json ({ packs: [...] }); the dev server serves the same paths
 * from the repo. No dependency: a few lines of fs.
 */
function levelPacks(): Plugin {
  const index = (): string => JSON.stringify({ packs: packIds() });
  return {
    name: "fo-level-packs",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0]!;
        const m = /\/levels\/packs\/(.*)$/.exec(url);
        if (!m) return next();
        if (m[1] === "index.json") { res.setHeader("content-type", "application/json"); res.end(index()); return; }
        const file = resolve(PACKS, decodeURIComponent(m[1]!));
        if (!file.startsWith(PACKS + sep) || extname(file) !== ".json" || !existsSync(file)) { res.statusCode = 404; res.end(); return; }
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(file));
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "levels/packs/index.json", source: index() });
      for (const id of packIds()) {
        for (const f of walk(join(PACKS, id))) {
          if (extname(f) !== ".json") continue;
          this.emitFile({ type: "asset", fileName: `levels/packs/${relative(PACKS, f).split(sep).join("/")}`, source: readFileSync(f) });
        }
      }
    },
  };
}

export default defineConfig({
  // GitHub Pages serves from /<repo>/; CI sets BASE_PATH, local builds stay at the root.
  base: process.env.BASE_PATH ?? "/",
  server: { host: "0.0.0.0", port: 5180, strictPort: true },
  preview: { host: "0.0.0.0", port: 5181 },
  build: { outDir: "dist", target: "es2022", sourcemap: false, chunkSizeWarningLimit: 800 },
  plugins: [
    levelPacks(),
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
        // the three.js chunk is precached too, so a phone that chose 3D still plays offline
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        globIgnores: ["store/**"],
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/\/levels\//, /privacy\.html$/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // the pack list and pack indexes change when a new pack ships: network first, cache offline
            urlPattern: ({ url }) => /\/levels\/packs\/(index|[^/]+\/pack)\.json$/.test(url.pathname),
            handler: "NetworkFirst",
            options: { cacheName: "fo-packs", networkTimeoutSeconds: 4 },
          },
          {
            // level manifests are pinned and never change: fetched once, then served from the phone
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
