import { describe, expect, it } from "vitest";
import { PROFILES, playBot } from "../src/index.js";
import level3 from "../../../levels/golden/proto-L003.json";

// Repeated-loop measure (REDESIGN-R3 item 7): the trace reports the longest run of identical
// player trips (same source type, resource, target), leaving out trips a hired worker performs.

describe("loop measure", () => {
  it("a golden level run reports a finite loopMax and the trip behind it", () => {
    const r = playBot(level3, PROFILES["good"]!, 1);
    expect(r.trace.loopMax).toBeGreaterThan(0);
    expect(r.trace.loopMax).toBeLessThan(1000);
    expect(r.trace.loopKey).toMatch(/>/);
  });

  it("is deterministic", () => {
    const a = playBot(level3, PROFILES["good"]!, 2).trace;
    const b = playBot(level3, PROFILES["good"]!, 2).trace;
    expect([a.loopMax, a.loopKey]).toEqual([b.loopMax, b.loopKey]);
  });
});
