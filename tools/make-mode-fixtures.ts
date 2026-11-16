import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// Hand-made Cadet / Captain copies of three shipped test levels (outpost-ops#104).
// Only the planned mode dials change (docs/refinement/PLAN-2026-11-11-difficulty.md, F0):
//   burn 2.9 (Cadet) / 2.1 (Captain) off defend;  swarm +-20% on defend;  length +-20% elsewhere.
// Length is level.budgetSeconds; swarm is the swarmling count in every wave (Cadet -20%, Captain +20%). Pilot is the shipped level, untouched.
// Run: pnpm exec vite-node tools/make-mode-fixtures.ts
const OUT = "packages/rater/test/fixtures/modes";
const SRC: Record<string, string> = {
  defend: "levels/packs/s1/s1-L037.json",
  harvest: "levels/packs/s1/s1-L018.json",
  rescue: "levels/packs/s1/s1-L030.json",
};
const MODES = { cadet: { burn: 2.9, scale: 1.2 }, captain: { burn: 2.1, scale: 0.8 } } as const;
mkdirSync(OUT, { recursive: true });
for (const [family, path] of Object.entries(SRC)) {
  const base = JSON.parse(readFileSync(path, "utf8"));
  delete base.rating;
  writeFileSync(`${OUT}/${family}-pilot.json`, JSON.stringify({ ...base, id: `${family}-pilot` }) + "\n");
  for (const [mode, d] of Object.entries(MODES)) {
    const m = structuredClone(base);
    m.id = `${family}-${mode}`;
    if (family === "defend") {
      for (const w of m.waves) if (w.counts["hostile.swarmling"]) w.counts["hostile.swarmling"] = Math.round(w.counts["hostile.swarmling"] * (2 - d.scale));
    } else {
      m.params["core.burn"] = d.burn;
      m.params["level.budgetSeconds"] = Math.round(m.params["level.budgetSeconds"] * d.scale);
    }
    writeFileSync(`${OUT}/${family}-${mode}.json`, JSON.stringify(m) + "\n");
  }
}
