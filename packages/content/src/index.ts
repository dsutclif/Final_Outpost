import { Content, checkContentRefs } from "./schema.js";
import resources from "../data/resources.json";
import nodes from "../data/nodes.json";
import animals from "../data/animals.json";
import sinks from "../data/sinks.json";
import converters from "../data/converters.json";
import roles from "../data/roles.json";
import customers from "../data/customers.json";
import hostiles from "../data/enemies.json";
import lassoables from "../data/lassoables.json";
import structures from "../data/structures.json";
import upgrades from "../data/upgrades.json";
import events from "../data/events.json";
import consumers from "../data/consumers.json";
import goals from "../data/goals.json";
import objectives from "../data/objectives.json";
import modules from "../data/modules.json";
import defaults from "../data/defaults.json";
import look from "../data/look.json";
import plot from "../data/plot.json";

export * from "./schema.js";
export * from "./manifest.js";

export const CONTENT_VERSION = "0.17.0";

const raw = {
  version: CONTENT_VERSION,
  resources,
  nodes,
  animals,
  sinks,
  converters,
  roles,
  customers,
  hostiles,
  lassoables,
  structures,
  upgrades,
  events,
  consumers,
  goals,
  objectives,
  modules,
  defaults,
};

/** Plot layout data (data/plot.json, written by pnpm plots:build): the generator's slots and footprints, the renderer's pad sizes. */
export interface PlotFile {
  content: Record<"converters" | "structures" | "sinks" | "defaults", Record<string, unknown>>;
  generator: { footprints: Record<string, [number, number, number, number]>; bodies?: Record<string, [number, number, number, number]>; plots: Record<string, { slots: { id: string; dx: number; dy: number }[] }>; cashierPads: [number, number][] };
  render: { pad: number; plate: number };
}
const plotFile = plot as unknown as Partial<PlotFile>;
const plotOn = !!(look as { plotLayout?: { on?: boolean } }).plotLayout?.on && !!plotFile.content && !!plotFile.generator;

/** Content before any plot overrides: the base the layout sandbox and pnpm plots:build work from. */
export const contentBase: Content = Content.parse(raw);
checkContentRefs(contentBase);

/** The plot layout's spots, ranges and pad reach laid over the base (one level deep per entry). */
function withPlot(): typeof raw {
  const over = plotFile.content!;
  const merge = <T extends Record<string, unknown>>(baseSet: T, o: Record<string, unknown> | undefined): T => {
    if (!o) return baseSet;
    const out: Record<string, unknown> = { ...baseSet };
    for (const [k, v] of Object.entries(o)) out[k] = v && typeof v === "object" && !Array.isArray(v) && baseSet[k] && typeof baseSet[k] === "object" ? { ...(baseSet[k] as object), ...(v as object) } : v;
    return out as T;
  };
  return { ...raw, converters: merge(raw.converters, over.converters), structures: merge(raw.structures, over.structures), sinks: merge(raw.sinks, over.sinks), defaults: merge(raw.defaults, over.defaults) };
}

/** The validated content set. Parsing happens once at import time. */
export const content: Content = plotOn ? Content.parse(withPlot()) : contentBase;
if (plotOn) checkContentRefs(content);
/** The plot layout when look.json plotLayout.on is set and plot.json is built, else null. */
export const PLOT: PlotFile | null = plotOn ? (plotFile as PlotFile) : null;

/** Look and layout scale shared by the generator, 3D renderer and human-view bot (data/look.json). */
export const LOOK = look as {
  buildScale: number; charScale: number; textScale: number; modelBrightness: number; viewW: Record<string, number> & { default: number }; groundK: number;
  modelScale: Record<string, number>; alignedScale: Record<string, number>;
  plotLayout?: { on: boolean; pad: number; plateK: number };
};
/** Per-building size multiplier (look.json modelScale) for an id at a level; upgrade tiers (`.t2`) share the base id. */
export const modelScaleFor = (map: Record<string, number>, id: string, level = 1): number => {
  const base = id.replace(/\.t\d+$/, "");
  return map[`${base}:${level}`] ?? map[base] ?? 1;
};
/** The largest multiplier an id takes at any level: footprints are sized for the biggest model. */
export const maxModelScale = (map: Record<string, number>, id: string): number => {
  const base = id.replace(/\.t\d+$/, "");
  return Math.max(map[base] ?? 1, ...Object.entries(map).filter(([k]) => k.startsWith(`${base}:`)).map(([, v]) => v));
};
/** Ground width across the screen for a level family (world units at the look point). */
export const viewWidth = (family?: string): number => (family && LOOK.viewW[family]) || LOOK.viewW.default;
