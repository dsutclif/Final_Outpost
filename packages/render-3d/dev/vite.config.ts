// Dev harness config. A plain object (no `vite` import) so it loads with the root vite binary
// without this package depending on vite; run with `pnpm --filter @fo/render-3d dev`.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default {
  root: here,
  // Meshy GLBs live in the client's public folder (models/)
  publicDir: fileURLToPath(new URL("../../client/public", import.meta.url)),
  server: { host: "127.0.0.1", port: 5190, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
  clearScreen: false,
  // ?pack=s1-L009: pack levels served from levels/packs (dev only)
  plugins: [{
    name: "fo-dev-packs",
    configureServer(server: { middlewares: { use(fn: (req: { url?: string }, res: { setHeader(k: string, v: string): void; end(b?: unknown): void }, next: () => void) => void): void } }) {
      server.middlewares.use((req, res, next) => {
        const m = /^\/packs\/(\w+)\/([\w-]+\.json)$/.exec((req.url ?? "").split("?")[0]!);
        const file = m && fileURLToPath(new URL(`../../../levels/packs/${m[1]}/${m[2]}`, import.meta.url));
        if (!file || !existsSync(file)) return next();
        res.setHeader("content-type", "application/json");
        res.end(readFileSync(file));
      });
    },
  }],
};
