// Defend redesign S1 (outpost-ops#264, spec 1.1-1.2): re-time and re-price a defend manifest. Pure; the input is not changed.
// Used by the S1 spread checks on logged candidates. Generation switches (generator.json defendWaves/defendCosts) default off.

type Json = Record<string, any>;

export interface DefendS1 {
  /** defense.maxLive written to params (waves on the field at once). */
  maxLive?: number;
  overlapMin?: number;
  /** S2: defense.sideMode 1 (random): every wave's `side` becomes this pool, one drawn per wave at its warning. */
  randomSides?: string[];
  warnSeconds?: number;
  /** Seconds between wave starts: wave k starts at t0 + gap * k (single-family levels: 20). */
  gap?: number;
  /** Two-family levels: tower pads cost their full price in res.currency (coins) instead of res.salvage. */
  coinTowers?: boolean;
  /** Price conversion salvage -> coins (spec: 1.5). */
  currencyPerSalvage?: number;
}

const TOWERS = ["struct.ranged_defense", "struct.ranged_defense.t2", "struct.ranged_defense.t3"];

export function applyDefendS1<T>(manifest: T, o: DefendS1): T {
  const m = JSON.parse(JSON.stringify(manifest)) as Json;
  if (o.maxLive !== undefined) m["params"] = { ...m["params"], "defense.maxLive": o.maxLive };
  if (o.overlapMin !== undefined) m["params"] = { ...m["params"], "defense.overlapMin": o.overlapMin };
  if (o.randomSides && o.randomSides.length > 1) m["params"] = { ...m["params"], "defense.sideMode": 1, ...(o.warnSeconds !== undefined ? { "defense.warnSeconds": o.warnSeconds } : {}) };
  const ws = (m["waves"] ?? []) as Json[];
  if (o.randomSides && o.randomSides.length > 1) for (const w of ws) w["side"] = [...o.randomSides];
  if (o.gap !== undefined && ws.length > 0) ws.forEach((w, k) => { w["t"] = Math.round(ws[0]!["t"] + o.gap! * k); });
  if (o.coinTowers) {
    const k = o.currencyPerSalvage ?? 1.5;
    for (const e of (m["entities"] ?? []) as Json[]) {
      if (e["type"] !== "pad.build" || !TOWERS.includes(e["build"]) || !e["cost"]?.["res.salvage"]) continue;
      e["cost"] = { "res.currency": Math.ceil(e["cost"]["res.salvage"] * k) };
    }
  }
  return m as T;
}
