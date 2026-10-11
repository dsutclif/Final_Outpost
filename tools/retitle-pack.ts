import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { dedupeTitles } from "../packages/generator/src/index.js";

// One-off: unique, flavoured titles for an already built pack (levels 1-15 hand-written, the rest
// generated from the skin's title words and deduped). Text only, so feasibility is unaffected.
// pnpm exec vite-node tools/retitle-pack.ts -- [levels/packs/s1]

const dir = resolve(process.argv.slice(2).filter((a) => a !== "--")[0] ?? "levels/packs/s1");
const HAND: Record<string, string> = {
  "s1-L001": "First Light", "s1-L002": "Pods in the Dust", "s1-L003": "Green Shoots", "s1-L004": "The Smelter",
  "s1-L005": "First Raid", "s1-L006": "Roof Overhead", "s1-L007": "Hunters' Moon", "s1-L008": "Open Vault",
  "s1-L009": "Second Gear", "s1-L010": "Gun Line", "s1-L011": "Rising Flares", "s1-L012": "Thin Ice",
  "s1-L013": "Big Orders", "s1-L014": "Warehouse Rush", "s1-L015": "The Titan",
};
const pack = JSON.parse(readFileSync(join(dir, "pack.json"), "utf8")) as { levels: { id: string; file: string; title?: string; goal: string; modules: string[] }[] };
const titles = dedupeTitles(pack.levels, HAND);
for (const e of pack.levels) {
  const p = join(dir, e.file);
  const m = JSON.parse(readFileSync(p, "utf8")) as { text?: Record<string, { title?: string }> };
  (m.text ??= {})["mars_greenhouse"] = { ...m.text["mars_greenhouse"], title: titles[e.id]! };
  writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
  e.title = titles[e.id]!;
}
writeFileSync(join(dir, "pack.json"), JSON.stringify(pack, null, 2) + "\n");
console.log(pack.levels.map((e) => `${e.id} ${e.title}`).join("\n"));
