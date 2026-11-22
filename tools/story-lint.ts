// Story-level lint (outpost-ops#345): what the bot-win check cannot see in a hand-built story level.
// Pure: takes the level's manifest and the skin's tip strings, returns warnings. Wired into
// `pnpm levels:check` for levels/story as WARNINGS only (they never fail the run) until the levels are clean.
// No goal-noun rule (Doug): a missing fuel cell is fixed by adding real ones, not by checking goal names.

interface Ent { type: string; id?: string; at?: [number, number]; site?: [number, number]; build?: string; target?: string; cost?: Record<string, number>; role?: { role?: string; from?: string; to?: string }; route?: [number, number][]; gates?: number[] }
interface Obj { id: string; kind: string; params?: Record<string, unknown>; label?: string }
export interface StoryManifest { id: string; entities: Ent[]; objectives?: Obj[]; modules?: string[]; waves?: unknown[]; params?: Record<string, unknown> }
export interface StoryWarning { level: string; rule: string; subject: string; message: string }

/** World units a job or training pad may lie from the building it serves (cook 100, cashier 130 in the shipped Level 4). */
export const PAD_NEAR = 150;
/** World units a turret pad or its site may lie from the nearest road polyline. */
export const TURRET_NEAR_ROAD = 140;
/** A decor model that reads as scrap, near a collectable heap, looks collectable (render-3d renderer.ts SCRAP_DECOR). */
export const SCRAP_LOOKALIKE_DECOR: ReadonlySet<string> = new Set(["decor.ship_scrap", "decor.ship_wreck", "decor.scrap_field"]);
export const SCRAP_LOOKALIKE_NEAR = 250;
const COLLECTABLE_SCRAP = new Set(["node.fuel_scrap", "node.salvage_pile"]);
/** Resources the HUD strip shows a chip for (client hud.ts). Add res.salvage here when the scrap chip lands (card C1). */
export const HUD_CHIP_RES: ReadonlySet<string> = new Set(["res.currency"]);

const dist = (a: readonly [number, number], b: readonly [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return dist(p, [a[0] + t * dx, a[1] + t * dy]);
}

/** Nouns a help line can name, and what in the level makes each one real. */
const NOUNS: { re: RegExp; noun: string; has: (m: StoryManifest) => boolean }[] = [
  { re: /\bgates?\b/i, noun: "gate", has: (m) => m.entities.some((e) => e.type === "struct.gate" || (e.type === "barrier.line" && (e.gates?.length ?? 0) > 0)) },
  { re: /\bwalls?\b/i, noun: "wall", has: (m) => m.entities.some((e) => e.type === "barrier.line") },
  { re: /\bturrets?\b/i, noun: "turret", has: (m) => m.entities.some((e) => e.build?.startsWith("struct.ranged_defense")) },
  { re: /\bguard post\b/i, noun: "guard post", has: (m) => m.entities.some((e) => e.type === "struct.barracks" || e.build?.startsWith("struct.barracks")) },
  { re: /\bmed bay\b/i, noun: "med bay", has: (m) => m.entities.some((e) => e.type === "struct.medical" || e.build === "struct.medical") },
  { re: /\bkiosk\b/i, noun: "kiosk", has: (m) => m.entities.some((e) => e.type === "sink.sales_point") },
  { re: /\brockslides?\b/i, noun: "rockslide", has: (m) => m.entities.some((e) => e.type === "zone.blocked") },
  { re: /\brock hoppers?\b/i, noun: "rock hopper", has: (m) => m.entities.some((e) => e.type === "zone.prey") },
  { re: /\braiders?\b/i, noun: "raider", has: (m) => (m.waves?.length ?? 0) > 0 },
  { re: /\bgrow domes?\b/i, noun: "grow dome", has: (m) => m.entities.some((e) => e.type === "node.food_source" || e.build === "node.enable") },
  { re: /\bhab pods?\b/i, noun: "hab pod", has: (m) => m.entities.some((e) => e.type === "struct.landmark" || (e.type === "pad.build" && /hab|housing|landmark/.test(e.build ?? ""))) },
  { re: /\bwarehouse\b/i, noun: "warehouse", has: (m) => m.entities.some((e) => /warehouse/.test(e.type) || /warehouse/.test(e.build ?? "")) },
  { re: /\bpods?\b/i, noun: "pod", has: (m) => m.entities.some((e) => e.type.startsWith("capture.") || e.type === "struct.landmark" || /hab/.test(e.build ?? "")) },
];

export function lintStory(m: StoryManifest, tips: { module: Record<string, string>; kiln: Record<string, string> }): StoryWarning[] {
  const out: StoryWarning[] = [];
  const warn = (rule: string, subject: string, message: string): void => { out.push({ level: m.id, rule, subject, message }); };
  const byId = new Map(m.entities.filter((e) => e.id).map((e) => [e.id!, e]));

  // 1. job and training pads near the building they serve
  const buildings = m.entities.filter((e) => e.at && (e.type.startsWith("conv.") || e.type === "sink.sales_point" || e.type === "struct.barracks" || (e.type === "pad.build" && e.build?.startsWith("conv."))));
  for (const p of m.entities.filter((e) => e.type === "pad.hire" && e.at)) {
    const want = [p.role?.to, p.role?.from, p.role?.role === "role.defender" ? "struct.barracks" : undefined].filter((x): x is string => !!x);
    const owners = buildings.filter((b) => want.some((w) => b.type === w || b.build === w));
    if (owners.length === 0) continue; // a harvesting job: its node is the owner, not checked here
    const d = Math.min(...owners.map((b) => dist(p.at!, b.at!)));
    if (d > PAD_NEAR) warn("pad-far", p.id ?? "pad.hire", `job pad ${p.id} is ${Math.round(d)} from its building (limit ${PAD_NEAR})`);
  }

  // 2. turrets near a road (a road is a kiosk's customer route)
  const roads = m.entities.filter((e) => e.route && e.route.length > 1);
  for (const t of m.entities.filter((e) => e.type === "pad.build" && e.build?.startsWith("struct.ranged_defense"))) {
    const pts = [t.at, t.site].filter((q): q is [number, number] => !!q);
    if (roads.length === 0) { warn("turret-off-road", t.id ?? "turret", `turret ${t.id} but the level has no road`); continue; }
    const d = Math.min(...pts.flatMap((q) => roads.flatMap((r) => r.route!.slice(1).map((b, i) => segDist(q, r.route![i]!, b)))));
    if (d > TURRET_NEAR_ROAD) warn("turret-off-road", t.id ?? "turret", `turret ${t.id} is ${Math.round(d)} from the nearest road (limit ${TURRET_NEAR_ROAD})`);
  }

  // 3. a goal that spends or counts a resource needs that resource's HUD chip
  const need = new Map<string, string>();
  for (const e of m.entities) if (e.type.startsWith("pad.") && e.cost) for (const r of Object.keys(e.cost)) if (!need.has(r)) need.set(r, `pad ${e.id}`);
  for (const o of m.objectives ?? []) { const r = o.params?.["res"]; if (typeof r === "string" && !need.has(r)) need.set(r, `goal ${o.id}`); }
  for (const [r, who] of need) if (!HUD_CHIP_RES.has(r)) warn("chip-missing", r, `${who} needs ${r} but the HUD shows no chip for it`);

  // 4. nouns in the help text (modules the level turns on) and goal labels exist in the level
  const lines: { src: string; text: string }[] = [];
  for (const mod of m.modules ?? []) for (const [k, set] of [["tip", tips.module], ["kiln", tips.kiln]] as const) if (set[mod]) lines.push({ src: `${k}:${mod}`, text: set[mod]! });
  for (const o of m.objectives ?? []) if (o.label) lines.push({ src: `goal:${o.id}`, text: o.label });
  for (const l of lines) for (const n of NOUNS) if (n.re.test(l.text) && !n.has(m)) warn("help-noun-missing", `${l.src}/${n.noun}`, `"${l.text.slice(0, 60)}" names a ${n.noun}, but this level has none`);

  // 5. build vs unlock wording: a goal that unlocks a locked source must not say "Build", and the reverse
  for (const o of m.objectives ?? []) {
    if (o.label && o.kind === "unlock" && /^\s*build\b/i.test(o.label)) warn("build-vs-unlock", o.id, `goal "${o.label}" unlocks something; the guide arrow and pad say "Unlock"`);
    if (o.label && o.kind === "build" && /^\s*unlock\b/i.test(o.label)) warn("build-vs-unlock", o.id, `goal "${o.label}" builds something; the pad says "Build"`);
    const target = o.kind === "build" && typeof o.params?.["target"] === "string" ? byId.get(o.params["target"]) : undefined;
    if (target?.build === "node.enable") warn("build-vs-unlock", o.id, `goal builds "${target.id}", but its pad unlocks a source`);
  }

  // 6. decor that looks like collectable scrap, close to real scrap
  const heaps = m.entities.filter((e) => COLLECTABLE_SCRAP.has(e.type) && e.at);
  for (const d of m.entities.filter((e) => SCRAP_LOOKALIKE_DECOR.has(e.type) && e.at)) {
    const near = heaps.filter((h) => dist(d.at!, h.at!) <= SCRAP_LOOKALIKE_NEAR);
    if (near.length > 0) warn("decor-looks-like-scrap", d.id ?? d.type, `decor ${d.id} (${d.type}) lies within ${SCRAP_LOOKALIKE_NEAR} of ${near.length} collectable heap(s), e.g. ${near[0]!.id}; players take it for scrap`);
  }
  return out;
}
