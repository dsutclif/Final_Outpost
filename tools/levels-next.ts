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
// batch from the compatible packs in levels/packs/index.json: the highest level number reached, how
// many levels the cap allows, and the batch's target offset (sequencer adaptOffset, from the player's
// recent cleared levels and the previous batch's offset). It then builds them as a new pack with
// tools/build-levels.ts and records the tuning in that pack.json. A level number whose every seed
// fails is listed in the pack's `dropped` and never tried again; the game numbers levels by their
// place in play order, so the player sees no gap. Run by
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

interface PackFile { id: string; engineVersion: string; contentVersion: string; levels: { id: string }[]; dropped?: { index: number }[]; tuning?: AdaptResult & { cleared: number } }

/** A level id's play-order number: `s1-L081` is 81. */
const levelNumber = (id: string): number => Number(/-L(\d+)$/.exec(id)?.[1] ?? 0);

/**
 * Levels published for the running engine, the highest level number built or dropped, and the last
 * batch's offset. Numbers cannot be counted: story levels live outside the packs and dropped levels
 * leave gaps, so a count would land on numbers that are taken or known to fail.
 */
export function published(dir: string = packsDir): { count: number; top: number; offset: number; packs: string[] } {
  const indexPath = join(dir, "index.json");
  const ids = existsSync(indexPath) ? (JSON.parse(readFileSync(indexPath, "utf8")) as { packs: string[] }).packs : [];
  let count = 0, top = 0, offset = 0;
  const packs: string[] = [];
  for (const id of ids) {
    const p = join(dir, id, "pack.json");
    if (!existsSync(p)) continue;
    const pack = JSON.parse(readFileSync(p, "utf8")) as PackFile;
    if (pack.engineVersion !== ENGINE_VERSION || pack.contentVersion !== CONTENT_VERSION) continue;
    count += pack.levels.length;
    top = Math.max(top, ...pack.levels.map((l) => levelNumber(l.id)), ...(pack.dropped ?? []).map((d) => d.index));
    packs.push(id);
    if (pack.tuning) offset = pack.tuning.offset;
  }
  return { count, top, offset, packs };
}

export interface BatchPlan { from: number; to: number; packId: string; tuning: AdaptResult & { cleared: number } }

/**
 * The next batch, or null when the supply is already `ahead` levels past the player or the gap is
 * smaller than `min` (a batch is worth a build run only when it adds several levels). Pure.
 */
export function planBatch(pub: { count: number; top: number; offset: number }, cleared: number, played: readonly PlayedLevel[], ahead: number, batch: number, min = 1): BatchPlan | null {
  const c = Math.max(0, Math.min(cleared, pub.count));
  const n = Math.min(batch, c + ahead - pub.count);
  if (n < Math.max(1, min)) return null;
  const from = pub.top + 1, to = pub.top + n;
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

/**
 * Whether a finished build is worth committing. Dropped levels make the build exit 1 but the rest of
 * the batch is good, and a batch of nothing but dropped levels still moves the supply past them. A
 * batch with no levels and unaccounted numbers means the build itself broke.
 */
export function batchUsable(pack: Pick<PackFile, "levels" | "dropped"> | null, planned: number): boolean {
  return pack !== null && (pack.levels.length > 0 || (pack.dropped?.length ?? 0) === planned);
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
    "--out", join(packsDir, plan.packId), "--target-offset", String(plan.tuning.offset), "--no-doc", "--retries", arg("--retries", "6")!, ...(jobs ? ["--jobs", jobs] : [])];
  const code = await new Promise<number>((ok) => spawn(process.execPath, args, { cwd: root, stdio: "inherit" }).on("close", (c) => ok(c ?? 1)));
  const packPath = join(packsDir, plan.packId, "pack.json");
  const pack = existsSync(packPath) ? JSON.parse(readFileSync(packPath, "utf8")) as PackFile : null;
  if (pack) {
    writeFileSync(packPath, JSON.stringify({ ...pack, tuning: plan.tuning }, null, 2) + "\n");
    console.log(`build exited ${code}: ${pack.levels.length} levels, ${pack.dropped?.length ?? 0} dropped, of ${plan.to - plan.from + 1} planned`);
  }
  process.exitCode = code === 0 || batchUsable(pack, plan.to - plan.from + 1) ? 0 : code || 1;
}

// tests import planBatch without running the CLI
if (!process.env["VITEST"]) void main();
