import { CONTENT_VERSION, type Manifest } from "@fo/content";
import { ENGINE_VERSION, FP, createSim } from "@fo/sim";
import { SKINS, marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import l1 from "../../../levels/golden/proto-L001.json";
import l2 from "../../../levels/golden/proto-L002.json";
import l3 from "../../../levels/golden/proto-L003.json";
import l4 from "../../../levels/golden/proto-L004.json";
import { COACH_RULES, Coach } from "../src/coach.js";
import { hudModel } from "../src/hud.js";
import { levelText } from "../src/text.js";

const pin = (m: object): Manifest => ({ ...m, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION }) as unknown as Manifest;
const golden = [l1, l2, l3, l4].map(pin);

describe("coach marks", () => {
  it("every rule has text in every skin", () => {
    for (const skin of Object.values(SKINS)) for (const r of COACH_RULES) expect(skin.text.coach[r.id], `${skin.id}:${r.id}`).toBeTruthy();
  });

  it("level 1 starts by pointing at the grow dome, then the kiosk once greens are carried", () => {
    const sim = createSim(golden[0]!);
    const coach = new Coach(sim.compiled.manifest.modules, {});
    const first = coach.update(sim.state, sim.compiled)!;
    expect(first.id).toBe("gather_food");
    const dome = sim.state.nodes.find((n) => n.type === "node.food_source" && n.enabled)!;
    expect(first.at).toEqual(dome.pos);
    sim.state.player.stack.push("res.food_raw_1");
    for (let i = 0; i < 50; i++) coach.update(sim.state, sim.compiled);
    expect(coach.update(sim.state, sim.compiled)!.id).toBe("stock_kiosk");
  });

  it("doing the thing retires the rule after its count", () => {
    const sim = createSim(golden[0]!);
    const learned: Record<string, number> = {};
    const coach = new Coach(sim.compiled.manifest.modules, learned);
    const ev = { t: "collected", res: "res.currency", n: 3, at: { x: 0, y: 0 } } as const;
    coach.onEvent(ev, sim.compiled);
    coach.onEvent(ev, sim.compiled);
    expect(learned["collect_pile"]).toBe(2);
    sim.state.sales!.pileN = 9;
    for (let i = 0; i < 60; i++) expect(coach.update(sim.state, sim.compiled)?.id).not.toBe("collect_pile");
  });

  it("filters rules by the level's modules", () => {
    const sim = createSim(golden[0]!);
    sim.state.player.tow.push(0);
    const coach = new Coach(sim.compiled.manifest.modules, {});
    expect(coach.update(sim.state, sim.compiled)?.id).not.toBe("tow_home");
  });

  it("never throws and always targets integer points over long random play on every golden level", () => {
    for (const m of golden) {
      const sim = createSim(m);
      const coach = new Coach(sim.compiled.manifest.modules, {}, undefined, !!sim.compiled.gate);
      let seed = 7;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
      let dir = { dx: 0, dy: 0 };
      for (let t = 0; t < 2400 && !sim.state.over; t++) {
        if (t % 45 === 0) dir = { dx: Math.trunc(rnd() * FP), dy: Math.trunc(rnd() * FP) };
        for (const e of sim.step(dir)) coach.onEvent(e, sim.compiled);
        const mk = coach.update(sim.state, sim.compiled);
        if (mk) expect(Number.isInteger(mk.at.x) && Number.isInteger(mk.at.y), mk.id).toBe(true);
      }
    }
  });
});

describe("HUD and intro for later modules", () => {
  it("counts raids against the manifest's waves", () => {
    const sim = createSim(golden[3]!);
    const m = hudModel(sim.state, sim.compiled.manifest, sim.compiled, marsGreenhouse);
    expect(m.goal).toMatch(/0\/3$/);
    expect(m.chips.find((c) => c.key === "wave")!.text).toMatch(/Raid 1 · 45s/);
    expect(m.chips.find((c) => c.key === "baseHealth")!.bar).toBe(1);
  });

  it("tips cover the modules a level introduces", () => {
    const sim = createSim(golden[1]!);
    const seen = new Set<string>(golden[0]!.modules);
    const t = levelText(sim.compiled.manifest, marsGreenhouse, 1, seen);
    expect(t.tips.length).toBeGreaterThan(0);
    expect(t.tips.join(" ")).toMatch(/airlock|tow/i);
  });
});
