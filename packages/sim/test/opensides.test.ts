import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createSim } from "../src/index.js";
import { buildSection, breakSection, sectionMid, sectionSide } from "../src/systems/barriers.js";
import { openMids } from "../src/systems/wallgrid.js";

// outpost-ops#239: the per-side open-section list must equal the plain scan, through builds and a broken gate.

const pack = (id: string): unknown => JSON.parse(readFileSync(new URL(`../../../levels/packs/s1/${id}.json`, import.meta.url), "utf8"));
const SIDES = ["n", "e", "s", "w"] as const;

describe("open sections per side equal the plain scan", () => {
  for (const id of ["s1-L021", "s1-L026", "s1-L048"]) {
    it(id, () => {
      const sim = createSim({ ...(pack(id) as object), seed: 1 });
      const st = sim.state, cp = sim.compiled;
      const same = (): number => {
        let open = 0;
        for (const side of SIDES) {
          const plain = st.barriers.flatMap((l) => l.sections.filter((s) => !s.built && sectionSide(st, s) === side).map(sectionMid));
          expect(openMids(st, side)).toEqual(plain);
          open += plain.length;
        }
        return open;
      };
      same();
      const secs = st.barriers.flatMap((line) => line.sections.map((s) => ({ line, s })));
      expect(secs.length).toBeGreaterThan(0);
      for (const { line, s } of secs) {
        if (!s.built) { buildSection(st, cp, line, s); }
        same();
      }
      expect(same()).toBe(0);
      const gate = secs.find((x) => x.s.gate);
      if (gate) { breakSection(st, gate.line, gate.line.sections.indexOf(gate.s), []); expect(same()).toBe(1); }
    });
  }
});
