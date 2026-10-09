import type { Content } from "@fo/content";

// Ids that exist in the simulation contract (docs/PLAN.md, Contract 1) but are not
// registry keys in content yet. Skins must name these too.
export const CONTRACT_IDS: readonly string[] = [
  "unit.player",
  "unit.resident",
  "unit.prey",
  "role.idle",
  "pad.hire",
  "pad.build",
  "sink.sales_point.register",
  "sink.sales_point.pile",
  "struct.landmark",
  "struct.housing",
  "struct.medical",
  "struct.ranged_defense",
  "struct.training",
  "struct.barracks",
  "store.depot",
  "barrier.line",
  "zone.prey",
  "event.hazard",
  "struct.depot",
  "struct.barrier",
  "struct.gate",
  "capture.recruit_container",
  "hostile.raider_humanoid",
  "hostile.creature",
  "zone.blocked",
  "zone.waiting",
  "meter.lifeline",
  "meter.base_health",
  "hazard.event",
];

// Registries whose keys are already canonical ids (category.function).
const ID_KEYED = /^[a-z]+\.[a-z0-9_]+(\.[a-z0-9_]+)*$/;

/**
 * Every canonical id a skin must name: every key of every id-keyed registry in content
 * (so a registry added later is covered automatically), modules and goal types under
 * `module.` and `goal.` prefixes, and the contract ids above.
 */
export function canonicalIds(c: Content): string[] {
  const out = new Set<string>(CONTRACT_IDS);
  for (const [reg, value] of Object.entries(c as unknown as Record<string, unknown>)) {
    if (reg === "defaults" || reg === "version" || value === null || typeof value !== "object") continue;
    for (const key of Object.keys(value)) {
      if (reg === "modules") out.add(`module.${key}`);
      else if (reg === "goals") out.add(`goal.${key}`);
      else if (ID_KEYED.test(key)) out.add(key);
    }
  }
  return [...out].sort();
}

/** "res.food_raw_1" -> "Food raw 1": the last-resort label when a skin misses an id at runtime. */
export function humanise(id: string): string {
  const last = id.split(".").pop() ?? id;
  const s = last.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}
