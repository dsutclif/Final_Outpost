/**
 * Cheap early-stop rules for one recipe's search (outpost-ops#251, Phase C). Pure: the generator feeds it every
 * candidate of a slot (across retry seeds) and asks whether to stop. Stopping marks the recipe failed, so the
 * build re-rolls the slot with a new recipe (#198) instead of burning the rest of the 40-candidate cap.
 *
 *  (a) unreachable: after MIN_CANDIDATES, the target lies outside the [Dmin, Dmax] the recipe reached by more than
 *      the tolerance, and p already touched its limit on the side that matters (more pressure cannot raise D,
 *      less cannot lower it).
 *  (b) one non-difficulty reject (objectives/layout/idleModule/infeasible) is the FIRST reject on at least 75% of
 *      the candidates while some candidate's D is within 0.07 of the target: D is right, the recipe fails a gate.
 *
 * Rules only decide to stop; they never loosen a gate.
 */
export const EARLY_STOP = {
  /** Default of the `--early-stop` switch in tools/build-levels.ts; flipped on only after the A/B (docs/reports/phaseC-ab.md). */
  defaultOn: false,
  minCandidates: 4,
  /** p counts as "at its limit" at or beyond these. */
  pHigh: 0.9,
  pLow: 0.1,
  tolerance: 0.05,
  dominanceShare: 0.75,
  dBand: 0.07,
  nonDifficulty: ["objectives", "layout", "idleModule", "infeasible"] as readonly string[],
} as const;

export interface StopEntry { p: number; D?: number | undefined; firstReject: string | null }
export interface StopVerdict { rule: "unreachable" | "dominant_reject"; reason: string; candidates: number; Dmin?: number; Dmax?: number; kind?: string; share?: number }

export function earlyStopCheck(entries: readonly StopEntry[], target: number, cfg: typeof EARLY_STOP = EARLY_STOP): StopVerdict | null {
  const n = entries.length;
  if (n < cfg.minCandidates) return null;
  const Ds = entries.map((e) => e.D).filter((d): d is number => typeof d === "number");
  const Dmin = Ds.length ? Math.min(...Ds) : undefined, Dmax = Ds.length ? Math.max(...Ds) : undefined;
  if (Dmin !== undefined && Dmax !== undefined) {
    const pMax = Math.max(...entries.map((e) => e.p)), pMin = Math.min(...entries.map((e) => e.p));
    if (target > Dmax + cfg.tolerance && pMax >= cfg.pHigh)
      return { rule: "unreachable", reason: `target ${target} above Dmax ${Dmax} with p up to ${pMax}`, candidates: n, Dmin, Dmax };
    if (target < Dmin - cfg.tolerance && pMin <= cfg.pLow)
      return { rule: "unreachable", reason: `target ${target} below Dmin ${Dmin} with p down to ${pMin}`, candidates: n, Dmin, Dmax };
    if (Ds.some((d) => Math.abs(d - target) <= cfg.dBand)) {
      for (const kind of cfg.nonDifficulty) {
        const k = entries.filter((e) => e.firstReject === kind).length;
        if (k / n >= cfg.dominanceShare)
          return { rule: "dominant_reject", reason: `${kind} is the first reject on ${k} of ${n} candidates while D reached within ${cfg.dBand} of target ${target}`, candidates: n, Dmin, Dmax, kind, share: Math.round((k / n) * 1000) / 1000 };
      }
    }
  }
  return null;
}
