import { CONTENT_VERSION } from "@fo/content";
import { ENGINE_VERSION, FP, createSim, type SimEvent } from "@fo/sim";
import { marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import level1 from "../../../levels/golden/proto-L001.json";
import { hapticMs } from "../src/feedback.js";
import { hudModel } from "../src/hud.js";
import { JOY_DEAD, JOY_SAT, joystickVector, keysVector, knobOffset } from "../src/input.js";
import { ChainLevelSource, PackLevelSource, StaticLevelSource } from "../src/levels.js";
import { FixedStepper, TICK_MS } from "../src/loop.js";
import { MemoryStore, mergeSettings } from "../src/save.js";
import { goalText, levelText } from "../src/text.js";

describe("fixed-step accumulator", () => {
  it("runs one tick per 33.3 ms and carries the remainder as alpha", () => {
    const s = new FixedStepper();
    expect(TICK_MS).toBeCloseTo(33.333, 2);
    expect(s.advance(16)).toBe(0);
    expect(s.alpha).toBeCloseTo(16 / TICK_MS, 5);
    expect(s.advance(20)).toBe(1);
    expect(s.alpha).toBeCloseTo((36 - TICK_MS) / TICK_MS, 5);
  });

  it("keeps 30 ticks per second over many uneven frames", () => {
    const s = new FixedStepper();
    let ticks = 0;
    const frames = [16.7, 8.3, 16.7, 33.4, 11.1, 16.7];
    let t = 0;
    while (t < 10_000) { const f = frames[ticks % frames.length]!; t += f; ticks += s.advance(f); }
    expect(Math.abs(ticks - 300)).toBeLessThanOrEqual(1);
  });

  it("never runs more than 5 ticks in a frame and drops the rest", () => {
    const s = new FixedStepper();
    expect(s.advance(1000)).toBe(5);
    expect(s.dropped).toBe(Math.floor(1000 / TICK_MS) - 5);
    expect(s.alpha).toBeLessThan(1);
    expect(s.advance(10)).toBeLessThanOrEqual(1);
  });

  it("ignores zero, negative and non-finite frames", () => {
    const s = new FixedStepper();
    expect(s.advance(0)).toBe(0);
    expect(s.advance(-50)).toBe(0);
    expect(s.advance(Number.NaN)).toBe(0);
    expect(s.advance(Infinity)).toBe(0);
    expect(s.alpha).toBe(0);
  });
});

describe("joystick and keys", () => {
  const mag = (v: { dx: number; dy: number }) => Math.hypot(v.dx, v.dy);

  it("has a 6 px dead zone", () => {
    expect(joystickVector(0, 0)).toEqual({ dx: 0, dy: 0 });
    expect(joystickVector(JOY_DEAD - 0.1, 0)).toEqual({ dx: 0, dy: 0 });
    expect(mag(joystickVector(JOY_DEAD, 0))).toBeGreaterThan(0);
  });

  it("scales linearly and saturates at 50 px", () => {
    expect(joystickVector(25, 0).dx).toBe(FP / 2);
    expect(joystickVector(JOY_SAT, 0)).toEqual({ dx: FP, dy: 0 });
    expect(joystickVector(500, 0)).toEqual({ dx: FP, dy: 0 });
    const d = joystickVector(100, 100);
    expect(mag(d)).toBeLessThanOrEqual(FP);
    expect(mag(d)).toBeGreaterThan(FP - 2);
    expect(d.dx).toBe(d.dy);
  });

  it("keeps direction and integer output", () => {
    const v = joystickVector(-30, 40);
    expect(Number.isInteger(v.dx) && Number.isInteger(v.dy)).toBe(true);
    expect(v.dx).toBeLessThan(0);
    expect(v.dy).toBeGreaterThan(0);
    expect(v.dy / v.dx).toBeCloseTo(-4 / 3, 2);
  });

  it("never exceeds FP in any direction", () => {
    for (let a = 0; a < 360; a += 7) for (const r of [6, 13, 49, 50, 51, 200]) {
      const v = joystickVector(Math.cos((a * Math.PI) / 180) * r, Math.sin((a * Math.PI) / 180) * r);
      expect(mag(v)).toBeLessThanOrEqual(FP);
    }
  });

  it("clamps the knob to the saturation ring", () => {
    expect(knobOffset(30, 40)).toEqual({ x: 30, y: 40 });
    const k = knobOffset(300, 400);
    expect(Math.hypot(k.x, k.y)).toBeCloseTo(JOY_SAT, 6);
  });

  it("normalises key diagonals", () => {
    expect(keysVector({ left: false, right: true, up: false, down: false })).toEqual({ dx: FP, dy: 0 });
    expect(keysVector({ left: true, right: true, up: false, down: false })).toEqual({ dx: 0, dy: 0 });
    const d = keysVector({ left: false, right: true, up: true, down: false });
    expect(d.dx).toBe(707);
    expect(d.dy).toBe(-707);
  });
});

const manifest = { ...level1, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION };

describe("level text, HUD model and level sources", () => {
  it("builds Mars text from the canonical goal when the manifest has none for the skin", () => {
    const sim = createSim(manifest);
    const t = levelText(sim.compiled.manifest, marsGreenhouse, 0);
    // the skin's title for the golden level id (the manifest only has frozen_camp text)
    expect(t.title).toBe("Reactor Online");
    expect(levelText({ ...sim.compiled.manifest, id: "x-unknown", text: {} }, (() => { const { titleWords: _, ...text } = marsGreenhouse.text; return { ...marsGreenhouse, text }; })(), 4).title).toBe("Level 5");
    expect(t.goal).toBe("Build the Habitat hub");
    expect(t.tips.length).toBeGreaterThan(0);
    expect(goalText(sim.compiled.manifest, marsGreenhouse)).not.toMatch(/Lodge/);
  });

  it("uses skin words in the HUD", () => {
    const sim = createSim(manifest);
    const m = hudModel(sim.state, sim.compiled.manifest, sim.compiled, marsGreenhouse);
    const keys = m.chips.map((c) => c.key);
    expect(keys).toEqual(expect.arrayContaining(["currency", "lifeline", "starTime"]));
    // Heat is the fuel fraction, with the heat-floor objective's threshold as a tick
    const heat = m.chips.find((c) => c.key === "lifeline")!;
    expect(heat.text).toBe("Heat 12/20");
    expect(heat.ticks).toEqual([0.25]);
    expect(m.chips.find((c) => c.key === "starTime")!.text).toBe("★ 2:00");
    expect(m.goal).toContain("Habitat hub");
  });

  it("lists and loads the golden levels in id order", async () => {
    const src = new StaticLevelSource([{ ...manifest, id: "proto-L002" }, manifest]);
    const list = await src.list();
    expect(list.map((l) => l.id)).toEqual(["proto-L001", "proto-L002"]);
    expect(list[1]!.index).toBe(1);
    const m = await src.load("proto-L001");
    expect(m.entities.length).toBeGreaterThan(5);
    await expect(src.load("nope")).rejects.toThrow();
  });

  it("chains sources and skips an unreachable pack", async () => {
    const dead = new PackLevelSource("/levels/packs/s1", async () => new Response("", { status: 404 }));
    const pack = new PackLevelSource("/levels/packs/s2", async (url) => {
      const u = String(url);
      if (u.endsWith("pack.json")) return new Response(JSON.stringify({ id: "s2", engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION, levels: [{ id: "g-001", file: "g-001.json", modules: ["carry"], goal: "build", rating: 0.5 }] }));
      return new Response(JSON.stringify({ ...manifest, id: "g-001" }));
    });
    const chain = new ChainLevelSource([new StaticLevelSource([manifest]), dead, pack]);
    const list = await chain.list();
    expect(list.map((l) => [l.id, l.index])).toEqual([["proto-L001", 0], ["g-001", 1]]);
    expect((await chain.load("g-001")).id).toBe("g-001");
  });
});

describe("saves and feedback", () => {
  it("migrates from nothing and keeps new setting defaults", async () => {
    const s = new MemoryStore();
    expect(await s.getProgress()).toEqual({ cleared: {}, best: {}, quits: {}, tries: {}, current: null, coach: {}, stars: {}, starSet: {}, discovered: {} });
    expect((await s.getSettings()).haptics).toBe(true);
    expect(mergeSettings({ sound: false }).sound).toBe(false);
    expect("renderer" in mergeSettings({ sound: false, renderer: "2d", rendererChosen: true })).toBe(false);
    await s.appendTelemetry({ levelId: "a", engineVersion: "0", contentVersion: "0", outcome: "win", reason: "goal", ticks: 10, quits: 0, ts: 1 });
    const rows = await s.allTelemetry();
    expect(rows).toHaveLength(1);
    await s.markSent([rows[0]!.seq!]);
    expect((await s.allTelemetry())[0]!.sent).toBe(true);
  });

  it("buzzes for the player's own actions only", () => {
    expect(hapticMs({ t: "gathered", res: "r", node: 0, at: { x: 0, y: 0 } })).toBe(4);
    expect(hapticMs({ t: "gathered", res: "r", node: 0, at: { x: 0, y: 0 }, by: 2 })).toBe(0);
    expect(hapticMs({ t: "sold", res: "r", n: 1, pay: 2, premium: false, at: { x: 0, y: 0 }, customer: 1, kind: "unit.customer" } as SimEvent)).toBe(12);
    expect(hapticMs({ t: "wave_started", idx: 0 })).toBe(40);
  });
});
