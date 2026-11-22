import { TPS, type Compiled, type State } from "@fo/sim";
import type { Content } from "@fo/content";
import type { Manifest } from "@fo/content";
import { DEFEND_FIT, defendInput, predictRho, type DefendInput } from "./defendModel.js";
import { STRATEGIES, type Strategy } from "./profiles.js";

// Defend S3 (outpost-ops#273, spec section 2): the judgment dial. At level start and at each wave decision point (the
// wave_warning, or the wave start where sides are not random) a bot scores every fixed strategy with the defend model
// from its live state over a horizon of 1 + round(2j) waves and picks argmax(margin + noise), noise sigma = 0.5 (1 - j) on
// margins normalised to the best. All noise comes from a hash of the bot's own seed (never the sim rng), so a choice is
// a pure function of (seed, profile, state) and does not depend on how many draws came before.

/** Coins -> salvage equivalent (generator.json defendCosts.currencyPerSalvage). */
export const COIN_RATE = 1.5;

const count = (stack: readonly string[], res: string): number => { let n = 0; for (const s of stack) if (s === res) n++; return n; };

/** Deterministic uniform [0,1) from three integers. */
export function hash01(a: number, b: number, c: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
/** Standard normal from the hash (Box-Muller). */
export const gauss = (a: number, b: number, c: number): number => Math.sqrt(-2 * Math.log(Math.max(1e-12, hash01(a, b, c)))) * Math.cos(2 * Math.PI * hash01(a, b, c + 7919));

export interface JudgeLog { tick: number; wave: number; margins: Record<Strategy, number>; best: Strategy; pick: Strategy }

export class Judge {
  chosen: Strategy = "turrets_first";
  readonly log: JudgeLog[] = [];
  private key = "";
  private n = 0;
  private readonly inp: DefendInput;
  /** Hostile hit points still to come from each side, over the waves not yet started (equal split where the side is random). */
  private pool: Record<string, number> = {};

  constructor(private readonly cp: Compiled, content: Content, readonly judgment: number, private readonly seed: number) {
    this.inp = defendInput(cp.manifest as unknown as Manifest, content, COIN_RATE);
    this.content = content;
  }
  private readonly content: Content;

  get sigma(): number { return 0.5 * (1 - this.judgment); }
  get horizon(): number { return 1 + Math.round(2 * this.judgment); }

  /** Re-decide when a decision point passed (level start, a new wave_warning, a wave start). */
  refresh(st: State): void {
    const k = `${st.waves.idx}|${st.waves.nextSide?.start ?? ""}`;
    if (k === this.key) return;
    this.key = k; this.n++;
    this.refreshPool(st);
    const from = {
      t: st.tick / TPS,
      scrap: count(st.player.stack, "res.salvage") + st.currency / COIN_RATE,
      bought: new Set(st.pads.filter((p) => p.done).map((p) => p.id)),
      guards: st.residents.filter((r) => this.cp.roles[r.role]?.behavior === "guard" && r.status === "ok").length,
      drone: !!this.inp.drone && st.pads.some((p) => p.id === this.inp.drone!.id && p.done),
      waveIdx: st.waves.idx,
      waves: this.horizon,
    };
    // Margin = share of attacker hit points the defence kills in the horizon minus the share of the gate and base lost, plus a
    // 0.3 weight on the defender dps standing at each wave start (relative to the best strategy): on a level that every strategy
    // holds, the dps is what tells the buy orders apart, and it is what breaks the level first when the volume rises.
    const rs = STRATEGIES.map((s) => predictRho(this.inp, DEFEND_FIT, 1, { dt: 0.5, strategy: s, from }));
    const mdps = rs.map((r) => (r.perWave.length ? r.perWave.reduce((a, p) => a + p.dps, 0) / r.perWave.length : 0));
    const topDps = Math.max(...mdps, 1e-9);
    const margins = {} as Record<Strategy, number>;
    STRATEGIES.forEach((s, i) => { const r = rs[i]!; margins[s] = (r.hpTotal > 0 ? r.hpDealt / r.hpTotal : 1) - r.rho + 0.3 * (mdps[i]! / topDps); });
    const bestM = Math.max(...STRATEGIES.map((s) => margins[s]));
    const den = Math.max(Math.abs(bestM), 0.05);
    let best = STRATEGIES[0]!, pick = STRATEGIES[0]!, bv = -Infinity, pv = -Infinity;
    STRATEGIES.forEach((s, i) => {
      const v = margins[s] / den;
      if (v > bv + 1e-12) { bv = v; best = s; }
      const noisy = v + this.sigma * gauss(this.seed, this.n, i);
      if (noisy > pv) { pv = noisy; pick = s; }
    });
    this.chosen = pick;
    this.log.push({ tick: st.tick, wave: st.waves.idx, margins, best, pick });
  }

  private refreshPool(st: State): void {
    this.pool = {};
    for (let k = Math.min(st.waves.idx, this.cp.waves.length); k < this.cp.waves.length; k++) {
      const w = this.cp.waves[k]!;
      const hp = w.types.reduce((a, t) => a + Number((this.content.hostiles[t] as { hp?: number } | undefined)?.hp ?? 1), 0);
      const sides = [...new Set(w.sides)];
      for (const s of sides) this.pool[s] = (this.pool[s] ?? 0) + hp / sides.length;
    }
  }

  /**
   * Site choice (spec 2.2): value = covered share of the side pool / price; the key is its inverse (lower buys first), times
   * log-normal noise per pad and decision point. `price` includes what a required rubble clear still costs.
   */
  siteKey(padId: string, side: string | null, price: number): number {
    const total = Object.values(this.pool).reduce((a, n) => a + n, 0);
    const covered = total > 0 && side ? (this.pool[side] ?? 0) / total : 0;
    let h = 0; for (let i = 0; i < padId.length; i++) h = (Math.imul(h, 31) + padId.charCodeAt(i)) | 0;
    return (Math.max(price, 0.5) / (covered + 0.05)) * Math.exp(this.sigma * gauss(this.seed ^ h, this.n, 101));
  }

  /**
   * Carry hook for S6 (spec 2.3, med bay without a medic): true when the bot lifts a downed guard now. `gain` is the guard's
   * remaining-level value, `loss` the shots and pickups the round trip costs; the same noise rule as the other choices.
   */
  carryNow(gain: number, loss: number, salt = 0): boolean {
    return gain - loss + Math.max(gain, loss, 1e-9) * this.sigma * gauss(this.seed, this.n, 200 + salt) > 0;
  }

  /** Share of decisions where the pick equals the noiseless best. */
  report(): { n: number; hits: number; picks: Strategy[] } {
    return { n: this.log.length, hits: this.log.filter((l) => l.pick === l.best).length, picks: this.log.map((l) => l.pick) };
  }
}
