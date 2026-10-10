import { FP, type Input, type Sim, type State } from "@fo/sim";
import type { App } from "../app.js";

// Dev-only scripted play helpers (window.B), loaded by main.ts in dev builds. Tasks are
// small steering functions run one per tick through App.debugRun; a fuel guard keeps the
// reactor fed in between. Used for long playtests from the browser console.

type Task = (s: State) => Input | null;

export function installPlaytest(app: App): void {
  const sim = (): Sim => { const s = app.debugSim; if (!s) throw new Error("no level running"); return s; };
  const st = (): State => sim().state;
  const d2 = (p: { x: number; y: number }, x: number, y: number): number => ((p.x - x * FP) / FP) ** 2 + ((p.y - y * FP) / FP) ** 2;
  const dir = (s: State, x: number, y: number): Input => {
    const p = s.player.pos, dx = x * FP - p.x, dy = y * FP - p.y, m = Math.hypot(dx, dy);
    if (m < 1500) return { dx: 0, dy: 0 };
    return { dx: Math.trunc((dx / m) * FP), dy: Math.trunc((dy / m) * FP) };
  };
  const count = (s: State, r: string): number => s.player.stack.filter((x) => x === r).length;
  const goTo = (x: number, y: number, tol = 4): Task => (s) => (d2(s.player.pos, x, y) <= tol * tol ? null : dir(s, x, y));
  const stay = (n: number): Task => { let k = n; return () => (k-- > 0 ? { dx: 0, dy: 0 } : null); };
  const until = (pred: (s: State) => boolean, x?: number, y?: number): Task => (s) => (pred(s) ? null : x === undefined ? { dx: 0, dy: 0 } : dir(s, x, y!));
  const fuelCap = (s: State): number => { const lv = sim().compiled.core.levels; return lv[Math.min(s.core.level, lv.length) - 1]!.fuelCap; };
  const nearestNode = (s: State, type: string) => {
    let best: State["nodes"][number] | null = null, bd = Infinity;
    for (const n of s.nodes) if (n.type === type && n.enabled && n.stock !== 0) { const d = d2(s.player.pos, n.pos.x / FP, n.pos.y / FP); if (d < bd) { bd = d; best = n; } }
    return best;
  };
  let guard = true, feeding = false, queue: Task[] = [];
  const fuelGuard = (s: State): Input | null => {
    if (!guard) return null;
    const cap = fuelCap(s);
    if (!feeding && s.core.fuel > Math.max(3, Math.floor(cap * 0.3))) return null;
    feeding = true;
    const fuels = Object.keys(sim().compiled.core.accepts);
    const nf = s.player.stack.filter((r) => fuels.includes(r)).length;
    if (s.core.fuel >= cap - 1 && nf === 0) { feeding = false; return null; }
    const node = nearestNode(s, "node.fuel_deposit") ?? nearestNode(s, "node.material_source");
    if (nf >= 6 || (nf > 0 && (s.core.fuel <= 2 || !node))) {
      const c = s.core.pos;
      if (d2(s.player.pos, c.x / FP, c.y / FP) < 45 * 45) { if (nf === 0 || s.core.fuel >= cap) { feeding = false; return null; } return { dx: 0, dy: 0 }; }
      return dir(s, c.x / FP, c.y / FP);
    }
    if (!node) { feeding = false; return null; }
    return dir(s, node.pos.x / FP, node.pos.y / FP);
  };
  const policy = (s: State): Input | null => {
    const g = fuelGuard(s);
    if (g) return g;
    while (queue.length) { const r = queue[0]!(s); if (r) return r; queue.shift(); }
    return null;
  };
  const run = (tasks: Task[], max = 30 * 120) => {
    queue = tasks.slice();
    const t = app.debugRun(policy, max);
    const s = st();
    return { tick: t, left: queue.length, cur: s.currency, fuel: s.core.fuel, life: s.core.lifeline, stack: s.player.stack.join(","), over: s.over, won: s.won, reason: s.reason, pos: [s.player.pos.x / FP, s.player.pos.y / FP], pads: s.pads.filter((p) => p.done).map((p) => p.id).join(",") };
  };
  const loopAround = (cx: number, cy: number, r = 36): Task[] => Array.from({ length: 27 }, (_, i) => goTo(cx + Math.cos((i / 24) * Math.PI * 2) * r, cy + Math.sin((i / 24) * Math.PI * 2) * r, 6));
  const collect = (): Task[] => { const p = st().sales!.pile; return [goTo(p.x / FP, p.y / FP - 20, 8), goTo(p.x / FP, p.y / FP, 5), stay(8)]; };
  const buy = (id: string): Task[] => { const p = st().pads.find((q) => q.id === id)!; return [goTo(p.pos.x / FP, p.pos.y / FP, 5), until((s) => s.pads.find((q) => q.id === id)!.done || s.currency === 0), stay(5)]; };
  const costOf = (id: string, res: string): number => {
    const e = sim().compiled.manifest.entities.find((x) => x.id === id) as { cost?: Record<string, number> } | undefined;
    return e?.cost?.[res] ?? 0;
  };
  const buyAll = (plan: string[], earn: () => Task[] = () => [...collect(), stay(200)]): string[] => {
    const out: string[] = [];
    for (const id of plan) {
      const pad = () => st().pads.find((p) => p.id === id)!;
      for (let g = 0; g < 25 && !pad().done && !st().over; g++) {
        const need = costOf(id, "res.currency") - (pad().paid["res.currency"] ?? 0);
        if (st().currency >= need && pad().visible && !pad().locked) out.push(id + JSON.stringify(run(buy(id), 30 * 30)));
        else run(earn(), 30 * 20);
      }
    }
    return out;
  };
  (window as unknown as { B: unknown }).B = { FP, st, sim, goTo, stay, until, run, count, dir, d2, nearestNode, loopAround, collect, buy, buyAll, setGuard: (v: boolean) => { guard = v; } };
}
