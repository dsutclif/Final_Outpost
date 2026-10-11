import { marsGreenhouse as skin } from "@fo/skins";
import { describe, expect, it } from "vitest";
import { padLockReason } from "../src/padlock.js";

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
  it("falls back to a plain lock for any other locked pad", () => {
    expect(padLockReason(skin, { kind: "build" }, true, 1)).toBe("Locked");
  });
});
