import { closure, sequenceRange } from "../packages/sequencer/src/index.js";
import { buildLevel, templateById, knobsFor } from "../packages/generator/src/index.js";
import { PROFILES, playBot } from "../packages/bots/src/index.js";
const feat = process.argv.slice(3)[0] === "A3" ? ["material_processor", "tier2"] : ["material_processor"];
const base = sequenceRange(1, 25, [], { targetOffset: 0 })[24]!;
const mods = ["build_pads","carry","converters","core","gather","sales","supply_routing","workers"];
process.env["FO_KNOB_OVERRIDES"] = "";
for (let salt = 0; salt < 6; salt++) {
  try {
    const b = buildLevel({ id: "rt", seed: base.seed, family: "industrialize", secondary: null, features: feat, goalType: "automate", modules: closure(mods as never), template: templateById(base.template), knobs: knobsFor(0.3) }, salt);
    console.log("goal", JSON.stringify(b.manifest.goal));
    for (const s of [1, 2]) { const r = playBot(b.manifest, PROFILES["good"]!, s, { timeBudgetSeconds: 900 }); console.log(`seed ${s} won=${r.won} ${r.reason} stalls=${r.stalls} used=${JSON.stringify(r.used)} ${JSON.stringify(r.stallStates).slice(0, 900)}`); }
    break;
  } catch (e) { console.log(`salt ${salt}: ${(e as Error).message.slice(0,200)}`); }
}
void knobsFor;
