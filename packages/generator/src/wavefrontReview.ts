import { DIRS, DIRS_BACK, SALVAGE_KIND, STEP, coreWave, placeWavefront, placementOrder, wavefronts, type TraceStep, type WfInput, type WfResult } from "./wavefront.js";

/**
 * Trace review for the wavefront placement loop (outpost-ops#202). Replays a placeWavefront trace and checks the agreed rules:
 *  - wavefronts follow first appearance, except the Core, which is its own wavefront numbered as their midpoint (Doug 2026-11-17);
 *    they are placed Core first, then those before it (nearest first), then those after it; in order of appearance inside a wave
 *    (a belt's far end straight after its start machine);
 *  - a locked wavefront never moves; repair moves only a building of the current wavefront;
 *  - repair distances are multiples of STEP (6) and increase by one step at a time; per distance the directions go south, south-east, east
 *    (north, north-west, west for wavefronts placed north-west of the Core);
 *  - every pad is visible in its active window: no seed rejected, no `unresolved` step, no hidden pad left in the final layout.
 * `rules` holds violations of the first three; `pads` holds visibility failures (reported separately).
 */
export interface Review { seed: number; rejected: string | null; rules: string[]; pads: string[]; steps: number }

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
type Move = Extract<TraceStep, { t: "move" }>;

export function reviewTrace(input: WfInput, res: Pick<WfResult, "trace" | "positions" | "hidden" | "rejected">, seed = 0): Review {
  const rules: string[] = [], pads: string[] = [];
  const tr = res.trace, byId = new Map(input.buildings.map((b) => [b.id, b]));
  const expected = wavefronts(input.buildings.filter((b) => b.kind !== SALVAGE_KIND && !(input.walls && b.gateRock)));
  const ci = coreWave(expected), order = placementOrder(expected), firstOf = new Map<number, number>(), locks = new Set<number>();
  const waveOf = new Map<string, number>(), pos = new Map<string, [number, number]>(), snap = new Map<string, [number, number]>();
  const placeOrder: string[] = [], expectOrder: string[] = [];
  let cur = -1, wavesSeen = 0, shift: [number, number] = [0, 0];
  // one repair = one blocker's search: its tries must run (6 south, 6 south-east, 6 east, 12 south, ...) without a gap
  let seg: { id: string; next: number; last: Move | null; start: [number, number] } | null = null;
  const bad = (i: number, s: string) => rules.push(`step ${i} (${tr[i]!.t}): ${s}`);
  tr.forEach((s, i) => {
    switch (s.t) {
      case "wave": {
        const exp = expected[s.n];
        if (s.n !== order[wavesSeen]) bad(i, `wave ${s.n} out of sequence (expected ${order[wavesSeen]})`);
        wavesSeen++;
        if (!exp || exp.map((b) => b.id).join() !== s.ids.join()) bad(i, `wave ${s.n} holds [${s.ids}] but first appearance gives [${exp?.map((b) => b.id) ?? ""}]`);
        firstOf.set(s.n, Math.min(...s.ids.map((id) => byId.get(id)?.appear ?? Infinity)));
        let lastApp = -Infinity;
        for (const id of s.ids) {
          waveOf.set(id, s.n);
          const a = byId.get(id)?.appear ?? 0;
          if (byId.get(id)?.beside) continue; // a belt's far end follows its start machine
          if (a < lastApp) bad(i, `${id} (appears ${a}) is listed after a later appearance (${lastApp})`);
          lastApp = Math.max(lastApp, a);
        }
        placeOrder.push(...s.ids);
        cur = s.n; seg = null;
        break;
      }
      case "place":
        expectOrder.push(s.id); pos.set(s.id, [s.at[0], s.at[1]]); seg = null;
        if (waveOf.get(s.id) !== cur) bad(i, `${s.id} placed during wave ${cur} but belongs to wave ${waveOf.get(s.id)}`);
        break;
      case "hidden": seg = null; break;
      case "move": case "overlap": {
        const w = waveOf.get(s.id);
        if (w === undefined || locks.has(w)) bad(i, `${s.id} (wave ${w}) moved after its wave was locked`);
        else if (w !== cur) bad(i, `${s.id} (wave ${w}) moved during wave ${cur}`);
        if (!seg || seg.id !== s.id) seg = { id: s.id, next: 0, last: null, start: pos.get(s.id) ?? [NaN, NaN] };
        const dirs = ci >= 0 && w !== undefined && w < ci ? DIRS_BACK : DIRS, di = dirs.findIndex((x) => x.name === s.dir);
        if (s.d % STEP !== 0 || s.d <= 0) bad(i, `distance ${s.d} is not a positive multiple of ${STEP}`);
        else if (di < 0) bad(i, `unknown direction ${s.dir}`);
        else {
          const key = (s.d / STEP - 1) * 3 + di;
          if (key !== seg.next) {
            const want = `${(Math.floor(seg.next / 3) + 1) * STEP} ${dirs[seg.next % 3]!.name}`;
            bad(i, `${s.id} tried ${s.d} ${s.dir} but the order of tries expects ${want} (distances 6, 12, ...; ${dirs.map((x) => x.name).join(", ")} at each)`);
          }
          seg.next = key + 1;
        }
        if (s.t === "move") {
          const dv = di >= 0 ? dirs[di]!.d : [NaN, NaN];
          if (!near(s.to[0], seg.start[0] + dv[0]! * s.d) || !near(s.to[1], seg.start[1] + dv[1]! * s.d)) bad(i, `${s.id} moved to ${s.to}, which is not ${s.d} ${s.dir} of ${seg.start}`);
          seg.last = s;
        }
        break;
      }
      case "fixed":
        if (s.pushed) {
          const w = waveOf.get(s.pushed);
          if (w === undefined || locks.has(w)) bad(i, `${s.pushed} pushed although its wave is locked`);
          if (!seg || seg.id !== s.pushed || !seg.last) bad(i, `${s.pushed} reported pushed with no move step`);
          else {
            if (seg.last.d !== s.d || seg.last.dir !== s.dir) bad(i, `fixed says ${s.d} ${s.dir} but the last move was ${seg.last.d} ${seg.last.dir}`);
            pos.set(s.pushed, [seg.last.to[0], seg.last.to[1]]);
          }
        }
        seg = null; break;
      case "unresolved": pads.push(`step ${i}: pad ${s.pad} unresolved (${s.why})`); seg = null; break;
      case "reject": seg = null; break;
      case "lock":
        locks.add(s.n);
        for (const [id, w] of waveOf) if (locks.has(w) && pos.has(id)) snap.set(id, [...pos.get(id)!] as [number, number]);
        seg = null; break;
      case "shift": shift = [shift[0] + s.d[0], shift[1] + s.d[1]]; break;
      default: break;
    }
  });
  // wavefront numbers (the Core's aside) follow first appearance
  let prevFirst = -Infinity;
  for (let n = 0; n < expected.length; n++) {
    if (n === ci || !firstOf.has(n)) continue;
    if (firstOf.get(n)! <= prevFirst) rules.push(`wave ${n} starts at appearance ${firstOf.get(n)}, not after the wave before it (${prevFirst})`);
    prevFirst = firstOf.get(n)!;
  }
  // placement order: wave by wave in order (a rejected seed stops early, so compare the prefix)
  if (expectOrder.join() !== placeOrder.slice(0, expectOrder.length).join()) rules.push(`placement order [${expectOrder}] differs from wavefront order [${placeOrder}]`);
  if (!res.rejected && expectOrder.length !== placeOrder.length) rules.push(`${placeOrder.length - expectOrder.length} building(s) of the wavefronts were never placed`);
  // locked buildings never move: the final position (less the rigid ring shift) equals the position at the lock; the replay reproduces the result
  const off = (f: [number, number], p: [number, number]) => !near(f[0] - shift[0], p[0]) || !near(f[1] - shift[1], p[1]);
  for (const [id, p] of snap) { const f = res.positions[id]; if (f && off(f, p)) rules.push(`${id} locked at ${p} but ends at ${f}${shift[0] || shift[1] ? ` (shift ${shift})` : ""}`); }
  if (!res.rejected) for (const [id, p] of pos) { const f = res.positions[id]; if (f && off(f, p)) rules.push(`${id}: trace replay gives ${p} but the result has ${f}`); }
  if (res.rejected) {
    const r = [...tr].reverse().find((x) => x.t === "reject") as Extract<TraceStep, { t: "reject" }> | undefined;
    pads.push(`seed rejected: ${res.rejected.kind} ${res.rejected.id}${res.rejected.pad ? ` for pad ${res.rejected.pad}` : ""}${r ? ` (${r.dir} at ${r.d})` : ""}`);
  }
  for (const h of res.hidden) pads.push(`pad ${h} is hidden in the final layout`);
  return { seed, rejected: res.rejected ? `${res.rejected.kind} ${res.rejected.id}` : null, rules, pads, steps: tr.length };
}

/** Run the loop (site checks on, repair always, trace on) for one seed and review its trace. */
export function reviewSeed(input: WfInput, seed: number): Review & { result: WfResult } {
  const result = placeWavefront(input, { seed, siteChecks: true, repair: "always", trace: true });
  return { ...reviewTrace(input, result, seed), result };
}
