import type { Manifest } from "@fo/content";
import { fmt, nameOf, uiText, type Skin } from "@fo/skins";

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
  const g = m.goal;
  const tpl = skin.text.goals[g.type] ?? nameOf(skin, `goal.${g.type}`);
  return fmt(tpl, { target: buildTargetName(m, skin), n: "n" in g ? g.n : "" });
}

export function levelText(m: Manifest, skin: Skin, index: number): LevelText {
  const own = m.text[skin.id];
  const title = own?.title || `${uiText(skin, "levelWord")} ${index + 1}`;
  const goal = own?.goal || goalText(m, skin);
  const tips = own?.tips?.length ? own.tips : skin.text.genericTips;
  return { title, goal, tips };
}

/** "1:23" from ticks at 30 tps. */
export function formatTicks(ticks: number, tps = 30): string {
  const s = Math.floor(ticks / tps);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
