import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { measure, METRIC_NAMES } from "./measure.js";
import { computeReference, historyEntry, score, type Rating } from "./rate.js";
import type { HistoryEntry } from "./measure.js";

// pnpm --filter @fo/rater rate levels/golden/*.json [--seeds N] [--others N] [--json] [--write-reference path]
// Globs are expanded here because PowerShell passes them through literally.

const args = process.argv.slice(2);
const base = process.env["INIT_CWD"] ?? process.cwd();
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const has = (name: string): boolean => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const refSeeds = Number(flag("--seeds") ?? 10);
const otherSeeds = Number(flag("--others") ?? 3);
const writeRef = flag("--write-reference");
const asJson = has("--json");

function expand(pattern: string): string[] {
  const abs = isAbsolute(pattern) ? pattern : resolve(base, pattern);
  if (!abs.includes("*")) return [abs];
  const esc = (t: string) => t.split("").map((ch) => (/[a-zA-Z0-9_-]/.test(ch) ? ch : "\\" + ch)).join("");
  const dir = dirname(abs), re = new RegExp("^" + basename(abs).split("*").map(esc).join(".*") + "$");
  return readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => join(dir, f));
}

const files = args.flatMap(expand);
if (files.length === 0) {
  console.error("usage: rate <manifest.json ...> [--seeds N] [--others N] [--json] [--write-reference path]");
  process.exit(1);
}
const manifests = files.map((f) => JSON.parse(readFileSync(f, "utf8")) as unknown);
const history: HistoryEntry[] = [];
const measured = manifests.map((m) => {
  const ms = measure(m, { refSeeds, otherSeeds, history: [...history] });
  history.push(historyEntry(m));
  return ms;
});
const reference = writeRef ? computeReference(measured, `${files.map((f) => basename(f)).join(", ")} (refSeeds ${refSeeds}, others ${otherSeeds})`) : undefined;
if (writeRef && reference) {
  const out = isAbsolute(writeRef) ? writeRef : resolve(base, writeRef);
  writeFileSync(out, JSON.stringify(reference, null, 2) + "\n");
  console.log(`wrote reference stats for ${reference.n} levels to ${out}`);
}
const ratings: Rating[] = measured.map((ms) => score(ms, reference ? { reference } : {}));

if (asJson) {
  console.log(JSON.stringify(ratings, null, 2));
} else {
  const pct = (x: number) => `${Math.round(x * 100)}%`.padStart(5);
  const head = ["level", "D", "F", "passed", ...["good", "average", "weak", "novice", "floor"].map((p) => p.slice(0, 4)), "flags"];
  console.log(head.join("\t"));
  for (const r of ratings) {
    const flags = Object.entries(r.filters).filter(([, v]) => v).map(([k]) => k).join(",") || (r.feasible ? "ok" : "infeasible");
    const margins = ["good", "average", "weak", "novice", "floor"].map((p) => `${r.winRate[p] === 1 ? "W" : r.winRate[p]! > 0 ? "w" : "L"}${pct(r.margin[p]!)}`);
    console.log([r.id, r.D.toFixed(3), r.F.toFixed(3), r.botsPassed.length, ...margins, flags].join("\t"));
  }
  console.log("\nmetrics");
  console.log(["level", ...METRIC_NAMES].join("\t"));
  for (const r of ratings) console.log([r.id, ...METRIC_NAMES.map((k) => r.metrics[k].toFixed(3))].join("\t"));
  for (const r of ratings) {
    const ev = r.evidence;
    const notes = [...ev.idleModules.map((m) => `idle module ${m}`), ...ev.unreadable, ...ev.stallRuns.map((s) => `stall ${s}`), ...ev.collapseRuns.map((s) => `pile collapse ${s}`), ...(ev.duplicateOf ? [`duplicate of ${ev.duplicateOf}`] : [])];
    if (notes.length > 0) console.log(`${r.id}: ${notes.join("; ")}`);
  }
}
