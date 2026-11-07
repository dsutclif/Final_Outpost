import { existsSync } from "node:fs";
import { Args, loadLimits, readJson, resolveIn, writeJson } from "./lib.js";
import { calibrate } from "./calibrate-core.js";
import type { PulseFile } from "./pulse-core.js";
import type { TelemetryAgg } from "./telemetry-core.js";

// pnpm review:calibrate -- --pulse <pulse.json> --telemetry <telemetry-agg.json> --out <dir> [--limits file]
//
// Joins the bots' pulse and the players' telemetry per level and writes calibration.json: which measured
// proxies and limits go with 👎, and suggested new limits for boredom-limits.json. With too few rated
// levels it still writes the file (status "not_enough_data", nothing suggested) and exits 0, so the
// monthly run reports "not yet" instead of failing.

function main(args: Args): void {
  const usage = "pnpm review:calibrate -- --pulse <pulse.json> --telemetry <telemetry-agg.json> --out <dir>";
  const pulseFile = resolveIn(args.need("--pulse", usage));
  const teleFile = resolveIn(args.need("--telemetry", usage));
  const out = resolveIn(args.need("--out", usage));
  for (const f of [pulseFile, teleFile]) if (!existsSync(f)) { console.error(`calibrate: ${f} does not exist`); process.exit(2); }
  const L = loadLimits(args.get("--limits") ? resolveIn(args.get("--limits")!) : undefined);
  const result = calibrate(readJson<PulseFile>(pulseFile), readJson<TelemetryAgg>(teleFile), L);
  writeJson(out, "calibration.json", result);
  if (result.status === "not_enough_data") console.log(`calibrate: not enough data. ${result.reason}`);
  else console.log(`calibrate: ${result.have.withEnoughRatings} rated levels (${result.have.bad} mostly 👎), ${result.suggestedLimits.length} suggested limit changes`);
}

main(new Args(process.argv.slice(2)));
