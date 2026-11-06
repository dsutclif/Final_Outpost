import { content, type Manifest } from "@fo/content";
import { TPS, type ObjectiveState, type State } from "@fo/sim";
import { clockText, countName, listText, objectiveText, type Skin } from "@fo/skins";

// Star objectives as the player sees them. The sim owns progress, done and failed
// (state.objectives, starsOf); this module only names them in skin words and formats counters.

export interface ObjectiveView {
  id: string;
  kind: string;
  /** Skin label with params filled in (the manifest label wins). */
  label: string;
  /** Live counter ("2/5", "0:45/2:00", or the time left for a time target); "" when there is none worth showing. */
  counter: string;
  done: boolean;
  failed: boolean;
  /** Icon family for the intro and result cards. */
  icon: "goal" | "clock" | "heat" | "freeze" | "shield" | "target";
  /** Threshold 0..1 for floor guards (heat_floor, hp_floor), else null. */
  floor: number | null;
}

type Params = Record<string, number | string>;
interface ManifestObjective { id: string; kind: string; params?: Params; label?: string }

/** Kinds whose progress/target are ticks, shown as clocks. */
const TICK_KINDS = new Set(["survive", "heat_hold", "converters_running", "automate"]);
const CLOCK_ICON = new Set(["time_target", "earn_within", "fuel_full", "survive", "heat_hold", "automate", "converters_running"]);

function iconOf(kind: string, index: number): ObjectiveView["icon"] {
  if (index === 0) return "goal";
  if (CLOCK_ICON.has(kind)) return "clock";
  if (kind === "heat_floor" || kind === "settlement_never_freezes") return "heat";
  if (kind === "no_colonist_freezes") return "freeze";
  if (kind === "hp_floor" || kind === "no_injuries" || kind === "gate_held") return "shield";
  return "target";
}

/** The manifest's objectives (empty for a level that predates them). */
export function manifestObjectives(m: Manifest): ManifestObjective[] {
  return ((m as unknown as { objectives?: ManifestObjective[] }).objectives ?? []);
}

/** Pad id to the struct it builds, for the "Build the {target}" template. */
const padBuild = (m: Manifest) => (pad: string): string | null => {
  const e = m.entities.find((x) => x.id === pad);
  return e && e.type === "pad.build" ? e.build : null;
};

/** Label of a manifest objective in the skin's words, naming this level's own machines, goods and sources. */
export function labelOf(m: Manifest, skin: Skin, o: ManifestObjective): string {
  return objectiveText(skin, o.kind, o.params ?? {}, o.label, padBuild(m), levelVars(m, skin, o));
}

type ConvDef = { inputs?: string[]; output?: string };
const convs = (): Record<string, ConvDef> => content.converters as Record<string, ConvDef>;

/** Converter types this level places or builds (conv.level is an upgrade pad, not a machine). */
export function levelMachines(m: Manifest): string[] {
  const out = new Set<string>();
  for (const e of m.entities as { type: string; build?: string }[]) {
    const t = e.type.startsWith("conv.") ? e.type : e.type === "pad.build" && e.build?.startsWith("conv.") ? e.build : null;
    if (t && t !== "conv.level" && convs()[t]) out.add(t);
  }
  return [...out];
}

/**
 * Placeholders a goal fills from the level (Doug, 2026-11-05: goals name the real thing): {anyMachine}
 * "galley, smelter or parts works", {running}, {product}, {sources}, {goods}.
 */
function levelVars(m: Manifest, skin: Skin, o: ManifestObjective): Record<string, string> {
  const p = o.params ?? {}, n = typeof p["n"] === "number" ? p["n"] : 1, k = typeof p["k"] === "number" ? p["k"] : 1;
  const machines = levelMachines(m), names = machines.map((c) => countName(skin, c));
  const vars: Record<string, string> = { anyMachine: names.length ? listText(names, "or") : "converter" };
  // converters_running counts machines (and on some levels staffed sources): name them when they are the count
  vars["running"] = names.length === k ? `the ${listText(names)}` : names.length > k ? `${k} of the ${listText(names)}` : `${k} jobs`;
  const outputs = new Set(machines.map((c) => convs()[c]?.output).filter((r): r is string => !!r));
  if (o.kind === "produce" && typeof p["res"] === "string") vars["product"] = countName(skin, p["res"], n);
  if (o.kind === "chain") {
    // advanced goods are made from another machine's output
    const adv = machines.filter((c) => convs()[c]?.inputs?.some((r) => outputs.has(r))).map((c) => convs()[c]!.output!).filter(Boolean);
    vars["product"] = adv.length ? listText(adv.map((r) => countName(skin, r, n)), "or") : "advanced goods";
  }
  if (o.kind === "unlock") {
    const ents = m.entities as { type: string; build?: string; id: string; target?: string }[];
    const kinds = [...new Set(ents.filter((e) => e.type === "pad.build" && e.build === "node.enable").map((e) => ents.find((x) => x.id === e.target)?.type).filter((t): t is string => !!t))];
    vars["sources"] = kinds.length ? listText(kinds.map((t) => countName(skin, t, n)), "or") : "sources";
  }
  if (o.kind === "sell_each") {
    const shelf = (m.entities as { type: string; sells?: string[] }[]).find((e) => e.type === "sink.sales_point");
    vars["goods"] = shelf?.sells?.length ? listText(shelf.sells.map((r) => countName(skin, r, 2))) : "every good";
  }
  // the haul goal counts whatever couriers carry out of the warehouse: name what goes into it
  if (o.kind === "haul") {
    const goods = typeof p["res"] === "string" ? [p["res"]] : depotGoods(m);
    vars["goods"] = goods.length ? listText(goods.map((r) => countName(skin, r, n))) : "goods";
  }
  return vars;
}

/** Resources workers bring to the warehouse: their source node's yield or their machine's output. */
function depotGoods(m: Manifest): string[] {
  const out = new Set<string>();
  for (const e of m.entities) {
    if (e.type !== "pad.hire" || e.role?.to !== "store.depot" || !e.role.from) continue;
    const from = e.role.from;
    const pad = m.entities.find((x) => x.id === from);
    const conv = pad?.type === "pad.build" ? pad.build : from;
    const res = (content.nodes as Record<string, { yields?: string }>)[from]?.yields
      ?? (content.converters as Record<string, { output?: string }>)[conv]?.output;
    if (res) out.add(res);
  }
  return [...out];
}

/** Intro-card list: the manifest's objectives before any play. */
export function introObjectives(m: Manifest, skin: Skin): ObjectiveView[] {
  return manifestObjectives(m).map((o, i) => ({
    id: o.id, kind: o.kind, label: labelOf(m, skin, o), counter: "", done: false, failed: false,
    icon: iconOf(o.kind, i), floor: floorOf(o),
  }));
}

function floorOf(o: ManifestObjective): number | null {
  const pct = o.params?.["pct"];
  return (o.kind === "heat_floor" || o.kind === "hp_floor") && typeof pct === "number" ? pct / 100 : null;
}

const clockTicks = (t: number): string => clockText(t / TPS);

function counterOf(o: ObjectiveState): string {
  if (o.kind === "time_target") return ""; // the countdown lives in its own chip
  if (o.target <= 1) return "";
  if (TICK_KINDS.has(o.kind)) return `${clockTicks(o.progress)}/${clockTicks(o.target)}`;
  return `${Math.min(o.progress, o.target)}/${o.target}`;
}

/** Live objectives from state.objectives, named from the manifest; [] when the sim lists none. */
export function liveObjectives(st: State, m: Manifest, skin: Skin): ObjectiveView[] {
  const list = st.objectives;
  if (!Array.isArray(list) || !list.length) return [];
  const defs = manifestObjectives(m);
  return list.map((o, i) => {
    const def = defs.find((d) => d.id === o.id) ?? defs[i] ?? { id: o.id, kind: o.kind };
    return { id: o.id, kind: o.kind, label: labelOf(m, skin, def), counter: counterOf(o), done: o.done, failed: o.failed, icon: iconOf(o.kind, i), floor: floorOf(def) };
  });
}

/** Inline icon for the cards (currentColor; 16px). */
export function iconSvg(icon: ObjectiveView["icon"]): string {
  const p: Record<ObjectiveView["icon"], string> = {
    goal: '<path d="M5 3v18M5 4h12l-2.5 4L17 12H5" />',
    clock: '<circle cx="12" cy="13" r="8" /><path d="M12 8v5l3 2M9 2h6" />',
    heat: '<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-6 1-10z" />',
    freeze: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2" />',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />',
    target: '<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.5" />',
  };
  return `<svg class="oic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${p[icon]}</svg>`;
}
