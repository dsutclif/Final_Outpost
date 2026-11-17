import { describe, expect, it } from "vitest";
import { GEN, withWaveFallback } from "../src/index.js";

// Doug (2026-11-17): a defend level the denser waves cannot build is built with today's wave sizing (waveCap 0)
// instead, never worse or not at all; other levels and defend levels that build are searched once, with the cap on.
describe("denser waves fall back to today's sizing", () => {
  const cap = GEN.defendWaves.waveCap;
  const run = (ok: (c: number) => boolean) => {
    const seen: number[] = [];
    const out = withWaveFallback(true, () => { seen.push(GEN.defendWaves.waveCap); return ok(GEN.defendWaves.waveCap); }, (r) => !r);
    return { out, seen };
  };

  it("a defend search that fails with the cap is searched again with waveCap 0, and the cap is put back", () => {
    expect(cap).toBeGreaterThan(0);
    const { out, seen } = run((c) => c === 0);
    expect(seen).toEqual([cap, 0]);
    expect(out).toEqual({ result: true, dense: false });
    expect(GEN.defendWaves.waveCap).toBe(cap);
  });

  it("a defend search that builds keeps the denser waves and runs once", () => {
    const { out, seen } = run(() => true);
    expect(seen).toEqual([cap]);
    expect(out).toEqual({ result: true, dense: true });
  });

  it("the cap is put back even when the fallback search throws", () => {
    expect(() => withWaveFallback(true, () => { if (GEN.defendWaves.waveCap === 0) throw new Error("boom"); return false; }, (r) => !r)).toThrow("boom");
    expect(GEN.defendWaves.waveCap).toBe(cap);
  });

  it("levels without defend waves are never searched again", () => {
    let n = 0;
    const out = withWaveFallback(false, () => { n++; return false; }, (r) => !r);
    expect(n).toBe(1);
    expect(out.dense).toBe(false);
  });
});
