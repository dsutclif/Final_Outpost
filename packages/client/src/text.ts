import type { Manifest } from "@fo/content";
import { fmt, levelTitle, nameOf, uiText, type Skin } from "@fo/skins";
import { labelOf, manifestObjectives } from "./objectives.js";

// Player-facing level text. A manifest may carry text per skin; otherwise the skin builds
// a title and goal from the canonical goal, so any level plays in any skin.

export interface LevelText { title: string; goal: string; tips: string[] }

/** Name of what a build goal builds: the target pad's struct, in the skin's words. */
function buildTargetName(m: Manifest, skin: Skin): string {
  if (m.goal.type !== "build") return "";
  const target = m.goal.target;
  const pad = m.entities.find((e) => e.id === target);
  if (pad && pad.type === "pad.build") return nameOf(skin, pad.build);
  return nameOf(skin, "struct.landmark");
}

export function goalText(m: Manifest, skin: Skin): string {
  // the main objective mirrors the goal and carries its params, so its label is the best sentence
  const main = manifestObjectives(m)[0];
  if (main) return labelOf(m, skin, main);
  const g = m.goal;
  const tpl = skin.text.goals[g.type] ?? nameOf(skin, `goal.${g.type}`);
  return fmt(tpl, { target: buildTargetName(m, skin), n: "n" in g ? (g.n ?? "") : "" });
}

/**
 * Tips for a level: the manifest's own text for this skin, else one skin tip per module the
 * level introduces (modules not seen in earlier levels), else the skin's generic tips.
 */
export function moduleTips(m: Manifest, skin: Skin, seenBefore: ReadonlySet<string> | null, max = 4): string[] {
  // basics the how-to line already covers go last
  const rank = (mod: string): number => (mod === "carry" || mod === "gather" ? 1 : 0);
  const fresh = m.modules.filter((mod) => !seenBefore || !seenBefore.has(mod)).sort((a, b) => rank(a) - rank(b));
  const tips = fresh.map((mod) => skin.text.moduleTips?.[mod]).filter((t): t is string => !!t);
  return tips.slice(0, max);
}

export function levelText(m: Manifest, skin: Skin, index: number, seenBefore: ReadonlySet<string> | null = null): LevelText {
  const own = m.text[skin.id];
  // manifest text for this skin, else the skin's own title for the level id, else a generated one
  const title = levelTitle(skin, m) || `${uiText(skin, "levelWord")} ${index + 1}`;
  // generated packs wrote the raw goal kind ("heat_hold") as text: only trust a real sentence
  const goal = own?.goal && /\s/.test(own.goal) && manifestObjectives(m).length === 0 ? own.goal : goalText(m, skin);
  const fromModules = moduleTips(m, skin, seenBefore);
  const tips = own?.tips?.length ? own.tips : fromModules.length ? fromModules : skin.text.genericTips;
  return { title, goal, tips };
}

/** "1:23" from ticks at 30 tps. */
export function formatTicks(ticks: number, tps = 30): string {
  const s = Math.floor(ticks / tps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
