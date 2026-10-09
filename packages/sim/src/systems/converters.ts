import type { Compiled } from "../compile.js";
import type { SimEvent } from "../events.js";
import { within, type Vec } from "../fixed.js";
import type { ConverterState, State } from "../state.js";
import { hint } from "./common.js";

export function placeConverter(st: State, cp: Compiled, id: string, type: string, pos: Vec): ConverterState {
  const def = cp.converters[type]!;
  const cv: ConverterState = {
    id, type, pos: { ...pos }, inQ: [], out: 0, acc: 0,
    operatorPos: { x: pos.x + def.operatorOffset.x, y: pos.y + def.operatorOffset.y },
    pickupPos: { x: pos.x + def.pickupOffset.x, y: pos.y + def.pickupOffset.y },
  };
  st.converters.push(cv);
  return cv;
}

/** The player on the operator spot, or an operator bound to this converter type standing on it. */
export function operated(st: State, cp: Compiled, cv: ConverterState): boolean {
  if (within(st.player.pos, cv.operatorPos, cp.convParams.playerOperateRange)) return true;
  const role = cp.converters[cv.type]!.role;
  return st.residents.some((r) =>
    r.status === "ok" && r.role === role && r.assign.to === cv.type && within(r.pos, cv.operatorPos, cp.convParams.operatorRange));
}

export const converterRunnable = (cp: Compiled, cv: ConverterState): boolean =>
  cv.inQ.length > 0 && cv.out < cp.converters[cv.type]!.outCap;

/** Converters turn one input into one output per rate while operated; otherwise they hold. */
export function stepConverters(st: State, cp: Compiled, out: SimEvent[]): void {
  for (const cv of st.converters) {
    const def = cp.converters[cv.type]!;
    if (converterRunnable(cp, cv) && operated(st, cp, cv)) {
      cv.acc++;
      if (cv.acc > def.rateTicks) {
        cv.acc = 0;
        cv.inQ.shift();
        cv.out++;
        out.push({ t: "converted", conv: cv.id, res: def.output });
      }
    } else if (cv.inQ.length > 0 && within(st.player.pos, cv.pos, cp.convParams.hintRange) && !within(st.player.pos, cv.operatorPos, cp.convParams.playerOperateRange)) {
      hint(st, out, "operate_converter");
    }
  }
}
