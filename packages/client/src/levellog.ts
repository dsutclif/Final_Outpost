import type { Compiled, SimEvent } from "@fo/sim";
import { nameOf, uiText, workerName, type Skin } from "@fo/skins";

// The level log shown in the Help sheet (R5 #12): the milestones of this attempt, built from sim
// events as they fire. Only the few that matter to a stuck player are kept; the words are in the skin
// (ui keys log_*), nothing here names a thing.

export interface LogLine { tick: number; text: string }

/** Oldest lines drop off past this many. */
export const LOG_MAX = 40;

/** The log line for an event, or null for the many events that are not milestones. `goal` is the label of an objective event's goal. */
export function logText(e: SimEvent, skin: Skin, cp: Compiled, goal = ""): string | null {
  const t = (key: string, vars: Record<string, string | number> = {}) => uiText(skin, `log_${key}`, vars);
  switch (e.t) {
    case "built": return t("built", { name: nameOf(skin, e.build) });
    case "hired": return t("hired", { name: workerName(skin, e.role, {}) });
    case "unlocked": { const ty = cp.entityById[e.target]?.type; return ty ? t("unlocked", { name: nameOf(skin, ty) }) : null; }
    case "core_upgraded": return t("coreUp", { n: e.level });
    case "zone_cleared": return t("zone");
    case "core_lit": return t("coreLit");
    case "core_fuel_out": return t("fuelOut");
    case "core_fuel_restored": return t("fuelBack");
    case "objective": return e.done ? t("goalDone", { goal }) : e.failed ? t("goalMissed", { goal }) : null;
    case "wave_started": return t("waveStart", { n: e.idx + 1 });
    case "wave_cleared": return t("waveClear", { n: e.idx + 1 });
    case "barrier_built": return t("wallUp");
    case "barrier_broken": return t("wallDown");
    case "guard_died": return t("guardLost");
    case "hazard_start": return t("storm");
    default: return null;
  }
}

/** Append a line, dropping the oldest past LOG_MAX and ignoring an immediate repeat of the last line. */
export function pushLog(log: LogLine[], tick: number, text: string | null): void {
  if (!text || log.at(-1)?.text === text) return;
  log.push({ tick, text });
  if (log.length > LOG_MAX) log.shift();
}
