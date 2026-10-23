import type { State, Vec } from "@fo/sim";
import { FP } from "@fo/sim";
import { LOOK, viewWidth } from "@fo/content";
import viewData from "../data/view.json";

// Perception filter for the human-view bot. A player sees the HUD (currency, heat, base health,
// waves, timers, objectives, the crew count) and whatever the camera frames around the hero; the
// rest of the map is what they remember from the last time it was on screen (the level-start
// overview shows all of it once). Off-screen attackers show only as the renderer's edge pointers:
// the nearest one in each direction. The sim is untouched: the brain reads a filtered copy.

export interface ViewBox {
  viewW: number;
  aspect: number;
  heroShift: number;
  pitchDeg: number;
  yawDeg: number;
  pointerSectors: number;
}

/** The camera box for a level family: its look.json ground width times the wider ground toward the top edge. */
export const viewFor = (family?: string): ViewBox => ({ ...viewData, viewW: Math.round(viewWidth(family) * LOOK.groundK) });
export const VIEW: ViewBox = viewFor();

/** Builds the State a player could perceive each tick and remembers what went off screen. */
export class Perception {
  private readonly c: number;
  private readonly s: number;
  private readonly sinP: number;
  private readonly halfW: number;
  private readonly up: number;
  private readonly down: number;
  /** Last on-screen copies, by key; present only for things currently off screen. */
  private nodes = new Map<number, State["nodes"][number]>();
  private convs = new Map<string, State["converters"][number]>();
  private sections = new Map<string, State["barriers"][number]["sections"][number]>();
  private prey = new Map<number, State["prey"][number] | null>();
  private drops = new Map<number, State["drops"][number] | null>();
  private sales: State["sales"] = null;
  private depot: State["depot"] = null;

  constructor(readonly box: ViewBox = VIEW) {
    const yaw = (box.yawDeg * Math.PI) / 180;
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
    this.sinP = Math.sin((box.pitchDeg * Math.PI) / 180);
    const h = box.viewW * box.aspect;
    this.halfW = (box.viewW / 2) * FP;
    this.up = (h / 2 + h * box.heroShift) * FP;
    this.down = (h / 2 - h * box.heroShift) * FP;
  }

  /** Screen-plane offset of a ground point from the hero (units.ts worldToScreenPlane), fixed point. */
  private screen(hero: Vec, p: Vec): { x: number; y: number } {
    const dx = p.x - hero.x, dy = p.y - hero.y;
    return { x: dx * this.c - dy * this.s, y: (dx * this.s + dy * this.c) * this.sinP };
  }

  visible(hero: Vec, p: Vec): boolean {
    const q = this.screen(hero, p);
    return q.x >= -this.halfW && q.x <= this.halfW && q.y >= -this.up && q.y <= this.down;
  }

  /** The state as the player sees it this tick. Shares unchanged objects with `st`; never mutate the result. */
  see(st: State): State {
    const hero = st.player.pos;
    const vis = (p: Vec) => this.visible(hero, p);

    const nodes = st.nodes.map((n, i) => this.keep(this.nodes, i, n, vis(n.pos)));
    const converters = st.converters.map((cv) => this.keep(this.convs, cv.id, cv, vis(cv.pos)));
    const barriers = st.barriers.map((l) => {
      let changed = false;
      const sections = l.sections.map((sec, i) => {
        const mid = { x: (sec.a.x + sec.b.x) / 2, y: (sec.a.y + sec.b.y) / 2 };
        const seen = this.keep(this.sections, `${l.id}#${i}`, sec, vis(mid));
        if (seen !== sec) changed = true;
        return seen;
      });
      return changed ? { ...l, sections } : l;
    });
    const prey = this.byId(this.prey, st.prey, vis);
    const drops = this.byId(this.drops, st.drops, vis);

    // The shop and the warehouse: shelves, the queue and its patience are read off the building.
    let sales = st.sales;
    if (sales) {
      if (vis(sales.pos) || vis(sales.register)) this.sales = null;
      else sales = this.sales ??= structuredClone(sales);
    }
    let depot = st.depot;
    if (depot) {
      if (vis(depot.pos)) this.depot = null;
      else depot = this.depot ??= structuredClone(depot);
    }

    // Attackers: those on screen, plus the nearest off-screen one per pointer sector.
    const hostiles: State["hostiles"] = [];
    const pointer = new Map<number, { h: State["hostiles"][number]; d: number }>();
    const k = this.box.pointerSectors;
    for (const h of st.hostiles) {
      const q = this.screen(hero, h.pos);
      if (q.x >= -this.halfW && q.x <= this.halfW && q.y >= -this.up && q.y <= this.down) { hostiles.push(h); continue; }
      const sector = ((Math.round(Math.atan2(q.y, q.x) / ((2 * Math.PI) / k)) % k) + k) % k;
      const d = q.x * q.x + q.y * q.y;
      const cur = pointer.get(sector);
      if (!cur || d < cur.d) pointer.set(sector, { h, d });
    }
    for (const { h } of pointer.values()) hostiles.push(h);

    return { ...st, nodes, converters, barriers, prey, drops, sales, depot, hostiles };
  }

  /** On screen: the live object (and forget the copy). Off screen: the copy taken as it left the view. */
  private keep<K, T>(mem: Map<K, T>, key: K, live: T, seen: boolean): T {
    if (seen) { mem.delete(key); return live; }
    let m = mem.get(key);
    if (m === undefined) { m = structuredClone(live); mem.set(key, m); }
    return m;
  }

  /**
   * Things that come and go (animals, items on the ground): on screen as they are; off screen as last
   * seen. Something never seen stays unknown, and a remembered one is forgotten once its spot is back
   * on screen without it. `mem` holds null for things seen and still on screen.
   */
  private byId<T extends { id: number; pos: Vec }>(mem: Map<number, T | null>, live: readonly T[], vis: (p: Vec) => boolean): T[] {
    const out: T[] = [];
    const ids = new Set<number>();
    for (const x of live) {
      ids.add(x.id);
      if (vis(x.pos)) { mem.set(x.id, null); out.push(x); continue; }
      if (!mem.has(x.id)) continue;
      let m = mem.get(x.id);
      if (!m) { m = structuredClone(x); mem.set(x.id, m); }
      out.push(m);
    }
    for (const [id, m] of mem) {
      if (ids.has(id)) continue;
      if (!m || vis(m.pos)) mem.delete(id); else out.push(m);
    }
    return out;
  }

  /** Remember everything as it is now (the level-start overview shows the whole map). */
  overview(st: State): void {
    for (const d of st.prey) this.prey.set(d.id, null);
    for (const d of st.drops) this.drops.set(d.id, null);
  }
}
