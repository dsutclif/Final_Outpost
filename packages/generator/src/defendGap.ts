import type { Content } from "@fo/content";
import { repin, strategyGap } from "@fo/rater";
import { playBot, strategyProfile, type Strategy } from "@fo/bots";
import { DEFEND_FIT, GAP_STRATEGIES, countsHp, crossingCount, defendInput, fitEta, modelManifest, profileOf, waveBreakMult, type DefendFit, type GapWaveProfile, type ModelStrategy } from "@fo/bots";

// Defend S4 (outpost-ops#273, spec section 3): place every wave's volume inside the gap between the fixed strategies' breaking
// volumes. Pure: manifest in, manifest out. The waves' compositions stay (their counts are scaled to the new volume); times are
// placed here (singleFamilyGap replaces the retime of S1: wave k at t0 + gap * k, sized in the same pass).
type Json = Record<string, any>;

export interface DefendGapCfg {
  on: boolean;
  /** g = clamp(a + b * target, a, c). */
  gFromTarget: [number, number, number];
  /** v_k <= feasible * V_hi. */
  feasible: number;
  minRatio: number;
  iterations: number;
  strategies: ModelStrategy[];
  /** The last `last` waves are sized at least (1 + step) x the biggest earlier wave (within the gap). */
  escalate: { last: number; step: number };
}

export interface GapPlaceOptions {
  cfg: DefendGapCfg;
  /** The difficulty target 0..1 (default 0.5). */
  target?: number;
  /** Seconds between wave starts (single-family levels); 0 keeps the manifest's wave times. */
  gap?: number;
  /** Warlords in the final wave (0 = leave the final wave as it is). */
  warlords?: number;
  fit?: DefendFit;
  /** Per-strategy eta_s (default: the fit's eta for all). */
  etas?: Partial<Record<ModelStrategy, number>>;
  coinRate?: number;
  /** Replaces the model's breaking multiplier of wave k for a strategy: gets the manifest cut to waves 0..k (earlier waves at what the strategy carried, wave k at its template). The sim probe (`simBreak`) goes here. */
  breakFn?: (m: Json, k: number, s: ModelStrategy) => number;
}

export interface GapPlacement {
  /** Per wave, with a breakFn: the model's breaking multiplier next to the probe's, per strategy (to size the model fix). */
  compare?: { k: number; model: Record<string, number>; probe: Record<string, number> }[];
  ok: boolean;
  /** Reject reason: "noCrossing" (no crossing and too small a gap) or "noWaves". */
  reason?: string;
  manifest: Json;
  waves: GapWaveProfile[];
  crossings: number;
  ratioShare: number;
  /** Per wave notes: escalation or feasibility clamps, repeat nudges, boss hp. */
  notes: string[];
}

const sideKey = (w: Json): string => JSON.stringify(w["side"] ?? null);
const sig = (w: Json): string => JSON.stringify([sideKey(w), Object.entries(w["counts"] as Record<string, number>).filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : 1))]);

export function placeDefendGap(manifest: unknown, c: Content, o: GapPlaceOptions): GapPlacement {
  const cfg = o.cfg, fit = o.fit ?? DEFEND_FIT, ss = cfg.strategies.length ? cfg.strategies : [...GAP_STRATEGIES];
  const m = JSON.parse(JSON.stringify(manifest)) as Json;
  const ws = (m["waves"] ?? []) as Json[];
  const notes: string[] = [];
  if (ws.length === 0) return { ok: false, reason: "noWaves", manifest: m, waves: [], crossings: 0, ratioShare: 0, notes };
  const target = o.target ?? 0.5;
  const g = Math.max(cfg.gFromTarget[0], Math.min(cfg.gFromTarget[2], cfg.gFromTarget[0] + cfg.gFromTarget[1] * target));
  const bossId = "hostile.boss";
  // templates: the waves as sized (the composition each wave keeps), warlords aside
  const tpl = ws.map((w) => ({ ...(w["counts"] as Record<string, number>) }));
  const tplBoss = tpl.map((t) => t[bossId] ?? 0);
  if (o.gap && o.gap > 0) { const t0 = Number(ws[0]!["t"]); ws.forEach((w, k) => { w["t"] = Math.round(t0 + o.gap! * k); }); }
  const bossHp = Number((c.hostiles[bossId] as Json | undefined)?.["hp"] ?? 0);
  const wantBoss = (o.warlords ?? 0) > 0 && bossHp > 0 ? o.warlords! : 0;
  let result: GapWaveProfile[] = [];
  let compare: NonNullable<GapPlacement["compare"]> = [];
  let last: number[] = [];
  for (let it = 0; it < Math.max(1, cfg.iterations); it++) {
    notes.length = 0;
    result = [];
    compare = [];
    const caps: Record<string, number[]> = Object.fromEntries(ss.map((s) => [s, [] as number[]]));
    // the model reads the waves as they stand now (earlier waves at their placed counts; wave k's own counts are the template)
    for (let k = 0; k < ws.length; k++) ws[k]!["counts"] = { ...tpl[k]! };
    const done: number[] = [];
    for (let k = 0; k < ws.length; k++) {
      const inp = defendInput(modelManifest(m), c, o.coinRate ?? 1.5);
      const T = countsHp(tpl[k]!, c);
      const mult: Record<string, number> = {}, V: Record<string, number> = {};
      for (const s of ss) {
        if (o.breakFn) {
          const cut = JSON.parse(JSON.stringify({ ...m, waves: ws.slice(0, k + 1) })) as Json;
          for (let j = 0; j < k; j++) cut["waves"][j]["counts"] = scaleCounts(ws[j]!["counts"], caps[s]![j]!);
          mult[s] = k === 0 ? 1 : o.breakFn(cut, k, s);
        } else mult[s] = waveBreakMult(inp, fit, s, o.etas?.[s] ?? fit.eta, caps[s]!);
        V[s] = mult[s]! * T;
      }
      if (o.breakFn) compare.push({ k, model: Object.fromEntries(ss.map((s) => [s, waveBreakMult(inp, fit, s, o.etas?.[s] ?? fit.eta, caps[s]!)])), probe: { ...mult } });
      const vs = ss.map((s) => V[s]!), vLo = Math.min(...vs), vHi = Math.max(...vs);
      const cap = cfg.feasible * vHi;
      let v = vLo + g * (vHi - vLo);
      const asIs = !!o.breakFn && k === 0;
      if (asIs) v = T;
      const nE = Math.min(cfg.escalate.last, ws.length - 1);
      if (!asIs && nE > 0 && k >= ws.length - nE && k >= 1) {
        const before = Math.max(...done.slice(0, ws.length - nE));
        const floor = before * (1 + cfg.escalate.step);
        if (v < floor) { v = floor; notes.push(`wave ${k}: escalated to ${floor.toFixed(0)} hp`); }
        if (k === ws.length - 1 && done[k - 1]! > v) v = done[k - 1]! * (1 + cfg.escalate.step / 2);
      }
      if (!asIs && v > cap) { notes.push(`wave ${k}: clamped to ${(cfg.feasible * 100).toFixed(0)}% of V_hi`); v = cap; }
      if (vHi <= vLo * 1.001) notes.push(`wave ${k}: no gap (V_lo = V_hi)`);
      // counts for v: the template scaled; warlords (final wave) are fixed hp inside it
      const boss = k === ws.length - 1 && wantBoss ? Math.max(wantBoss, tplBoss[k]!) : tplBoss[k]!;
      const counts = countsFor(tpl[k]!, v, boss, bossId, bossHp, c);
      ws[k]!["counts"] = counts;
      // no identical repeat of an earlier wave (volume, composition, sides): nudge the swarmlings by one until it differs, inside the gap
      for (const d of [1, -1, 2, -2, 3, -3]) {
        if (!ws.slice(0, k).some((w) => sig(w) === sig(ws[k]!))) break;
        const sw = (counts["hostile.swarmling"] ?? 0) + d;
        if (sw < 1) continue;
        const alt = { ...counts, "hostile.swarmling": sw };
        const hp = countsHp(alt, c);
        if (hp > cap || hp < vLo) continue;
        ws[k]!["counts"] = alt;
        notes.push(`wave ${k}: swarmlings ${d > 0 ? "+" : ""}${d} (no identical repeat)`);
      }
      const hp = countsHp(ws[k]!["counts"], c);
      done.push(hp);
      for (const s of ss) caps[s]!.push(Math.min(1, cfg.feasible * mult[s]! * (T / Math.max(1, hp))));
      result.push(profileOf(k, Number(ws[k]!["t"]), hp, V, ss));
    }
    const flat = done;
    if (last.length && flat.every((x, i) => Math.abs(x - last[i]!) / Math.max(1, x) < 1e-3)) break;
    last = flat;
  }
  const crossings = crossingCount(result.map((w) => w.best));
  const ratioShare = result.filter((w) => w.ratio >= cfg.minRatio).length / result.length;
  const ok = crossings >= 2 || ratioShare >= 0.5;
  return { ok, ...(ok ? {} : { reason: "noCrossing" }), manifest: m, waves: result, crossings, ratioShare, notes, ...(compare.length ? { compare } : {}) };
}

/** Wave counts at hit points v: the template's non-warlord kinds scaled together (rounded, a kind present stays at 1 or more), `boss` warlords added. */
function countsFor(tpl: Record<string, number>, v: number, boss: number, bossId: string, bossHp: number, c: Content): Record<string, number> {
  const base: Record<string, number> = {};
  for (const [k, n] of Object.entries(tpl)) if (k !== bossId && n > 0) base[k] = n;
  const hp0 = countsHp(base, c);
  const f = hp0 > 0 ? Math.max(0, v - boss * bossHp) / hp0 : 1;
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(base)) out[k] = Math.max(1, Math.round(n * f));
  if (boss > 0) out[bossId] = boss;
  return out;
}

/**
 * Per-strategy eta_s (spec 3): the fixed-strategy bots play the manifest (sim, strategyGap) and the model's eta is fitted so its
 * breaking multiplier matches each. A strategy the sim never breaks (or breaks below the probe floor) keeps the fit's eta.
 */
export function fitStrategyEtas(manifest: unknown, c: Content, fit: DefendFit = DEFEND_FIT, probe: { seed?: number; iterations?: number } = {}): { etas: Partial<Record<ModelStrategy, number>>; multipliers: Record<string, number> } {
  const g = strategyGap(manifest, { seed: probe.seed ?? 1, iterations: probe.iterations ?? 5, lo: 0.25, hi: 24 });
  const inp = defendInput(modelManifest(manifest as Json), c, 1.5);
  const etas: Partial<Record<ModelStrategy, number>> = {};
  for (const s of GAP_STRATEGIES) {
    const sim = g.multipliers[s] ?? 0;
    etas[s] = sim > 0.25 && sim < 24 ? fitEta(inp, fit, s, sim).eta : fit.eta;
  }
  return { etas, multipliers: g.multipliers };
}

function scaleCounts(counts: Record<string, number>, f: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, n] of Object.entries(counts)) if (n > 0) out[k] = Math.max(1, Math.round(n * f));
  return out;
}

/** Sim-measured breaking multiplier of the last wave of `cut` for one strategy bot (geometric bisection of that wave's counts). */
export function simBreak(cut: Json, k: number, s: ModelStrategy, o: { seed?: number; lo?: number; hi?: number; iterations?: number } = {}): number {
  const base = JSON.parse(JSON.stringify(repin(cut))) as Json;
  const tpl = { ...(base["waves"][k]["counts"] as Record<string, number>) };
  // the cut has fewer waves than the level: a goal that needs later waves (boss) is probed as "survive this wave and 90 s more"
  if ((base["goal"] as Json | undefined)?.["type"] !== "survive") { const secs = Math.round(Number(base["waves"][k]["t"]) + 90); base["goal"] = { type: "survive", seconds: secs }; for (const o of (base["objectives"] ?? []) as Json[]) if (o["id"] === "main") { o["kind"] = "survive"; o["params"] = { seconds: secs }; } }
  const bossId = "hostile.boss";
  const profile = strategyProfile(s as Strategy);
  const won = (m: number): boolean => {
    const x = JSON.parse(JSON.stringify(base)) as Json;
    const counts: Record<string, number> = {};
    for (const [id, n] of Object.entries(tpl)) if (n > 0) counts[id] = id === bossId ? n : Math.max(1, Math.round(n * m));
    x["waves"][k]["counts"] = counts;
    return playBot(x, profile, o.seed ?? 1).won;
  };
  let lo = o.lo ?? 0.1, hi = o.hi ?? 16;
  if (!won(lo)) return 0;
  if (won(hi)) return hi;
  for (let i = 0; i < (o.iterations ?? 6); i++) { const mid = Math.sqrt(lo * hi); if (won(mid)) lo = mid; else hi = mid; }
  return lo;
}
