import { sameAsEarlier } from "../packages/rater/src/variety.js";

// Variety pass of the pack build (outpost-ops#150). Levels are built in parallel, each against the planned requests
// before it, so a worker cannot see the signatures of the levels built beside it. After the build, the parent walks
// the pack in level order; a level whose signature matches an earlier one is rebuilt with every earlier signature as
// history (the rater rejects those candidates and the search goes on). Rebuilding a level changes its signature, so
// the walk repeats until the pack is clean or maxPasses is reached.

export interface Signed { index: number; id: string; signature?: string | undefined }

export interface VarietyReport<R extends Signed> {
  results: Map<number, R>;
  /** Rebuilds per level index. */
  reruns: Map<number, number>;
  /** Levels still matching an earlier level after the last pass (or whose rebuild failed): index and the level matched. */
  unresolved: { index: number; id: string; sameAs: string }[];
}

/** The levels (in order) whose signature matches an earlier level's; `before` are pack levels outside this build. */
export function duplicatesInOrder(before: readonly Signed[], results: ReadonlyMap<number, Signed>): { index: number; sameAs: string }[] {
  const all = [...before, ...results.values()].sort((a, b) => a.index - b.index);
  const out: { index: number; sameAs: string }[] = [];
  all.forEach((r, k) => {
    if (!results.has(r.index) || r.signature === undefined) return;
    const hit = sameAsEarlier(r.id, r.signature, all.slice(0, k));
    if (hit !== null) out.push({ index: r.index, sameAs: hit });
  });
  return out;
}

export async function varietyPass<R extends Signed>(opts: {
  before: readonly Signed[];
  results: Map<number, R>;
  maxPasses: number;
  /** Rebuild one level, avoiding these signatures. Null when nothing shipped. */
  rebuild: (index: number, avoid: { id: string; signature: string }[]) => Promise<R | null>;
  log?: (s: string) => void;
}): Promise<VarietyReport<R>> {
  const { before, results, maxPasses, rebuild } = opts;
  const reruns = new Map<number, number>();
  const failed = new Map<number, string>();
  for (let pass = 1; pass <= maxPasses; pass++) {
    const dups = duplicatesInOrder(before, results).filter((d) => !failed.has(d.index));
    if (dups.length === 0) break;
    // One level at a time, in order: a rebuilt level is part of what every later level must avoid.
    for (const d of dups) {
      const r = results.get(d.index)!;
      const still = duplicatesInOrder(before, results).find((x) => x.index === d.index);
      if (!still) continue;
      const avoid = [...before, ...results.values()]
        .filter((x) => x.index < d.index && x.signature !== undefined)
        .map((x) => ({ id: x.id, signature: x.signature! }));
      opts.log?.(`  L${d.index}: same as ${still.sameAs} (${r.signature}); rebuilding, pass ${pass}`);
      reruns.set(d.index, (reruns.get(d.index) ?? 0) + 1);
      const next = await rebuild(d.index, avoid);
      if (next) results.set(d.index, next); else failed.set(d.index, still.sameAs);
    }
  }
  const left = duplicatesInOrder(before, results);
  const unresolved = left.map((d) => ({ index: d.index, id: results.get(d.index)!.id, sameAs: failed.get(d.index) ?? d.sameAs }));
  return { results, reruns, unresolved };
}
