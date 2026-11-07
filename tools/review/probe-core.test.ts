import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Tracker, analyzeCaption, analyzeSample, area, contrast, continuityHits, coveredFraction, deltaE, deuteranopia, errorHits, fingerprintOf, frameHits, frameStats,
  intersect, labelSubject, meanLuminance, overlapArea, parseArgs, parseColour, plain, shrink, toCandidate, visibleFraction, type Limits,
} from "./probe-core.js";
import type { Box, CaptionSample, DomItem, FrameRec, Sample, StorySnapshot, ThingSample } from "./probe-types.js";

const L = JSON.parse(readFileSync(new URL("./probe-limits.json", import.meta.url), "utf8")) as Limits;
const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

const sample = (over: Partial<Sample> = {}): Sample => ({
  t: 0, tick: 300, levelId: "s1-L012", screen: "playing", viewport: { w: 375, h: 812 }, safe: { top: 0, right: 0, bottom: 0, left: 0 }, cam: { x: 1000, z: 1000, fx: -0.7071, fz: -0.7071 },
  dom: [], things: [], labels: [], caption: null, lighting: null, ...over,
});

const thing = (over: Partial<ThingSample> = {}): ThingSample => ({
  key: "n:1", id: "node.fuel_deposit", kind: "node", box: box(100, 300, 160, 360), depth: 500, head: null, feet: null,
  baseY: 0, ruleY: 0, topY: 20, foot: { x0: 100, z0: 100, x1: 120, z1: 120 }, age: Infinity, ...over,
});

const person = (key: string, x: number, z: number, over: Partial<ThingSample> = {}): ThingSample => thing({
  key, id: "role.idle", kind: "character", baseY: 0, topY: 50, foot: { x0: x - 6, z0: z - 6, x1: x + 6, z1: z + 6 },
  head: { x: 180, y: 300 }, feet: { x: 180, y: 400 }, box: box(160, 300, 200, 400), ...over,
});

const dom = (over: Partial<DomItem> = {}): DomItem => ({
  parent: -1, sel: "#cash", text: "12", box: box(10, 10, 60, 40), region: "hud", tap: false, fontPx: 16, color: "rgb(255, 255, 255)", bg: null, outlined: false, opacity: 1, ...over,
});

const fp = (h: { check: string; subject: string }[]): string[] => h.map((x) => `${x.check}:${x.subject}`);

describe("geometry", () => {
  it("intersects, measures and shrinks boxes", () => {
    expect(intersect(box(0, 0, 10, 10), box(5, 5, 20, 20))).toEqual(box(5, 5, 10, 10));
    expect(intersect(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBeNull();
    expect(overlapArea(box(0, 0, 10, 10), box(5, 5, 20, 20))).toBe(25);
    expect(area(shrink(box(0, 0, 100, 100), 0.25))).toBe(2500);
  });

  it("measures how much of a box the union of others hides", () => {
    const target = box(0, 0, 120, 60);
    expect(coveredFraction(target, [])).toBe(0);
    expect(coveredFraction(target, [box(-10, -10, 200, 200)])).toBe(1);
    expect(coveredFraction(target, [box(0, 0, 60, 60)])).toBeCloseTo(0.5, 1);
    // two overlapping covers are one union, not a double count
    expect(coveredFraction(target, [box(0, 0, 60, 60), box(30, 0, 60, 60)])).toBeCloseTo(0.5, 1);
    expect(coveredFraction(target, [box(0, 0, 60, 60), box(60, 0, 120, 60)])).toBe(1);
  });

  it("measures the visible share of a box in a view", () => {
    expect(visibleFraction(box(-50, 0, 50, 10), box(0, 0, 375, 812))).toBeCloseTo(0.5);
    expect(visibleFraction(box(10, 10, 20, 20), box(0, 0, 375, 812))).toBe(1);
  });
});

describe("colour", () => {
  it("contrast runs 1 to 21 and parses rgb strings", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(contrast([120, 120, 120], [120, 120, 120])).toBe(1);
    expect(parseColour("rgba(10, 20, 30, 0.5)")).toEqual([10, 20, 30, 0.5]);
    expect(parseColour("transparent")).toBeNull();
  });

  it("a deuteranopia simulation pulls red and green together", () => {
    const red: [number, number, number] = [200, 40, 40], green: [number, number, number] = [60, 170, 60];
    expect(deltaE(red, red)).toBe(0);
    expect(deltaE(deuteranopia(red), deuteranopia(green))).toBeLessThan(deltaE(red, green));
    expect(deltaE(deuteranopia(red), deuteranopia(green))).toBeLessThan(L.colourBlind.minDeltaE * 2);
    // blue against yellow stays apart
    expect(deltaE(deuteranopia([30, 60, 200]), deuteranopia([230, 210, 40]))).toBeGreaterThan(L.colourBlind.minDeltaE);
  });

  it("averages the luminance of pixels and skips transparent ones", () => {
    const px = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 0]);
    expect(meanLuminance(px, 1)).toBeCloseTo(0.5, 1);
  });
});

describe("names", () => {
  it("keeps numbers out of subjects", () => {
    expect(plain("line 12 of 40")).toBe("line # of #");
    expect(labelSubject("lock|Locked")).toBe("label.lock");
    expect(labelSubject("disc|Reactor heat core|Feed it fuel")).toBe("label.disc:Reactor heat core");
    expect(labelSubject("ord|res.x|3|4|2")).toBe("label.ord");
    expect(fingerprintOf(2, "s1-L012", "res.fuel_barrel", "float")).toBe("cat2|s1-L012|res.fuel_barrel|float");
    expect(fingerprintOf(12, "", "console.x", "console-error")).toBe("cat12|*|console.x|console-error");
  });
});

describe("floating", () => {
  it("flags a prop whose base is lifted 0.3 u and not one standing on the ground", () => {
    const hits = analyzeSample(sample({ things: [thing({ id: "res.fuel_barrel", key: "n:2", baseY: 0.3 }), thing({ id: "node.ore", key: "n:3", baseY: 0.02 })] }), L);
    // res.* is on the ignore list (carried and dropped goods ride above the ground), so use a placed prop id
    expect(fp(hits.filter((h) => h.check === "float"))).toEqual([]);
    const lifted = analyzeSample(sample({ things: [thing({ id: "node.fuel_barrel", key: "n:2", baseY: 0.3 }), thing({ id: "node.ore", key: "n:3", baseY: 0.02 })] }), L);
    expect(fp(lifted.filter((h) => h.check === "float"))).toEqual(["float:node.fuel_barrel"]);
  });

  it("measures against the base the renderer intends, and reports the lift", () => {
    const hits = analyzeSample(sample({ things: [thing({ id: "node.fuel_deposit", baseY: 0.35 }), thing({ id: "sink.core", key: "core:1", kind: "building", baseY: 1.4, ruleY: 1.4 })] }), L);
    const f = hits.filter((h) => h.check === "float");
    expect(f).toHaveLength(1);
    expect(f[0]!.subject).toBe("node.fuel_deposit");
    expect(f[0]!.cat).toBe(2);
    expect(f[0]!.metric.value).toBeCloseTo(0.35, 2);
    expect(f[0]!.metric.limit).toBe(L.float.limitU);
    expect(f[0]!.seconds).toBe(L.float.seconds);
  });

  it("leaves out fresh models still popping in, characters, and ignored ids", () => {
    const hits = analyzeSample(sample({ things: [thing({ baseY: 3, age: 0.1 }), person("player", 50, 50, { baseY: 3 }), thing({ id: "pad.build", baseY: 1 }), thing({ id: "node.x", baseY: 0.04 })] }), L);
    expect(hits.filter((h) => h.check === "float")).toEqual([]);
  });
});

describe("hidden labels", () => {
  const label = (depth: number) => ({ key: "pad|Rations", box: box(100, 100, 160, 120), depth, world: { x: 100, y: 30, z: 100 } });

  // the camera looks toward (-1, -1); a smaller distance along that is nearer to it
  it("flags a label that something nearer hides, but not one in front of it or one on the thing itself", () => {
    const wall = thing({ id: "sink.market", kind: "building", key: "m", box: box(90, 90, 250, 200), foot: { x0: 200, z0: 200, x1: 240, z1: 240 } });
    const farLabel = { ...label(900), world: { x: 100, y: 30, z: 100 } }, nearLabel = { ...label(300), world: { x: 400, y: 30, z: 400 } }, ownLabel = { ...label(900), world: { x: 220, y: 30, z: 220 } };
    const hidden = analyzeSample(sample({ things: [wall], labels: [farLabel] }), L).filter((h) => h.check === "occluded");
    expect(hidden).toHaveLength(1);
    expect(hidden[0]!.subject).toBe("label.pad");
    expect(hidden[0]!.detail).toContain("sink.market");
    expect(hidden[0]!.metric.value).toBeGreaterThan(L.occlusion.fraction);
    expect(analyzeSample(sample({ things: [wall], labels: [nearLabel] }), L).filter((h) => h.check === "occluded")).toEqual([]);
    // a label hanging over the middle of the thing is that thing's own
    expect(analyzeSample(sample({ things: [wall], labels: [ownLabel] }), L).filter((h) => h.check === "occluded")).toEqual([]);
  });

  it("counts a queue of traders as covering a sign, and a HUD panel too", () => {
    const queue = [person("c:1", 300, 300, { box: box(95, 80, 135, 150) }), person("c:2", 320, 300, { box: box(125, 80, 165, 150) })];
    const f = analyzeSample(sample({ things: queue, labels: [label(900)] }), L).filter((h) => h.check === "occluded");
    expect(f).toHaveLength(1);
    const panel = dom({ sel: "#cash", box: box(90, 90, 200, 130), tap: true, text: "" });
    expect(analyzeSample(sample({ dom: [panel], labels: [label(900)] }), L).filter((h) => h.check === "occluded")).toHaveLength(1);
    // a full-screen tap layer is not a panel
    const layer = dom({ sel: ".story-tap", box: box(0, 0, 375, 812), tap: true, text: "" });
    expect(analyzeSample(sample({ dom: [layer], labels: [label(900)] }), L).filter((h) => h.check === "occluded")).toEqual([]);
  });
});

describe("characters passing through things", () => {
  it("flags two people standing in each other, not two standing apart", () => {
    const close = analyzeSample(sample({ things: [person("r:1", 100, 100), person("r:2", 102, 101)] }), L).filter((h) => h.check === "overlap");
    expect(close).toHaveLength(1);
    expect(close[0]!.seconds).toBe(L.overlap.seconds);
    expect(analyzeSample(sample({ things: [person("r:1", 100, 100), person("r:2", 140, 100)] }), L).filter((h) => h.check === "overlap")).toEqual([]);
  });

  it("flags someone whose centre is inside a building, not at its edge", () => {
    const bld = thing({ id: "conv.press", key: "cv:1", kind: "building", foot: { x0: 0, z0: 0, x1: 100, z1: 100 } });
    const inside = analyzeSample(sample({ things: [bld, person("r:1", 50, 50)] }), L).filter((h) => h.check === "overlap");
    expect(inside).toHaveLength(1);
    expect(inside[0]!.title).toContain("walks through");
    expect(analyzeSample(sample({ things: [bld, person("r:1", 98, 50)] }), L).filter((h) => h.check === "overlap")).toEqual([]);
    // gates and belts are not solid
    const gate = thing({ id: "struct.gate", key: "g", kind: "building", foot: { x0: 0, z0: 0, x1: 100, z1: 100 } });
    expect(analyzeSample(sample({ things: [gate, person("r:1", 50, 50)] }), L).filter((h) => h.check === "overlap")).toEqual([]);
  });
});

describe("text, buttons and stacking", () => {
  it("flags text running off the right edge", () => {
    const hits = analyzeSample(sample({ dom: [dom({ sel: ".goalcard", text: "Collect fuel", box: box(300, 100, 460, 130) })] }), L).filter((h) => h.check === "offscreen");
    expect(hits).toHaveLength(1);
    expect(hits[0]!.cat).toBe(1);
    expect(hits[0]!.metric.value).toBeLessThan(1);
    expect(analyzeSample(sample({ dom: [dom({ box: box(300, 100, 370, 130) })] }), L).filter((h) => h.check === "offscreen")).toEqual([]);
  });

  it("flags a HUD item in the notch only when the device has one", () => {
    const hud = dom({ box: box(10, 20, 80, 50) });
    expect(analyzeSample(sample({ dom: [hud] }), L).filter((h) => h.check === "unsafe")).toEqual([]);
    const f = analyzeSample(sample({ dom: [hud], safe: { top: 59, right: 0, bottom: 34, left: 0 } }), L).filter((h) => h.check === "unsafe");
    expect(f).toHaveLength(1);
    expect(f[0]!.cat).toBe(13);
  });

  it("flags small tap targets, tiny text and low contrast", () => {
    const hits = analyzeSample(sample({ dom: [
      dom({ sel: "#lvlName", tap: true, text: "LV.2", box: box(300, 10, 350, 41) }),
      dom({ sel: "#big", tap: true, text: "Go", box: box(10, 700, 80, 760) }),
      dom({ sel: ".fine", text: "tiny", fontPx: 8, box: box(10, 300, 40, 310) }),
      dom({ sel: ".dim", text: "grey on grey", color: "rgb(130, 130, 130)", bg: "rgb(150, 150, 150)", box: box(10, 400, 100, 420) }),
      dom({ sel: ".ok", text: "fine", color: "rgb(255, 255, 255)", bg: "rgb(20, 20, 20)", box: box(10, 500, 100, 520) }),
    ] }), L);
    expect(fp(hits.filter((h) => h.check === "tap-target"))).toEqual(["tap-target:dom:#lvlName"]);
    expect(fp(hits.filter((h) => h.check === "small-text"))).toEqual(["small-text:dom:.fine"]);
    expect(fp(hits.filter((h) => h.check === "contrast"))).toEqual(["contrast:dom:.dim"]);
  });

  it("flags text stacked on text but not a button over its own label", () => {
    const a = dom({ sel: "#a", text: "Reactor", box: box(10, 100, 110, 130) }), b = dom({ sel: "#b", text: "Feed", box: box(20, 105, 100, 125) });
    expect(analyzeSample(sample({ dom: [a, b] }), L).filter((h) => h.check === "ui-overlap")).toHaveLength(1);
    const btn = dom({ sel: "#btn", tap: true, text: "Go", box: box(10, 200, 110, 240) }), label = dom({ sel: "span.go", text: "Go", parent: 0, box: box(30, 210, 90, 230) });
    expect(analyzeSample(sample({ dom: [btn, label] }), L).filter((h) => h.check === "ui-overlap")).toEqual([]);
  });

  it("flags two floaters that stack on each other", () => {
    const f = analyzeSample(sample({ labels: [{ key: "cost|a", box: box(100, 100, 160, 120), depth: 500, world: { x: 100, y: 30, z: 100 } }, { key: "pad|b", box: box(105, 102, 165, 122), depth: 500, world: { x: 110, y: 30, z: 100 } }] }), L).filter((h) => h.check === "ui-overlap");
    expect(f).toHaveLength(1);
  });

  it("flags the hero under a panel", () => {
    const hero = person("player", 0, 0, { box: box(150, 300, 220, 420) });
    const panel = dom({ sel: ".sdlg", tap: false, bg: "rgb(250, 250, 250)", text: "", box: box(10, 280, 365, 400) });
    expect(analyzeSample(sample({ things: [hero], dom: [panel] }), L).filter((h) => h.check === "hero-covered")).toHaveLength(1);
    expect(analyzeSample(sample({ things: [hero] }), L).filter((h) => h.check === "hero-covered")).toEqual([]);
  });
});

describe("story captions", () => {
  const speaker = { head: { x: 187, y: 300 }, speakerBox: box(167, 300, 207, 400) };
  const bubble = (b: Box): CaptionSample => ({ sel: ".sdlg-bubble", style: "bubble", box: b, text: "Then I'll bring all five in.", speaker: "commander", ...speaker });

  it("accepts a bubble sitting above the head and flags one over the face", () => {
    expect(analyzeCaption(bubble(box(60, 200, 310, 285)), sample(), L)).toEqual([]);
    const over = analyzeCaption(bubble(box(60, 290, 310, 375)), sample(), L);
    expect(over.map((h) => h.check).sort()).toEqual(["caption-not-above-head", "caption-on-face"]);
    expect(over.every((h) => h.cat === 5 && h.track === "story")).toBe(true);
    expect(over.find((h) => h.check === "caption-on-face")!.severity).toBe(3);
  });

  it("accepts a bubble that sits below a speaker near the top of the screen", () => {
    const top = { head: { x: 80, y: 120 }, speakerBox: box(60, 120, 100, 200) };
    const c: CaptionSample = { sel: ".sdlg-bubble", style: "bubble", box: box(10, 215, 300, 300), text: "x", speaker: "pip", ...top };
    expect(analyzeCaption(c, sample(), L)).toEqual([]);
  });

  it("accepts a bubble below the head that clears the face, even over the legs, and flags one across the face", () => {
    const clear = analyzeCaption(bubble(box(60, 335, 310, 420)), sample(), L);
    expect(clear).toEqual([]);
    const across = analyzeCaption(bubble(box(60, 305, 310, 390)), sample(), L).map((h) => h.check).sort();
    expect(across).toEqual(["caption-not-above-head", "caption-on-face"]);
  });

  it("flags a caption that leaves the safe area", () => {
    const c: CaptionSample = { sel: ".sdlg-strip", style: "strip", box: box(10, 20, 365, 110), text: "x", speaker: null, speakerBox: null, head: null };
    expect(analyzeCaption(c, sample({ safe: { top: 59, right: 0, bottom: 34, left: 0 } }), L).map((h) => h.check)).toEqual(["caption-outside-safe"]);
    expect(analyzeCaption(c, sample(), L)).toEqual([]);
  });

  it("flags a panel caption over its speaker's head box when only the head point is known", () => {
    const c: CaptionSample = { sel: ".sdlg-strip", style: "strip", box: box(10, 280, 365, 340), text: "x", speaker: "kiln", speakerBox: null, head: { x: 180, y: 300 } };
    expect(analyzeCaption(c, sample(), L).map((h) => h.check)).toEqual(["caption-on-face"]);
  });
});

describe("persistence", () => {
  const hit = (seconds: number, value = 0.3) => ({ check: "float", cat: 2, severity: 1 as const, subject: "node.x", title: "t", detail: "d", metric: { name: "floatU", value, limit: 0.05 }, seconds, track: "main" as const });

  it("confirms a rule only after it has held for its seconds, and says when", () => {
    const t = new Tracker("s1-L001");
    expect(t.observe(0, [hit(1)])).toEqual([]);
    expect(t.findings()).toEqual([]);
    const fresh = t.observe(1000, [hit(1, 0.4)]);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.fingerprint).toBe("cat2|s1-L001|node.x|float");
    expect(fresh[0]!.metric.value).toBe(0.4);
    // already confirmed: not fresh again, but its last time and worst value move on
    expect(t.observe(2000, [hit(1, 0.5)])).toEqual([]);
    const f = t.findings()[0]!;
    expect(f.to).toBe(2000);
    expect(f.metric.value).toBe(0.5);
  });

  it("starts the clock again after a sample without it", () => {
    const t = new Tracker("x");
    t.observe(0, [hit(1)]);
    t.observe(1000, []);
    expect(t.observe(1500, [hit(1)])).toEqual([]);
    expect(t.observe(2400, [hit(1)])).toEqual([]);
    expect(t.observe(2500, [hit(1)])).toHaveLength(1);
  });

  it("confirms a zero-second rule at once and keeps the worst of a falling metric", () => {
    const t = new Tracker("x");
    const cover = (v: number) => ({ ...hit(0, v), check: "offscreen", cat: 1, metric: { name: "visibleFraction", value: v, limit: 1 } });
    expect(t.observe(0, [cover(0.8)])).toHaveLength(1);
    t.observe(1000, [cover(0.5)]);
    t.observe(2000, [cover(0.9)]);
    expect(t.findings()[0]!.metric.value).toBe(0.5);
  });

  it("turns a finding into a contract candidate", () => {
    const t = new Tracker("s1-L012");
    t.observe(0, [hit(0)]);
    const c = toCandidate(t.findings()[0]!, "s1-L012", ["probe/s1-L012/shots/t0100.png"]);
    expect(c).toMatchObject({ fingerprint: "cat2|s1-L012|node.x|float", category: 2, via: "probe", pillar: 4, track: "main", levelId: "s1-L012", evidence: ["probe/s1-L012/shots/t0100.png"] });
    expect(c.metric).toEqual({ name: "floatU", value: 0.3, limit: 0.05 });
    // category 5 always goes to the story track
    expect(toCandidate({ ...t.findings()[0]!, cat: 5, track: "main" }, "story-L002", []).track).toBe("story");
  });
});

describe("frame log", () => {
  const rec = (cpu: number, ev: string[] = [], last = ""): FrameRec => ({ t: 0, dt: 33, cpu, step: 0, tick: 0, ev, last });
  const calm = (n: number): FrameRec[] => Array(n).fill(0).map(() => rec(10));

  it("takes median, 95th percentile and long frames after the warm-up", () => {
    const frames = [...Array(L.frame.warmupFrames).fill(0).map(() => rec(900)), ...Array(95).fill(0).map(() => rec(10)), ...Array(5).fill(0).map(() => rec(120))];
    const s = frameStats(frames, L);
    expect(s.frames).toBe(100);
    expect(s.medMs).toBe(10);
    expect(s.worstMs).toBe(120);
    expect(s.longFrames).toBe(5);
  });

  it("blames a long frame on the event before it, one finding per event", () => {
    const frames = [...Array(L.frame.warmupFrames).fill(0).map(() => rec(5)), ...calm(30), rec(140, ["gathered", "wave_started"]), rec(80, ["wave_started"]), rec(60, [], "deposited"), ...calm(5)];
    const hits = frameHits(frames, L).filter((h) => h.check === "longframe");
    expect(hits.map((h) => h.subject).sort()).toEqual(["frame.deposited", "frame.wave_started"]);
    const wave = hits.find((h) => h.subject === "frame.wave_started")!;
    expect(wave.metric.value).toBe(140);
    expect(wave.severity).toBe(3);
    expect(wave.cat).toBe(12);
    expect(hits.find((h) => h.subject === "frame.deposited")!.severity).toBe(2);
  });

  it("flags a slow level overall", () => {
    const frames = [...Array(L.frame.warmupFrames).fill(0).map(() => rec(5)), ...Array(50).fill(0).map(() => rec(130))];
    expect(frameHits(frames, L).map((h) => h.check)).toEqual(["p95"]);
    expect(frameHits(frames.map(() => rec(5)), L)).toEqual([]);
  });
});

describe("console errors", () => {
  it("keeps one per distinct message and drops graphics-driver noise", () => {
    const hits = errorHits([
      "s1-L001: Uncaught TypeError: Cannot read properties of undefined (reading 'isReady')",
      "page: Cannot read properties of undefined (reading 'isReady')",
      "console: [.WebGL-0x4c]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels",
      "s1-L002: Boom at tick 1234",
      "s1-L003: Boom at tick 5678",
    ]);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.cat === 12 && h.severity === 3)).toBe(true);
    expect(hits.map((h) => h.subject)).not.toContainEqual(expect.stringMatching(/\d/));
  });
});

describe("story continuity", () => {
  const start = (over: Partial<StorySnapshot> = {}): StorySnapshot => ({
    levelId: "story-L003", tick: 0, player: { x: 300, y: 300, carry: [], hp: 10, tow: 0 }, residents: [{ id: 1, role: "role.idle", status: "ok", x: 310, y: 300, carry: null }],
    traders: [], captures: [], hostiles: 0, built: [], core: { fuel: 5, level: 1, lit: true }, lighting: 0.2, cast: [], ...over,
  });

  it("flags light that jumps at the cut and cast in the film that the level lacks", () => {
    const hits = continuityHits("story-L003", "sela_arrival", 0.5, 0.1, ["unit.player", "unit.customer_sela", "decor.buggy"], start(), L);
    expect(hits.map((h) => h.check).sort()).toEqual(["cast-missing", "light-jump"]);
    expect(hits.every((h) => h.cat === 5 && h.track === "story")).toBe(true);
    expect(hits.find((h) => h.check === "cast-missing")!.subject).toBe("film.sela_arrival:unit.customer_sela");
  });

  it("accepts a matching light and a cast the level has", () => {
    const hits = continuityHits("story-L003", "chip_handoff", 0.2, 0.22, ["unit.player", "role.idle", "res.currency"], start(), L);
    expect(hits).toEqual([]);
  });
});

describe("command line", () => {
  it("reads the contract's flags and ignores a stray --", () => {
    const a = parseArgs(["--", "--out", "out", "--levels", "s1-L001,s1-L012", "--story", "story-L002", "--throttle", "4"]);
    expect(a.levels).toEqual(["s1-L001", "s1-L012"]);
    expect(a.story).toEqual(["story-L002"]);
    expect(a.throttle).toBe(4);
    expect(a.base).toBeNull();
    expect(parseArgs(["--out", "o", "--base", "http://127.0.0.1:5230/"]).base).toBe("http://127.0.0.1:5230/");
    expect(() => parseArgs(["--levels", "x"])).toThrow(/usage/);
  });
});
