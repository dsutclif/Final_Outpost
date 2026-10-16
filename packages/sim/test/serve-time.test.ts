import { describe, expect, it } from "vitest";
import { TPS, type SimEvent, type State } from "../src/index.js";
import { LEVEL_1, newSim } from "./helpers.js";

// R3 item 8 (docs/REDESIGN-R3.md): the front customer stands at the window for sales.serveSeconds before paying.

const withServe = (sec: number) => newSim({ params: { ...LEVEL_1.params, "sales.serveSeconds": sec } });
const restock = (st: State) => { for (const r of st.sales!.sells) st.sales!.shelf[r] = st.sales!.shelf[r]! > 0 ? st.sales!.shelf[r]! : 8; };
const sold = (ev: SimEvent[]) => ev.filter((e) => e.t === "sold") as Extract<SimEvent, { t: "sold" }>[];

describe("R3-8: customer serve time", () => {
  it("compiles 0.6 s (the default since engine 0.6.0) to 18 ticks and 0 to instant", () => {
    expect(withServe(0.6).compiled.sales.serveTicks).toBe(18);
    expect(newSim().compiled.sales.serveTicks).toBe(18);
    expect(withServe(0).compiled.sales.serveTicks).toBe(0);
  });

  it("no sale completes before the timer; the sale lands serveTicks after serving begins", () => {
    const sim = withServe(0.6), st = sim.state;
    st.player.pos = { ...st.sales!.register };
    let began = -1, saleTick = -1;
    for (let i = 0; i < 20 * TPS && saleTick < 0; i++) {
      restock(st);
      const ev = sim.step({ dx: 0, dy: 0 });
      if (began < 0 && st.sales!.serving) began = i;
      if (sold(ev).length > 0) saleTick = i;
    }
    expect(began).toBeGreaterThanOrEqual(0);
    expect(saleTick).toBe(began + 17);
    expect(st.sales!.serving).toBeUndefined();
  });

  it("sells exactly one customer per sale, each customer once", () => {
    const sim = withServe(0.6), st = sim.state;
    st.player.pos = { ...st.sales!.register };
    const ids: number[] = [];
    for (let i = 0; i < 90 * TPS && !st.over; i++) {
      restock(st);
      const ev = sim.step({ dx: 0, dy: 0 });
      const s = sold(ev);
      expect(s.length).toBeLessThanOrEqual(1);
      for (const e of s) ids.push(e.customer);
    }
    expect(ids.length).toBeGreaterThan(2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(st.stats.sold).toBe(ids.length);
  });

  it("the timer pauses when the clerk pad is unstaffed and resumes where it left off", () => {
    const sim = withServe(0.6), st = sim.state;
    st.player.pos = { ...st.sales!.register };
    for (let i = 0; i < 20 * TPS && (st.sales!.serving?.ticks ?? 0) < 5; i++) { restock(st); sim.step({ dx: 0, dy: 0 }); }
    const held = st.sales!.serving!;
    const id = held.customer, ticks = held.ticks;
    expect(ticks).toBeGreaterThanOrEqual(5);
    // Step away (far from the pad) and wait: nothing sells, progress is frozen.
    st.player.pos = { x: st.sales!.register.x + 200000, y: st.sales!.register.y };
    for (let i = 0; i < 40; i++) {
      restock(st);
      st.sales!.queue.forEach((q) => { q.patience = q.patienceMax; });
      expect(sold(sim.step({ dx: 0, dy: 0 }))).toHaveLength(0);
    }
    expect(st.sales!.serving).toEqual({ customer: id, ticks, of: 18 });
    // Return: the same customer finishes after the remaining ticks.
    st.player.pos = { ...st.sales!.register };
    let n = 0, done: SimEvent[] = [];
    while (done.length === 0 && n < 60) { restock(st); done = sold(sim.step({ dx: 0, dy: 0 })); n++; }
    expect(n).toBe(18 - ticks);
    expect((done[0] as { customer: number }).customer).toBe(id);
  });

  it("the timer pauses when stock runs out mid-serve, with no refund or skip", () => {
    const sim = withServe(0.6), st = sim.state;
    st.player.pos = { ...st.sales!.register };
    for (let i = 0; i < 20 * TPS && (st.sales!.serving?.ticks ?? 0) < 5; i++) { restock(st); sim.step({ dx: 0, dy: 0 }); }
    const { customer, ticks } = st.sales!.serving!;
    const res = st.sales!.queue.find((q) => q.id === customer)!.res;
    const have = st.sales!.shelf[res]!;
    st.sales!.shelf[res] = 0;
    for (let i = 0; i < 30; i++) {
      st.sales!.queue.forEach((q) => { q.patience = q.patienceMax; });
      st.sales!.shelf[res] = 0;
      expect(sold(sim.step({ dx: 0, dy: 0 }))).toHaveLength(0);
    }
    expect(st.sales!.serving).toEqual({ customer, ticks, of: 18 });
    st.sales!.shelf[res] = have;
    let done: SimEvent[] = [];
    for (let i = 0; i < 40 && done.length === 0; i++) { st.sales!.queue.forEach((q) => { q.patience = q.patienceMax; }); done = sold(sim.step({ dx: 0, dy: 0 })); }
    expect((done[0] as { customer: number }).customer).toBe(customer);
  });

  it("serveSeconds 0 never sets serving", () => {
    const sim = withServe(0), st = sim.state;
    st.player.pos = { ...st.sales!.register };
    for (let i = 0; i < 30 * TPS; i++) { restock(st); sim.step({ dx: 0, dy: 0 }); expect(st.sales!.serving).toBeUndefined(); }
    expect(st.stats.sold).toBeGreaterThan(0);
  });
});
