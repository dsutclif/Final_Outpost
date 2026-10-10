// Dev harness config. A plain object (no `vite` import) so it loads with the root vite binary
// without this package depending on vite; run with `pnpm --filter @fo/render-3d dev`.
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

export default {
  root: here,
  server: { host: "127.0.0.1", port: 5190, strictPort: true, fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
  clearScreen: false,
};
