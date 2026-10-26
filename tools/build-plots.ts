// pnpm plots:build: work every building's plot out of look.json and the Meshy model fits, and write
// packages/content/data/plot.json (the game uses it when look.json plotLayout.on is set). Run it after
// changing look.json's sizes or pads, or rebuilding models, then rebuild the packs.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LOOK, contentBase } from "../packages/content/src/index.js";
import { computePlots } from "../packages/generator/src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const gen = JSON.parse(readFileSync(resolve(here, "../packages/generator/data/generator.json"), "utf8")) as { cashierPads: [number, number][]; spacing: { standR: number } };
const pl = LOOK.plotLayout;
if (!pl) throw new Error("look.json has no plotLayout");
const data = computePlots({
  buildScale: LOOK.buildScale, modelScale: LOOK.modelScale, pad: pl.pad, charScale: LOOK.charScale, plateK: pl.plateK,
  standR: gen.spacing.standR, base: contentBase, cashierPads: gen.cashierPads,
});
const out = resolve(here, "../packages/content/data/plot.json");
const doc = "Written by pnpm plots:build (tools/build-plots.ts) from look.json and the Meshy model fits; do not edit by hand. Used only when look.json plotLayout.on is set.";
// number pairs and boxes on one line, as the other data files keep them
const text = JSON.stringify({ _doc: doc, ...data }, null, 2).replace(/\[\s+(-?[\d.]+(?:,\s+-?[\d.]+)*)\s+\]/g, (_m, inner: string) => `[${inner.replace(/,\s+/g, ", ")}]`);
writeFileSync(out, text + "\n");
console.log(`plot.json: ${Object.keys(data.generator.plots).length} plots · pad ${data.render.pad} · operator plate ${data.render.plate}`);
