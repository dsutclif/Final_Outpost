import { recipeKey, recipeOf, type LevelRequest, type Recipe, type RecipeRegister, type RegisterEntry } from "../packages/sequencer/src/index.js";

// Re-roll loop of the pack builder (outpost-ops#198, docs/LEVEL-RULES.md "Recipe register").
// A slot whose search fails (nothing ships, or the closest level is further than the register's
// failGap from its target) has its recipe written to the register; the sequence is recomputed with
// the register and the slot is built again from the first step with the recipe it now gets. Later
// slots take earlier requests as history, so every slot in the build whose request changed is
// rebuilt too, and a result built from a request that has since changed is thrown away. After
// `maxRerolls` re-rolls of one slot, or when the sequencer has no recipe left for it, the build stops.
// The search itself is injected (`build`), so the loop is tested with a stub (recipe-reroll.test.ts).

export interface SlotOutcome<R> {
  /** The request the search actually built (stale results are recognised by it). */
  req: LevelRequest;
  /** The level shipped within the gap. */
  ok: boolean;
  /** The worker crashed: says nothing about the recipe, so it is not registered. */
  crashed?: boolean;
  result?: R;
  closestD: number | null;
  seeds: number;
  rejects: Record<string, number>;
}

export interface RerollEvent { index: number; id: string; from: Recipe; to: Recipe | null; reason: string }

export interface RerollStop { index: number; reason: string; tried: Recipe[] }

export interface RerollReport<R> {
  results: Map<number, R>;
  /** Recipes each slot failed with, in order (slots that never failed are absent). */
  failedRecipes: Map<number, Recipe[]>;
  /** The recipe each re-rolled slot finally built with. */
  builtWith: Map<number, Recipe>;
  events: RerollEvent[];
  crashed: number[];
  stopped: RerollStop | null;
}

export interface RerollOptions<R> {
  indices: number[];
  /** Appended to as recipes fail. */
  register: RecipeRegister;
  engine: string;
  jobs: number;
  /** Today's date for new entries (YYYY-MM-DD). */
  date: string;
  /** The current request of every slot in `indices` given the register (throws when a slot has no recipe left). */
  requests: (register: RecipeRegister) => Map<number, LevelRequest>;
  build: (index: number, req: LevelRequest) => Promise<SlotOutcome<R>>;
  /** Persist the register after an entry is added. */
  onRegister?: (entry: RegisterEntry, register: RecipeRegister) => void;
  onEvent?: (ev: RerollEvent) => void;
}

export const describeRecipe = (r: Recipe): string =>
  `${r.family}${r.secondary ? `+${r.secondary}` : ""} goal ${r.goalId}, template ${r.template}, features [${r.features.join(", ")}], target band ${r.band}`;

/** The stop message: the in-game level number and every recipe it tried. */
export const stopMessage = (s: RerollStop): string =>
  [`Level ${s.index} cannot be built: ${s.reason}. Recipes tried:`, ...s.tried.map((r, k) => `  ${k + 1}. ${describeRecipe(r)}`)].join("\n");

const same = (a: LevelRequest | undefined, b: LevelRequest | undefined) => JSON.stringify(a) === JSON.stringify(b);

export async function buildWithRerolls<R>(o: RerollOptions<R>): Promise<RerollReport<R>> {
  const band = o.register.settings.targetBand;
  const report: RerollReport<R> = { results: new Map(), failedRecipes: new Map(), builtWith: new Map(), events: [], crashed: [], stopped: null };
  let reqs = o.requests(o.register);
  const queue = [...o.indices];
  const inflight = new Set<number>();
  const enqueue = (i: number) => { if (!queue.includes(i) && !inflight.has(i)) queue.push(i); };

  const stop = (index: number, reason: string) => {
    if (!report.stopped) report.stopped = { index, reason, tried: [...(report.failedRecipes.get(index) ?? [])] };
  };

  const handle = (i: number, out: SlotOutcome<R>) => {
    if (report.stopped) { if (out.ok && same(out.req, reqs.get(i))) report.results.set(i, out.result as R); return; }
    if (!same(out.req, reqs.get(i))) { enqueue(i); return; } // built from a request that changed meanwhile
    if (out.crashed) { report.crashed.push(i); return; }
    const recipe = recipeOf(out.req, band);
    if (out.ok) {
      report.results.set(i, out.result as R);
      if (report.failedRecipes.has(i)) report.builtWith.set(i, recipe);
      return;
    }
    const entry: RegisterEntry = {
      key: recipeKey(recipe), recipe, engine: o.engine, date: o.date,
      target: out.req.target, closestD: out.closestD, seeds: out.seeds, rejects: out.rejects,
    };
    if (!o.register.entries.some((e) => e.key === entry.key && e.engine === entry.engine)) {
      o.register.entries.push(entry);
      o.onRegister?.(entry, o.register);
    }
    const failed = [...(report.failedRecipes.get(i) ?? []), recipe];
    report.failedRecipes.set(i, failed);
    const gap = out.closestD === null ? "nothing shipped" : `closest D ${out.closestD.toFixed(3)} vs target ${out.req.target}`;
    if (failed.length > o.register.settings.maxRerolls) {
      report.events.push({ index: i, id: out.req.id, from: recipe, to: null, reason: gap });
      stop(i, `${failed.length} recipes failed (cap ${o.register.settings.maxRerolls} re-rolls)`);
      return;
    }
    let next: Map<number, LevelRequest>;
    try { next = o.requests(o.register); } catch (e) {
      report.events.push({ index: i, id: out.req.id, from: recipe, to: null, reason: gap });
      stop(i, `the sequencer has no recipe left (${(e as Error).message})`);
      return;
    }
    const ev: RerollEvent = { index: i, id: out.req.id, from: recipe, to: recipeOf(next.get(i)!, band), reason: gap };
    report.events.push(ev);
    o.onEvent?.(ev);
    // every slot whose request changed (this one and any later one taking it as history) builds again
    for (const j of o.indices) if (!same(next.get(j), reqs.get(j))) { report.results.delete(j); report.builtWith.delete(j); enqueue(j); }
    reqs = next;
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(o.jobs, o.indices.length)) }, async () => {
    // a worker idles while others run: a re-roll can queue more work
    while (!report.stopped && (queue.length > 0 || inflight.size > 0)) {
      const i = queue.shift();
      if (i === undefined) { await new Promise((ok) => setTimeout(ok, 50)); continue; }
      inflight.add(i);
      let out: SlotOutcome<R>;
      try { out = await o.build(i, reqs.get(i)!); } finally { inflight.delete(i); }
      handle(i, out);
    }
  }));
  return report;
}
