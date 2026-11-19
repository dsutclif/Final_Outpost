import { describe, expect, it } from "vitest";
import { PROFILES, playBot } from "../src/index.js";
import l10 from "../../../levels/packs/s1/s1-L010.json";
import l21 from "../../../levels/packs/s1/s1-L021.json";

// outpost-ops#86.2: on defend levels the bot's first purchase is the fuel hauler (the core supplier hire), never a guard
// or tower ahead of it, even though its pad shows only after the hand job was done once.
// NOTE: these test levels are replaced by the rebuild; keep the test on any defend level of the shipped pack.
const firstHire = (m: unknown): string | undefined => {
  let first: string | undefined;
  playBot(m, PROFILES["good"]!, 1, { timeBudgetSeconds: 120, onTick: (_s, _b, ev) => { for (const e of ev) if (e.t === "hired" && first === undefined) first = e.role; } });
  return first;
};

describe("defend fuel hauler first (86.2)", () => {
  it.each([["L010", l10], ["L021", l21]])("%s: first hire is the core supplier", (_n, m) => {
    expect(firstHire(m)).toBe("role.supplier");
  });
});
