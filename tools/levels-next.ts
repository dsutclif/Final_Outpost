import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTENT_VERSION } from "../packages/content/src/index.js";
import { ENGINE_VERSION } from "../packages/sim/src/index.js";
import { adaptOffset, type AdaptResult, type PlayedLevel } from "../packages/sequencer/src/index.js";

// pnpm levels:next --cleared N [--played '[{"index":61,"stars":2,"attempts":1},...]']
//   [--ahead 60] [--batch 20] [--min 10] [--jobs N] [--dry-run]
//
// The level supply. Levels stay an offline batch (SPEC "Generation and rating time"), made ahead of
// the player and never more than --ahead levels past the last one they cleared. This plans the next
// batch from the compatible packs in levels/packs/index.json: how many levels are published, how
// many the cap allows, and the batch's target offset (sequencer adaptOffset, from the player's
// recent cleared levels and the previous batch's offset). It then builds them as a new pack with
// tools/build-levels.ts and records the tuning in that pack.json. Run by
// .github/workflows/levels-next.yml when the game reports progress (api/progress.js).

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const packsDir = join(root, "levels", "packs");
const argv = process.argv.slice(2);
const arg = (name: string, def?: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
};
const flag = (name: string): boolean => argv.includes(name);

interface PackFile { id: string; engineVersion: string; contentVersion: string; levels: { id: string }[]; tuning?: AdaptResult & { cleared: number } }

/** Levels published for the running engine, in play order, and the last batch's offset. */
export function published(dir: string = packsDir): { count: number; offset: number; packs: string[] } {
  const indexPath = join(dir, "index.json");
  const ids = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as { packs: string[] }).packs : [];
  let count = 0, offset = 0;
  const packs: string[] = [];
  for (const id of ids) {
    const p = join(dir, id, "pack.json");
    if (!existsSync(p)) continue;
    const pack = JSON.parse(readFileSync(p, "utf8")) as PackFile;
    if (pack.engineVersion !== ENGINE_VERSION || pack.contentVersion !== CONTENT_VERSION) continue;
    count += pack.levels.length;
    packs.push(id);
    if (pack.tuning) offset = pack.tuning.offset;
  }
  return { count, offset, packs };
}

export interface BatchPlan { from: number; to: number; packId: string; tuning: AdaptResult & { cleared: number } }

/**
 * The next batch, or null when the supply is already `ahead` levels past the player or the gap is
 * smaller than `min` (a batch is worth a build run only when it adds several levels). Pure.
 */
export function planBatch(pub: { count: number; offset: number }, cleared: number, played: readonly PlayedLevel[], ahead: number, batch: number, min = 1): BatchPlan | null {
  const c = Math.max(0, Math.min(cleared, pub.count));
  const n = Math.min(batch, c + ahead - pub.count);
  if (n < Math.max(1, min)) return null;
  const from = pub.count + 1, to = pub.count + n;
  return { from, to, packId: `s1-${String(from).padStart(3, "0")}`, tuning: { ...adaptOffset(pub.offset, played), cleared: c } };
}

function parsePlayed(s: string | undefined): PlayedLevel[] {
  if (!s) return [];
  const raw = JSON.parse(s) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x): PlayedLevel[] => {
    const o = x as Record<string, unknown>;
    const index = Number(o["index"]), stars = Number(o["stars"]), attempts = Number(o["attempts"]);
    return Number.isInteger(index) && index > 0 && stars >= 0 && stars <= 3 && attempts >= 1 && attempts < 1000 ? [{ index, stars, attempts }] : [];
  }).slice(-50);
}

async function main(): Promise<void> {
  const cleared = Number(arg("--cleared", "0"));
  if (!Number.isInteger(cleared) || cleared < 0) throw new Error(`--cleared must be a whole number, got ${arg("--cleared")}`);
  const played = parsePlayed(arg("--played"));
  const ahead = Number(arg("--ahead", "60")), batch = Number(arg("--batch", "20")), min = Number(arg("--min", "10"));
  const pub = published();
  const plan = planBatch(pub, cleared, played, ahead, batch, min);
  console.log(`published ${pub.count} levels for engine ${ENGINE_VERSION} (${pub.packs.join(", ") || "none"}); player cleared ${cleared}`);
  if (!plan) { console.log(`supply is ${pub.count - Math.min(cleared, pub.count)} levels ahead (cap ${ahead}, batches of at least ${min}): nothing to build`); return; }
  console.log(`next batch: levels ${plan.from}-${plan.to} as pack ${plan.packId}, target offset ${plan.tuning.offset} (${plan.tuning.reason})`);
  if (flag("--dry-run")) return;

  const viteNode = join(root, "node_modules", "vite-node", "vite-node.mjs");
  const jobs = arg("--jobs");
  const args = [viteNode, join(here, "build-levels.ts"), "--", "--from", String(plan.from), "--to", String(plan.to),
    "--out", join(packsDir, plan.packId), "--target-offset", String(plan.tuning.offset), "--no-doc", ...(jobs ? ["--jobs", jobs] : [])];
  const code = await new Promise<number>((ok) => spawn(process.execPath, args, { cwd: root, stdio: "inherit" }).on("close", (c) => ok(c ?? 1)));
  const packPath = join(packsDir, plan.packId, "pack.json");
  if (existsSync(packPath)) {
    const pack = JSON.parse(readFileSync(packPath, "utf8")) as PackFile;
    writeFileSync(packPath, JSON.stringify({ ...pack, tuning: plan.tuning }, null, 2) + "\n");
  }
  process.exitCode = code;
}

// tests import planBatch without running the CLI
if (!process.env["VITEST"]) void main();
