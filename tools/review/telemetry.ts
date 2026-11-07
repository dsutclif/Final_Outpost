import { existsSync } from "node:fs";
import { Args, loadLimits, resolveIn, writeJson } from "./lib.js";
import { aggregate, readBatches, telemetryCandidates } from "./telemetry-core.js";

// pnpm review:telemetry -- --in <dir of batch files> --out <dir> [--since YYYY-MM-DD] [--limits file]
//
// Reads the batches api/telemetry.js stored in Vercel Blob ({"v":2,"received":…,"events":[…]}, any depth
// of day folders) and writes telemetry-agg.json (per level: plays, outcomes, 👍/👎 and chips, new against
// returning, medians of play shape and frame times; overall: installs, sessions, devices) and
// candidates-data.json (categories 6, 9, 10, 12 and 18). A missing or empty --in is not an error: it
// becomes a "no play data" data-health candidate, so a broken pull shows up instead of failing the night.

function main(args: Args): void {
  const usage = "pnpm review:telemetry -- --in <dir of batch files> --out <dir> [--since YYYY-MM-DD]";
  const inDir = resolveIn(args.need("--in", usage));
  const out = resolveIn(args.need("--out", usage));
  const L = loadLimits(args.get("--limits") ? resolveIn(args.get("--limits")!) : undefined);
  const since = args.get("--since");
  const sinceMs = since ? Date.parse(`${since}T00:00:00Z`) : 0;
  if (since && !Number.isFinite(sinceMs)) { console.error(`bad --since ${since}`); process.exit(2); }
  if (!existsSync(inDir)) console.error(`telemetry: ${inDir} does not exist; treating it as no data`);

  const read = existsSync(inDir) ? readBatches(inDir, sinceMs) : { events: [], files: 0, badFiles: [], badEvents: 0, duplicates: 0 };
  const agg = aggregate(read);
  const candidates = telemetryCandidates(agg, L);
  writeJson(out, "telemetry-agg.json", agg);
  writeJson(out, "candidates-data.json", candidates);
  const o = agg.overall;
  console.log(`telemetry: ${o.events} events from ${read.files} files (${read.badFiles.length} unreadable, ${o.duplicates} duplicates), ${o.installs} installs, ${o.sessions} sessions, ${Object.keys(agg.levels).length} levels, ${candidates.length} candidates`);
}

main(new Args(process.argv.slice(2)));
