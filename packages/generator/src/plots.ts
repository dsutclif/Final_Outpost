import type { Content } from "@fo/content";
import meshyBuilt from "../../render-3d/src/assets/meshy.built.json";
import meshyConfig from "../../render-3d/src/assets/meshy.json";

// Plot layout (Doug's plot plan, 2026-10-25): each building owns a plot, its drawn model plus the pads and
// standing spots that serve it, at fixed places on its edges. This works the plot of every building type
// out of the model sizes (the Meshy fits) and the look settings. The layout sandbox runs it live as its
// sliders move; `pnpm plots:build` runs it with look.json and writes content/data/plot.json, which the
// game's content, the generator and the 3D renderer read when look.json plotLayout.on is set.

/** The look the base content's spots and ranges were tuned at (buildScale 1.2, no per-building scale). */
export const BASE_BUILD_SCALE = 1.2;
/** The game's pad plate across, world units (1.75 art m). */
export const GAME_PAD = 49;
/** The camera looks down ~50 degrees, so a model hides the ground behind (north of) it by height x cot 50. */
const OCCLUDE = 1 / Math.tan((50 * Math.PI) / 180);
const ART_M = 28;

/** Each building's plot pads: a machine's one staff slot takes its workers in order; its upgrade has its own slot beside it (R5 #6). */
export const PLOT_PADS: Record<string, { pads: { id: string; side?: "L" }[]; edge: boolean }> = {
  "sink.core": { pads: [{ id: "collector", side: "L" }, { id: "upgrade" }], edge: true },
  "conv.food_processor": { pads: [{ id: "staff" }, { id: "upgrade" }], edge: true },
  "conv.material_processor": { pads: [{ id: "staff" }, { id: "upgrade" }], edge: true },
  "conv.alloy_works": { pads: [{ id: "staff" }, { id: "upgrade" }], edge: true },
  "node.food_source": { pads: [{ id: "staff" }], edge: false },
  "struct.depot": { pads: [{ id: "staff" }], edge: true },
  "struct.barracks": { pads: [{ id: "staff" }, { id: "upgrade" }], edge: false },
  "struct.medical": { pads: [], edge: true },
  "struct.housing": { pads: [], edge: false },
  "struct.landmark": { pads: [], edge: false },
};

type Pair = [number, number];
type Box4 = [number, number, number, number];
interface Entry { file: string; id: string; level?: number; slot?: unknown; batch?: unknown; kind?: unknown }
const ENTRIES = (meshyConfig as { models: Entry[] }).models.filter((e) => !e.slot && !e.batch && !e.kind);
const BOUNDS = meshyBuilt as Record<string, { bounds: number[] } | undefined>;

/** A building's Meshy fit bounds [x0, y0, z0, x1, y1, z1] in art metres (an exact level wins over a level-free entry). */
export function modelBounds(id: string, level = 1): readonly number[] | undefined {
  const base = id.replace(/\.t\d+$/, "");
  const e = ENTRIES.find((x) => x.id === base && x.level === level) ?? ENTRIES.find((x) => x.id === base && x.level === undefined);
  return e ? BOUNDS[e.file]?.bounds : undefined;
}

const scaleOf = (map: Record<string, number>, id: string, level: number): number => map[`${id}:${level}`] ?? map[id] ?? 1;

export interface PlotInput {
  /** Overall building scale and per-building multipliers (look.json buildScale / modelScale). */
  buildScale: number; modelScale: Record<string, number>;
  /** Pad plate across and character size (look.json plotLayout.pad, charScale). */
  pad: number; charScale: number;
  /** Operator plate across, as a multiple of the player's width (look.json plotLayout.plateK). */
  plateK: number;
  /** The generator's standing radius (generator.json spacing.standR). */
  standR: number;
  /** The game's content before any plot overrides, and the generator's base cashier pad offsets. */
  base: Content; cashierPads: Pair[];
}

export interface PlotData {
  /** Merged over content when the plot layout is on (content/src/index.ts). */
  content: {
    converters: Record<string, { range: number; operatorOffset: Pair; pickupOffset: Pair }>;
    structures: { "struct.depot": { range: number; dropOffset: Pair; pickupOffsets: Pair[] }; "struct.medical": { healOffset: Pair } };
    sinks: { "sink.sales_point": { registerOffset: Pair; pileOffset: Pair; queueOffset: Pair } };
    defaults: { "pads.range": number; "pads.bigRange": number };
  };
  /** Read by the generator (GEN.plots, footprints, cashier pads). */
  generator: { footprints: Record<string, Box4>; bodies: Record<string, Box4>; plots: Record<string, { slots: { id: string; dx: number; dy: number }[] }>; cashierPads: Pair[] };
  /** Read by the 3D renderer: pad plate and operator plate across (world units). */
  render: { pad: number; plate: number };
}

const mul = (p: readonly number[], k: number): Pair => [Math.round(p[0]! * k), Math.round(p[1]! * k)];

/** Work out every building's plot for these look settings. */
export function computePlots(inp: PlotInput): PlotData {
  const P = inp.pad, G = 4;
  const padRange = Math.round(P * 0.6);
  // the operator's plate: 1.25 x the player's width, the player's ground shadow (renderer blob: 10 x look 1.2 x character size, a radius)
  const plate = Math.round(inp.plateK * 2 * 10 * 1.2 * inp.charScale);
  const rel = (id: string): number => (inp.buildScale * scaleOf(inp.modelScale, id, 1)) / BASE_BUILD_SCALE;

  // the drawn model's ground box [x0, z0, x1, z1] and height, world units (the core's plot fits its biggest level)
  const modelBox = (type: string): { b: Box4; h: number } | null => {
    let out: { b: Box4; h: number } | null = null;
    for (const lv of type === "sink.core" ? [1, 2, 3] : [1]) {
      const mb = modelBounds(type, lv);
      if (!mb) continue;
      const m = ART_M * inp.buildScale * scaleOf(inp.modelScale, type, lv);
      const b: Box4 = [mb[0]! * m, mb[2]! * m, mb[3]! * m, mb[5]! * m];
      const h = (mb[4]! - mb[1]!) * m;
      out = out ? { b: [Math.min(out.b[0], b[0]), Math.min(out.b[1], b[1]), Math.max(out.b[2], b[2]), Math.max(out.b[3], b[3])], h: Math.max(out.h, h) } : { b, h };
    }
    return out;
  };

  // pad slots hugging the model: front rows, or the side-preferring pads on the side; whichever plot is smallest
  const slotsFor = (b: Box4, pads: { id: string; side?: "L" }[], edge: boolean) => {
    const cx = (b[0] + b[2]) / 2;
    // neighbouring pads keep their pay ranges apart, and a front-edge standing spot stays out of their range
    const step = Math.max(P + G, 2 * padRange + 2);
    const row0 = b[3] + (edge ? Math.max(plate / 2 + G + P / 2, padRange + inp.standR + 2) : G + P / 2);
    const rows = (list: typeof pads, k: number) => list.map((p, i) => {
      const r = Math.floor(i / k), inRow = Math.min(k, list.length - r * k), c = i - r * k;
      return { id: p.id, dx: cx + (c - (inRow - 1) / 2) * step, dy: row0 + r * step };
    });
    const cands: { id: string; dx: number; dy: number }[][] = [];
    for (let k = 1; k <= Math.max(1, pads.length); k++) cands.push(rows(pads, k));
    const sided = pads.filter((p) => p.side), rest = pads.filter((p) => !p.side);
    if (sided.length) {
      const sides = sided.map((p) => ({ id: p.id, dx: b[0] - G - P / 2, dy: Math.max(b[1] + P / 2, b[3] - P / 2) }));
      for (let k = 1; k <= Math.max(1, rest.length); k++) cands.push([...sides, ...rows(rest, k)]);
    }
    const area = (l: { dx: number; dy: number }[]) => {
      let x0 = b[0], y0 = b[1], x1 = b[2], y1 = b[3] + (edge ? plate / 2 : 0);
      for (const s of l) { x0 = Math.min(x0, s.dx - P / 2); y0 = Math.min(y0, s.dy - P / 2); x1 = Math.max(x1, s.dx + P / 2); y1 = Math.max(y1, s.dy + P / 2); }
      return (x1 - x0) * (y1 - y0);
    };
    return cands.reduce((a, c) => (area(c) < area(a) - 0.5 ? c : a)).map((s) => ({ id: s.id, dx: Math.round(s.dx), dy: Math.round(s.dy) }));
  };

  const base = inp.base;
  const converters: PlotData["content"]["converters"] = {};
  const footprints: Record<string, Box4> = {
    pad: [-P / 2, -P / 2, P / 2, P / 2],
    "pad.big": [-Math.round(P * 0.7), -Math.round(P * 0.7), Math.round(P * 0.7), Math.round(P * 0.7)],
  };
  const plots: PlotData["generator"]["plots"] = {};
  // the model alone, without the ground it hides: gatherables may lie in a building's shadow, pads and buildings may not
  const bodies: Record<string, Box4> = {};
  const dB = base.structures["struct.depot"] as unknown as { range: number; dropOffset: Pair; pickupOffsets: Pair[] };
  const depot = { range: Math.round(dB.range * rel("struct.depot")), dropOffset: mul(dB.dropOffset, rel("struct.depot")), pickupOffsets: dB.pickupOffsets.map((p) => mul(p, rel("struct.depot"))) };
  let heal = mul((base.structures["struct.medical"] as unknown as { healOffset: Pair }).healOffset, rel("struct.medical"));
  for (const [type, def] of Object.entries(PLOT_PADS)) {
    const mb = modelBox(type);
    if (!mb) continue;
    const b = mb.b;
    footprints[type] = [Math.round(b[0]), Math.round(b[1] - OCCLUDE * mb.h), Math.round(b[2]), Math.round(b[3])];
    bodies[type] = [Math.round(b[0]), Math.round(b[1]), Math.round(b[2]), Math.round(b[3])];
    plots[type] = { slots: slotsFor(b, def.pads, def.edge) };
    const cx = Math.round((b[0] + b[2]) / 2), front = Math.round(b[3]);
    if (type.startsWith("conv.")) {
      // operator on the front edge; the pickup tray (0.7 of the operator plate across) at the front right end, on the
      // front edge too, just clear of the operator plate (R5 #30b: the player stands at the edge, not inside the machine)
      const r = Math.min(0.35 * plate, (b[2] - b[0]) / 4 - 2);
      // the deposit reach (from the centre) stays the base one, not scaled with the bigger machine: a wider reach
      // swallows goods the player is only carrying past (the good bot lost its lead on golden level 3 at 50)
      const cB = base.converters[type] as unknown as { range: number };
      converters[type] = {
        range: cB.range,
        operatorOffset: [cx, front],
        pickupOffset: [Math.round(Math.max(b[2] - r - 3, cx + plate / 2 + G + r)), front],
      };
    }
    if (type === "struct.depot") depot.dropOffset = [cx, front];
    if (type === "struct.medical") heal = [cx, front];
  }
  // the kiosk keeps its own register, coin pile, queue and cashier layout, scaled with it from the base size
  const kB = base.sinks["sink.sales_point"] as unknown as { registerOffset: Pair; pileOffset: Pair; queueOffset: Pair };
  const k = rel("sink.sales_point");
  // the cashier's pad keeps clear of the clerk's spot: at least a pad's reach plus a standing spot out
  const minOut = padRange + inp.standR + 4;
  const cashierPads = inp.cashierPads.map((o) => {
    const L = Math.hypot(o[0], o[1]) || 1, d = Math.max(L * k, minOut);
    return [Math.round((o[0] / L) * d), Math.round((o[1] / L) * d)] as Pair;
  });
  return {
    content: {
      converters,
      structures: { "struct.depot": depot, "struct.medical": { healOffset: heal } },
      sinks: { "sink.sales_point": { registerOffset: mul(kB.registerOffset, k), pileOffset: mul(kB.pileOffset, k), queueOffset: mul(kB.queueOffset, k) } },
      defaults: { "pads.range": padRange, "pads.bigRange": Math.round(P * 0.8) },
    },
    generator: { footprints, bodies, plots, cashierPads },
    render: { pad: P, plate },
  };
}
