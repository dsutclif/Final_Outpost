import { marsGreenhouse as skin } from "@fo/skins";
import { describe, expect, it } from "vitest";
import type { Compiled, PadState, State } from "@fo/sim";
import { heldForHand, padLockReason } from "../src/padlock.js";

describe("manual-first hire pads", () => {
  const hire = { type: "pad.hire", manual: true, role: { role: "role.hauler", from: "node.a", to: "sink.core" } };
  const cp = { roles: { "role.hauler": { behavior: "gather_deliver" } }, entityById: { h: hire, plain: { ...hire, manual: false }, gated: { ...hire, requires: { pad: "x" } } } } as unknown as Compiled;
  const pad = (id: string): PadState => ({ id, done: false } as PadState);
  const st = (done: string[] = [], built: string[] = []): State => ({ pads: [{ id: "x", done: built.length > 0 }], built, waves: { idx: 0 }, manual: { src: {}, done } }) as unknown as State;
  it("holds a manual hire until its job is done by hand", () => {
    expect(heldForHand(st(), cp, pad("h"))).toBe(true);
    expect(heldForHand(st(["carry:node.a>sink.core"]), cp, pad("h"))).toBe(false);
  });
  it("does not hold an ungated hire, a done pad or one still behind its required pad", () => {
    expect(heldForHand(st(), cp, pad("plain"))).toBe(false);
    expect(heldForHand(st(), cp, { ...pad("h"), done: true })).toBe(false);
    expect(heldForHand(st(), cp, pad("gated"))).toBe(false);
    expect(heldForHand(st([], ["x"]), cp, pad("gated"))).toBe(true);
  });
});

describe("locked pad reason line", () => {
  it("is empty when the pad is not locked", () => {
    expect(padLockReason(skin, { kind: "build", requiresCoreLevel: 2 }, false, 1)).toBe("");
    expect(padLockReason(skin, undefined, true, 1)).toBe("");
  });
  it("names the core level a build pad still needs", () => {
    expect(padLockReason(skin, { kind: "build", requiresCoreLevel: 2 }, true, 1)).toBe("Needs Reactor Lv2");
    expect(padLockReason(skin, { kind: "build", requiresCoreLevel: 3 }, true, 2)).toBe("Needs Reactor Lv3");
  });
  it("says no colonist is free for a locked hire pad, after the core level is met", () => {
    expect(padLockReason(skin, { kind: "hire" }, true, 1)).toBe("No free colonist");
    expect(padLockReason(skin, { kind: "hire", requiresCoreLevel: 2 }, true, 2)).toBe("No free colonist");
    expect(padLockReason(skin, { kind: "hire", requiresCoreLevel: 2 }, true, 1)).toBe("Needs Reactor Lv2");
  });
  it("says to do the job by hand first, ahead of any other reason", () => {
    expect(padLockReason(skin, { kind: "hire" }, true, 1, 0, true)).toBe("Do it by hand first");
    expect(padLockReason(skin, { kind: "hire", requiresCoreLevel: 2 }, true, 1, 0, true)).toBe("Do it by hand first");
  });
  it("falls back to a plain lock for any other locked pad", () => {
    expect(padLockReason(skin, { kind: "build" }, true, 1)).toBe("Locked");
  });
});
