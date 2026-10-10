import type { Skin } from "@fo/skins";
import { MaterialSet } from "../materials.js";
import { deriveTokens } from "../tokens.js";
import { buildPartGeos } from "./characters.js";
import type { BuildCtx } from "./common.js";

/** Tokens, the shared material set and the rig parts for a skin: everything builders need. */
export function createBuildCtx(skin: Skin, level = 1): BuildCtx {
  const t = deriveTokens(skin);
  return { t, mats: new MaterialSet(t), parts: buildPartGeos(t), models: skin.models, level };
}

export function disposeBuildCtx(ctx: BuildCtx): void {
  ctx.mats.dispose();
  for (const g of ctx.parts.values()) g.dispose();
}
