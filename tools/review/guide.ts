import { CONTENT_VERSION } from "../../packages/content/src/index.js";
import { ENGINE_VERSION } from "../../packages/sim/src/index.js";
import { Args, loadLimits, resolveIn, round, writeJson } from "./lib.js";
import { analyseGuide, guideCandidates } from "./guide-core.js";
import { followGuide } from "./guide-walk.js";
import { listLevels, readManifest, splitByEngine } from "./pulse-core.js";

// pnpm review:guide -- --out <dir> [--story levels/story] [--pack levels/packs/s1] [--first 10] [--seconds 600] [--only id,id]
//
// tools/guide-follow.ts over the story levels and the first levels of the main pack: a follower who
// only walks to the guide arrow and stands there, with every change of step recorded. Writes guide.json
// (per level: the arrow's timeline, longest step, stalls, loops) and candidates-guide.json (category 6).
// This file reaches into the client package, which is not a project reference of tools, so it stays out
// of the tools typecheck (as guide-follow.ts does); the analysis is in guide-core.ts.

async function main(args: Args): Promise<void> {
  const usage = "pnpm review:guide -- --out <dir> [--story levels/story] [--pack levels/packs/s1] [--first 10] [--seconds 600] [--only id,id]";
  const out = resolveIn(args.need("--out", usage));
  const L = loadLimits(args.get("--limits") ? resolveIn(args.get("--limits")!) : undefined);
  const seconds = args.num("--seconds", 600);
  const first = args.num("--first", 10);
  const only = args.list("--only");
  const { play: refs, skipped } = splitByEngine([...listLevels(resolveIn(args.get("--story", "levels/story")!)), ...listLevels(resolveIn(args.get("--pack", "levels/packs/s1")!)).slice(0, first)]
    .filter((r) => only.length === 0 || only.includes(r.id)));
  const t0 = Date.now();
  const levels = [];
  const errors: { levelId: string; message: string }[] = [];
  for (const ref of refs) {
    try {
      const rec = await followGuide(readManifest(ref), ref.id, ref.pack, seconds);
      levels.push(analyseGuide(rec, L.guide));
    } catch (e) {
      errors.push({ levelId: ref.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  const candidates = guideCandidates(levels, L.guide);
  writeJson(out, "guide.json", {
    v: 1,
    meta: { generated: new Date().toISOString(), engine: ENGINE_VERSION, content: CONTENT_VERSION, seconds, levels: levels.length, runtimeS: round((Date.now() - t0) / 1000, 1), errors, skipped },
    levels: Object.fromEntries(levels.map((g) => [g.levelId, g])),
  });
  writeJson(out, "candidates-guide.json", candidates);
  console.log(`guide: ${levels.length} levels followed in ${round((Date.now() - t0) / 1000, 1)} s, ${candidates.length} candidates, ${errors.length} errors, ${skipped.length} skipped (pinned to another engine)`);
  for (const e of errors) console.error(`  ${e.levelId}: ${e.message}`);
  if (errors.length > 0) process.exitCode = 1;
}

void main(new Args(process.argv.slice(2)));
