import type { Manifest } from "@fo/content";
import { fmt, levelTitle, marsGreenhouse, nameOf, type Skin } from "@fo/skins";

// Player-facing text for the launch skin: a deterministic title from the goal and the headline
// module (the skin's title words), the goal line from the skin's goal templates, and one to three
// tips: the skin's tip for each module the level introduces, else for its headline module.

const BASIC = new Set(["carry", "gather", "core", "sales", "workers", "build_pads"]);

export function skinText(m: Manifest, introduced: readonly string[], skin: Skin = marsGreenhouse): { title: string; goal: string; tips: string[] } {
  const optional = m.modules.filter((x) => !BASIC.has(x));
  const headline = introduced.find((x) => !BASIC.has(x)) ?? introduced[0] ?? optional[optional.length - 1] ?? m.modules[m.modules.length - 1]!;
  // levelTitle reads the last non-basic module as the headline; put ours last.
  const order = [...m.modules.filter((x) => x !== headline), headline];
  const title = levelTitle(skin, { id: m.id, goal: m.goal, modules: order }) ?? m.id;
  const g = m.goal;
  const tmpl = skin.text.goals[g.type] ?? g.type;
  const goal = fmt(tmpl, {
    target: g.type === "build" ? nameOf(skin, "struct.landmark") : "",
    n: "n" in g ? g.n ?? 0 : 0,
  });
  const tipFor = (mod: string) => skin.text.moduleTips[mod];
  const tips = (introduced.length > 0 ? introduced : [headline]).map(tipFor).filter((t): t is string => !!t).slice(0, 3);
  if (tips.length === 0 && skin.text.genericTips[0]) tips.push(skin.text.genericTips[0]);
  return { title, goal, tips };
}
