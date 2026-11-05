// What a build pad's blueprint shows: the model id, the level it will have once built, and where it stands.
// New builds are level 1 at the pad's site. Upgrade pads show the target one level up, in place, so the
// ghost takes the same size chain as the built model at that level (buildK / modelScaleFor).

export interface GhostSpec { id: string; level: number; at: "site" | { x: number; y: number }; fromState?: true }

interface UpgradeLike { effects?: readonly { scope?: string | undefined; field?: string | undefined; op?: string | undefined; value?: number | string | undefined }[] }
interface PadLike { what: string; target?: string }
interface StateLike {
  core: { level: number; pos: { x: number; y: number } };
  structures: readonly { id: string; type: string; level: number; pos: { x: number; y: number } }[];
  converters: readonly { id: string; type: string; level: number; pos: { x: number; y: number } }[];
}

/** The level a structure upgrade sets on its target (its "set level" effect, else the `.tN` suffix). */
export function upgradeLevel(id: string, up: UpgradeLike | undefined): number | null {
  const set = up?.effects?.find((e) => e.scope === "target" && e.field === "level" && e.op === "set");
  if (set?.value !== undefined) return Number(set.value);
  const m = /\.t(\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

/**
 * The blueprint for a build pad, or null when it has none. `coreMax` and `convMax` are the top levels
 * of the core and of a converter type; a maxed target has nothing to preview. Positions are sim units
 * (fixed point), the caller converts.
 */
export function ghostSpec(
  pad: PadLike, upgrades: Record<string, UpgradeLike>, s: StateLike, coreMax: number, convMax: (type: string) => number,
): GhostSpec | null {
  if (pad.what === "sink.core.level") {
    return s.core.level >= coreMax ? null : { id: "sink.core", level: s.core.level + 1, at: { ...s.core.pos }, fromState: true };
  }
  if (pad.what === "conv.level") {
    const cv = s.converters.find((c) => c.id === pad.target);
    return cv && cv.level < convMax(cv.type) ? { id: cv.type, level: cv.level + 1, at: { ...cv.pos }, fromState: true } : null;
  }
  const up = upgrades[pad.what];
  if (up) {
    const st = s.structures.find((x) => x.id === pad.target);
    const lv = upgradeLevel(pad.what, up);
    return st && lv !== null && lv > st.level ? { id: st.type, level: lv, at: { ...st.pos }, fromState: true } : null;
  }
  return { id: pad.what, level: 1, at: "site" };
}
