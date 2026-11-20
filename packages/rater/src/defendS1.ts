import { playBot, type BotOptions, type BotProfile, type BotResult } from "@fo/bots";
import type { State } from "@fo/sim";

// Defend redesign S1 rater metrics (report only, outpost-ops#264), read from one observed run and never written back:
//  liveWavesPeak    most waves on the field at once (1 with maxLive 1)
//  overlapSeconds   seconds two or more waves were live together
//  coinsToDefence   share of the coins paid into pads that went to tower pads (0 when no coins were paid)

export interface S1Metrics { liveWavesPeak: number; overlapSeconds: number; coinsToDefence: number }

type Loose = Record<string, any>;

export function s1Metrics(manifest: unknown, profile: BotProfile, seed: number, opts: BotOptions = {}): { metrics: S1Metrics; result: BotResult } {
  let peak = 0, overlapTicks = 0, last: State | null = null;
  const result = playBot(manifest, profile, seed, {
    ...opts,
    onTick: (st, brain, ev) => {
      opts.onTick?.(st, brain, ev);
      last = st;
      // maxLive 1 keeps no live list: one wave is live exactly while `active`
      const live = st.waves.live ? st.waves.live.length : st.waves.active ? 1 : 0;
      if (live > peak) peak = live;
      if (live >= 2) overlapTicks++;
    },
  });
  const build = new Map<string, string>();
  for (const e of ((manifest as Loose)["entities"] ?? []) as Loose[]) if (e["type"] === "pad.build") build.set(String(e["id"]), String(e["build"] ?? ""));
  let tower = 0, all = 0;
  for (const p of (last as State | null)?.pads ?? []) {
    const coins = p.paid["res.currency"] ?? 0;
    all += coins;
    if (build.get(p.id)?.startsWith("struct.ranged_defense")) tower += coins;
  }
  return { metrics: { liveWavesPeak: peak, overlapSeconds: overlapTicks / 30, coinsToDefence: all === 0 ? 0 : tower / all }, result };
}
