/**
 * The Meshy models each live scene draws (scene/livescene.ts). Kept apart from the scene code so a level can start
 * fetching a scene's models at level start without pulling the scene module in.
 */
export const LIVE_SCENE_MODELS = {
  chip_handoff: ["unit.customer_sela.hi", "unit.player.hi", "res.currency.hi", "unit.customer_sela", "unit.customer", "unit.player", "res.currency"],
  sela_arrival: ["decor.buggy", "decor.buggy_wheel", "decor.buggy_wheel_l", "unit.customer_sela", "unit.customer"],
  warlord_fall: ["hostile.boss_vale", "item.vale_head", "hostile.boss", "item.lieutenant_helmet", "prop.minigun"],
  empty_bays: ["decor.stasis_pod", "decor.stasis_glass"],
  crash_log: ["decor.stasis_pod", "decor.stasis_glass", "unit.player"],
} as const satisfies Record<string, readonly string[]>;

/** The Meshy model ids the live scenes `films` draw (unknown ids add nothing). */
export function liveSceneModels(films: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of films) for (const id of (LIVE_SCENE_MODELS as Record<string, readonly string[]>)[f] ?? []) out.add(id);
  return out;
}
