import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { within } from "../fixed.js";
import { between } from "../rng.js";
import type { State } from "../state.js";
import { admitRecruit, freeSlots, moveAgent, newResident } from "./common.js";

/** Waiting residents walk to the waiting area and move in as soon as a slot frees; releasing containers free their recruit. */
export function stepHousing(st: State, cp: Compiled, out: SimEvent[]): void {
  for (const r of st.residents) {
    if (r.status !== "waiting") continue;
    if (freeSlots(st, cp) > 0) {
      r.status = "ok";
      r.role = "idle";
      out.push({ t: "moved_in", resident: r.id });
      continue;
    }
    moveAgent(st, cp, r.pos, cp.waiting, cp.residents.waitingSpeed, cp.residents.arrive);
  }
  for (const c of [...st.captures]) {
    if (c.state !== "releasing") continue;
    c.timer--;
    if (c.timer > 0) continue;
    const r = newResident(st, c.pos, "idle", "ok", "rescue");
    admitRecruit(st, cp, r, out);
    out.push({ t: "released", capture: c.id, resident: r.id, at: { ...c.pos } });
    st.captures.splice(st.captures.indexOf(c), 1);
  }
}

/** Recruits appear at the arrivals gate on a timer, queue, and are admitted when the player stands by the gate. */
export function stepGate(st: State, cp: Compiled, out: SimEvent[]): void {
  const g = cp.gate;
  if (!g) return;
  const T = st.timers;
  T.gateAcc--;
  if (T.gateAcc <= 0 && T.gateLeft > 0 && st.gateQueue.length < g.queueMax) {
    T.gateAcc = g.everyTicks;
    T.gateLeft--;
    const pos = { x: g.pos.x + between(st.rng, -g.spawnSpread, g.spawnSpread + 1), y: cp.map.h + g.spawnOffsetY };
    const r = newResident(st, pos, "idle", "arriving", "gate");
    st.gateQueue.push(r.id);
  }
  st.gateQueue.forEach((id, k) => {
    const r = st.residents.find((x) => x.id === id)!;
    moveAgent(st, cp, r.pos, { x: g.pos.x - g.queueSpacing + k * g.queueSpacing, y: g.pos.y + g.queueOffsetY }, cp.residents.gateSpeed, cp.residents.arrive);
  });
  if (st.gateQueue.length > 0 && within(st.player.pos, { x: g.pos.x, y: g.pos.y + g.admitOffsetY }, g.admitRange)) {
    const id = st.gateQueue.shift()!;
    const r = st.residents.find((x) => x.id === id)!;
    out.push({ t: "recruit_arrived", resident: r.id, at: { ...r.pos } });
    admitRecruit(st, cp, r, out);
  }
}
