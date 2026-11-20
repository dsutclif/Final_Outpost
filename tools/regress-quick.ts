// --quick for levels:check (outpost-ops#242): a fast look while tuning a slice, never the check that ships it.
// Fewer seeds, only the levels you name (--levels a,b) or the ones git shows as changed, no cache read or write.

export const QUICK_LABEL = "QUICK CHECK, NOT A SHIP CHECK: fewer seeds and only part of the pack. Run `pnpm levels:check` (full) before shipping.";
export const QUICK_SEEDS = { ref: 3, others: 1 };

export interface Plan { quick: boolean; seeds: string; others: string; useCache: boolean; only: string[] | null }

/** Seed counts, cache use and the level filter for a run. Full mode is exactly the old defaults. */
export function planRun(argv: string[]): Plan {
  const arg = (n: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const quick = argv.includes("--quick");
  const only = arg("--levels")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null;
  return {
    quick,
    seeds: arg("--seeds") ?? (quick ? String(QUICK_SEEDS.ref) : "10"),
    others: arg("--others") ?? (quick ? String(QUICK_SEEDS.others) : "3"),
    useCache: !quick && !argv.includes("--no-cache"),
    only,
  };
}

/** Pack levels to replay in quick mode: the named ones, else those whose file is in the changed list. */
export function pickLevels(levels: { id: string; file: string }[], plan: Plan, changed: string[]): { id: string; file: string }[] {
  if (!plan.quick) return levels;
  if (plan.only) return levels.filter((l) => plan.only!.some((o) => o === l.id || o === l.file));
  const set = new Set(changed.map((c) => c.replace(/\\/g, "/")));
  return levels.filter((l) => [...set].some((c) => c.endsWith(`/${l.file}`) || c === l.file));
}
