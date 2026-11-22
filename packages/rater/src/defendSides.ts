import { playBot, type BotOptions, type BotProfile } from "@fo/bots";

// Defend redesign S2 (outpost-ops#273): how well a bot reads the random attack side. Report only (joins no rating).
// Reads state and events through onTick; never writes, so the run is tick-for-tick the untraced run.

export interface SideMetrics {
  /** Waves warned (random-side mode only; 0 in rotate mode, where there is no warning). */
  warned: number;
  /** Mean seconds from wave_warning until the commander stands on the warned side of the core (dominant axis); a wave where it never got there before the start counts the full warning. null when no wave was warned. */
  sideReadTime: number | null;
  /** Share of warned waves where the commander was NOT on the warned side when the wave started. null when none warned. */
  wrongSideShare: number | null;
  won: boolean;
  hash: string;
}

const onSide = (side: string, dx: number, dy: number): boolean => (Math.abs(dy) >= Math.abs(dx) ? (side === "n" ? dy < 0 : side === "s" && dy > 0) : side === "w" ? dx < 0 : side === "e" && dx > 0);

export function sideMetrics(manifest: unknown, profile: BotProfile, seed: number, opts: BotOptions = {}): SideMetrics {
  let cur: { side: string; tick: number; read: number } | null = null;
  const reads: number[] = [];
  let wrong = 0;
  const res = playBot(manifest, profile, seed, {
    ...opts,
    onTick: (st, brain, events) => {
      opts.onTick?.(st, brain, events);
      for (const e of events) {
        if (e.t === "wave_warning") cur = { side: e.side, tick: st.tick, read: -1 };
        else if (e.t === "wave_started" && cur) {
          const ok = cur.read >= 0;
          reads.push((ok ? cur.read : st.tick - cur.tick) / 20);
          if (!ok) wrong++;
          cur = null;
        }
      }
      if (cur && cur.read < 0 && onSide(cur.side, st.player.pos.x - st.core.pos.x, st.player.pos.y - st.core.pos.y)) cur.read = st.tick - cur.tick;
    },
  });
  const n = reads.length;
  return { warned: n, sideReadTime: n ? reads.reduce((a, b) => a + b, 0) / n : null, wrongSideShare: n ? wrong / n : null, won: res.won, hash: res.hash };
}
