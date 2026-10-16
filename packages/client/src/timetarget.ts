import type { Manifest } from "@fo/content";

/** Player-chosen time target scale, in percent of the level's authored time (the generator already bakes in its own factor). */
export const TIME_TARGET_STEPS = [100, 120, 140, 160, 180, 200] as const;
export const DEFAULT_TIME_TARGET_PCT = 100;

/** Snap any stored value to a known step (old saves have none; hand-edited ones may be junk). */
export function normalizeTimeTargetPct(v: unknown): number {
  const n = Number(v);
  return (TIME_TARGET_STEPS as readonly number[]).includes(n) ? n : DEFAULT_TIME_TARGET_PCT;
}

/** A copy of the manifest with the `time_target` objective's seconds scaled, so the sim evaluates the star against it. */
export function applyTimeTarget(manifest: Manifest, pct: number): Manifest {
  const p = normalizeTimeTargetPct(pct);
  if (p === 100 || !manifest.objectives?.some((o) => o.kind === "time_target")) return manifest;
  const m = structuredClone(manifest);
  for (const o of m.objectives!) if (o.kind === "time_target") o.params["seconds"] = Math.round((Number(o.params["seconds"]) * p) / 100);
  return m;
}
