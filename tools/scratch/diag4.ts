import { readFileSync } from "node:fs";
import { PROFILES, playBot } from "../../packages/bots/src/index.js";
const m = JSON.parse(readFileSync(`levels/packs/s1/s1-L037.json`, "utf8"));
playBot(m, PROFILES.good!, 1, { timeBudgetSeconds: 900, onTick: (st: any) => {
  if (st.tick >= 8100 && st.tick < 8112) { const h = st.hostiles[0]; console.log(st.tick, h && [h.pos.x, h.pos.y, h.id, h.target, h.windup, h.lungeCd, h.shotCd].join(" "), "player", st.player.pos.x, st.player.pos.y); }
} } as any);
