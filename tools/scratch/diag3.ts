import { readFileSync } from "node:fs";
import { PROFILES, playBot } from "../../packages/bots/src/index.js";
const m = JSON.parse(readFileSync(`levels/packs/s1/s1-L037.json`, "utf8"));
let done = false;
playBot(m, PROFILES.good!, 1, { timeBudgetSeconds: 900, onTick: (st: any) => {
  if (st.tick === 270 * 30 || st.tick === 271 * 30 || st.tick === 280 * 30) {
    console.log("core", st.core.pos, "sections", st.barriers[0].sections.map((s: any) => `${s.gate ? "G" : ""}${s.built ? "b" : "o"}(${Math.round(s.a.x/1000)},${Math.round(s.a.y/1000)})`).join(" "));
    console.log("t", st.tick); for (const h of st.hostiles.slice(0, 4)) console.log(h.type, Math.round(h.pos.x / 1000), Math.round(h.pos.y / 1000), h.side, h.target, h.windup, h.shotCd);
    console.log("zones", st.zones.filter((z: any) => z.type === "zone.terrain" || z.type === "zone.blocked").map((z: any) => `${z.type}:${[z.rect.x,z.rect.y,z.rect.w,z.rect.h].map((v: number) => Math.round(v/1000)).join(",")}${z.cleared ? "c" : ""}`).join(" "));
  }
} } as any);
