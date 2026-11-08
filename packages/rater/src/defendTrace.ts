import { content as defaultContent, type Content } from "@fo/content";
import { playBot, type BotOptions, type BotProfile } from "@fo/bots";
import type { State } from "@fo/sim";

// Per-wave defend trace: observes a bot run through the runner's optional `onTick` hook. It reads state and
// events only (never writes), so a traced run is tick-for-tick the untraced run (same final hash).

export interface WaveTrace {
  wave: number;
  started: boolean;
  startTick: number;
  /** Tick the wave's hostiles were all dead (-1: not within the run). */
  clearedTick: number;
  /** Tick the next wave started, or the end of the run. */
  endTick: number;
  attackers: number;
  hpSpawned: number;
  /** Damage dealt during the window to gate sections, other wall sections, and base health (base health units). */
  gateDamage: number;
  wallDamage: number;
  baseDamage: number;
  /** gateDamage + wallDamage + baseDamage. */
  leak: number;
  /** Hostiles still on the field when the window closed. */
  carryOver: number;
  /** State when the wave started. */
  scrap: number;
  towers: number;
  guards: number;
  gateHp: number;
  gateHpMax: number;
  baseHp: number;
}

export interface DefendTrace { profile: string; seed: number; won: boolean; ticks: number; hash: string; waves: WaveTrace[] }

const sections = (st: State) => st.barriers.flatMap((l) => l.sections);

export function defendTrace(manifest: unknown, profile: BotProfile, seed: number, opts: BotOptions = {}): DefendTrace {
  const content: Content = opts.content ?? defaultContent;
  const count = ((manifest as { waves?: unknown[] }).waves ?? []).length;
  const waves: WaveTrace[] = Array.from({ length: count }, (_, i) => ({
    wave: i, started: false, startTick: -1, clearedTick: -1, endTick: -1, attackers: 0, hpSpawned: 0, gateDamage: 0, wallDamage: 0, baseDamage: 0,
    leak: 0, carryOver: 0, scrap: 0, towers: 0, guards: 0, gateHp: 0, gateHpMax: 0, baseHp: 0,
  }));
  let cur: WaveTrace | null = null;
  let seenId = 0, prevBase = -1, alive = 0;
  let prevSec: number[] = [];
  const secHp = (st: State): number[] => sections(st).map((s) => (s.built ? s.hp : 0));
  const res = playBot(manifest, profile, seed, {
    ...opts,
    onTick: (st, brain, events) => {
      opts.onTick?.(st, brain, events);
      const now = secHp(st);
      for (const e of events) {
        if (e.t === "wave_started") {
          if (cur) { cur.endTick = st.tick; cur.carryOver = st.hostiles.filter((h) => h.id < seenId).length; }
          cur = waves[e.idx - 1] ?? null;
          if (!cur) continue;
          const secs = sections(st);
          cur.started = true;
          cur.startTick = st.tick;
          cur.scrap = st.currency;
          cur.towers = st.structures.filter((s) => s.type.startsWith("struct.ranged_defense")).length;
          cur.guards = st.residents.filter((r) => content.roles[r.role]?.behavior === "guard").length;
          cur.gateHp = secs.reduce((a, s, i) => a + (s.gate ? now[i]! : 0), 0);
          cur.gateHpMax = secs.reduce((a, s) => a + (s.gate && s.built ? s.hpMax : 0), 0);
          cur.baseHp = st.meters.baseHealth;
        } else if (e.t === "wave_cleared" && cur && cur.clearedTick < 0) cur.clearedTick = st.tick;
      }
      if (cur) {
        for (const h of st.hostiles) if (h.id >= seenId) { cur.attackers++; cur.hpSpawned += h.hpMax; }
        if (prevSec.length === now.length) {
          const secs = sections(st);
          now.forEach((hp, i) => {
            const d = Math.max(0, prevSec[i]! - hp);
            if (secs[i]!.gate) cur!.gateDamage += d; else cur!.wallDamage += d;
          });
        }
        if (prevBase >= 0) cur.baseDamage += Math.max(0, prevBase - st.meters.baseHealth);
      }
      seenId = st.nextHostileId;
      alive = st.hostiles.length;
      prevSec = now;
      prevBase = st.meters.baseHealth;
    },
  });
  if (cur) { (cur as WaveTrace).endTick = res.ticks; (cur as WaveTrace).carryOver = alive; }
  for (const w of waves) w.leak = w.gateDamage + w.wallDamage + w.baseDamage;
  return { profile: profile.name, seed, won: res.won, ticks: res.ticks, hash: res.hash, waves };
}
