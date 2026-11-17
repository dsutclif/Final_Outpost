import { TPS } from "@fo/sim";

// Within-level play shape (outpost-ops#151). Pure: takes the first-occurrence beat sheet, the level end in ticks and
// the play-shape beat sheet (151.3, Doug's rule: every wave, and action steps that are not a loop of 4 or fewer
// actions going round again). Phases and the late-beat limit read the play-shape sheet; beat types read first occurrences.

export interface PlayShapeBeat { beat: string; tick: number }
export interface PlayShapeNumbers {
  /** Longest gap between consecutive play-shape beat ticks (first from tick 0, last to the level end) as a share of the level. */
  maxPhaseShare: number;
  beatTypes: number;
  /** Tick of the latest play-shape beat as a share of the level. */
  lastNewBeatShare: number;
}
export interface PlayShapeParams { maxPhaseShare: number; minBeatTypes: number; minBeatTypesShort: number; shortSeconds: number; newBeatAfterShare: number }

const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export function playShapeNumbers(beats: readonly PlayShapeBeat[], endTicks: number, shapeBeats: readonly PlayShapeBeat[] = beats): PlayShapeNumbers {
  // a beat past the stated end stretches the level rather than giving a negative phase
  const end = Math.max(endTicks, ...beats.map((b) => b.tick), ...shapeBeats.map((b) => b.tick), 1);
  const ticks = shapeBeats.map((b) => b.tick).sort((a, b) => a - b);
  const edges = [0, ...ticks, end];
  let longest = 0;
  for (let i = 1; i < edges.length; i++) longest = Math.max(longest, edges[i]! - edges[i - 1]!);
  return {
    maxPhaseShare: r3(longest / end),
    beatTypes: new Set(beats.map((b) => b.beat)).size,
    lastNewBeatShare: r3(ticks.length > 0 ? ticks[ticks.length - 1]! / end : 0),
  };
}

export function playShapeFails(n: PlayShapeNumbers, endTicks: number, p: PlayShapeParams): string[] {
  const out: string[] = [];
  if (n.maxPhaseShare > p.maxPhaseShare) out.push(`phase ${n.maxPhaseShare} > ${p.maxPhaseShare}`);
  const need = endTicks < p.shortSeconds * TPS ? p.minBeatTypesShort : p.minBeatTypes;
  if (n.beatTypes < need) out.push(`beat types ${n.beatTypes} < ${need}`);
  if (n.lastNewBeatShare <= p.newBeatAfterShare) out.push(`no new beat after ${p.newBeatAfterShare} (last ${n.lastNewBeatShare})`);
  return out;
}
