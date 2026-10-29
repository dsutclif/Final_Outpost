import { describe, expect, it } from "vitest";
import { ENGINE_VERSION } from "@fo/sim";
import { PROFILES, playBot } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level3 from "../../../levels/golden/proto-L003.json";
import story3 from "../../../levels/story/story-L003.json";
import s1l20 from "../../../levels/packs/s1/s1-L020.json";

// R3 item 8: with a serve timer on (0.6 s) the reference bot must still win.
const forced = (m: { params: Record<string, number> }) => ({ ...m, params: { ...m.params, "sales.serveSeconds": 0.6 } });

describe("bots with sales.serveSeconds = 0.6", () => {
  // pack levels only while the pack is pinned to this engine (it waits for its regeneration after a bump)
  const levels = [["proto-L001", level1], ["proto-L003", level3], ["story-L003", story3], ["s1-L020", s1l20]] as const;
  for (const [name, level] of levels.filter(([, l]) => (l as { engineVersion: string }).engineVersion === ENGINE_VERSION)) {
    it(`good bot still wins ${name}`, () => {
      const m = forced(level as never);
      for (const seed of [1, 2]) {
        const r = playBot(m, PROFILES["good"]!, seed);
        expect(r.won, `${name} seed ${seed}: ${r.reason}`).toBe(true);
      }
    });
  }
});
