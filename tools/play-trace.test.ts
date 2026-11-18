import { describe, expect, it } from "vitest";
import { loadManifest, manifestOfCandidate, traceRun, traceText } from "./play-trace.js";

// s1-L061 is a ~45 s clear-zones level: short enough for a test, with builds, a zone, objectives and the end row.
const mask = (s: string): string => s.replace(/"engine":"[^"]*"/, '"engine":"<ENGINE_VERSION>"');

describe("play trace", () => {
  const m = loadManifest("s1-L061");

  it("gives byte-identical text for the same level, seed and bot", () => {
    const a = traceText(traceRun(m, { seed: 1, bot: "good" }));
    const b = traceText(traceRun(JSON.parse(JSON.stringify(m)), { seed: 1, bot: "good" }));
    expect(b).toBe(a);
    expect(a.length).toBeLessThan(4096);
  });

  it("differs when the seed or bot changes, and stays valid JSON", () => {
    const a = traceText(traceRun(m, { seed: 1, bot: "good" }));
    const tr = JSON.parse(a) as { events: unknown[]; level: string; result: { hash: string } };
    expect(tr.level).toBe("s1-L061");
    expect(tr.events.length).toBeGreaterThan(0);
    expect(JSON.parse(traceText(traceRun(m, { seed: 2, bot: "average" }))).bot).toBe("average");
  });

  it("matches the saved snapshot of one short level", async () => {
    await expect(mask(traceText(traceRun(m, { seed: 1, bot: "good" })))).toMatchFileSnapshot("play-trace.snap.json");
  });

  it("rejects an unknown bot", () => {
    expect(() => traceRun(m, { seed: 1, bot: "nope" })).toThrow(/unknown bot/);
  });

  it("traces a candidate record that carries its manifest, and says why one without it cannot be", () => {
    const rec = { id: "s1-L061", iteration: 3, p: 0.4, knobs: {}, manifest: m } as Record<string, unknown>;
    expect(traceText(traceRun(manifestOfCandidate(rec), { seed: 1 }))).toBe(traceText(traceRun(m, { seed: 1 })));
    expect(() => manifestOfCandidate({ id: "x", knobs: {} })).toThrow(/no `manifest`/);
  });
});
