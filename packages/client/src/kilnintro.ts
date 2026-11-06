import { content, type Manifest } from "@fo/content";
import { countName, fmt, type Skin } from "@fo/skins";
import { levelMachines } from "./objectives.js";
import { DIALOGUE_STYLES, type DialogueStyle, type PortraitMaker } from "./story/view.js";

// KILN's first-time coaching on regular levels (Doug, 2026-11-05). Story levels speak through their own
// script; a regular level assumes the player knows the mechanics, so the goal says only the goal and KILN
// speaks once at the start when the level brings in a mechanic the player hasn't met: one line per new
// module (skin text.kilnTips), one after another, each held until a tap. Uses the story's terminal
// dialogue style as it is, so KILN looks the same here as in the story.

type ConvDef = { inputs?: string[]; output?: string };

/** KILN's lines for this level: one per module new to the player that has a line, filled from the level. */
export function kilnLines(m: Manifest, skin: Skin, seenBefore: ReadonlySet<string> | null): string[] {
  const tips = skin.text.kilnTips;
  if (!tips) return [];
  const fresh = m.modules.filter((mod) => !seenBefore || !seenBefore.has(mod));
  // the converter line names this level's first machine, what goes in and what comes out
  const machine = levelMachines(m)[0];
  const def = machine ? (content.converters as Record<string, ConvDef>)[machine] : undefined;
  const ents = m.entities as { type: string; build?: string; id: string; target?: string }[];
  const unlock = ents.find((e) => e.type === "pad.build" && e.build === "node.enable");
  const source = unlock ? ents.find((x) => x.id === unlock.target)?.type : undefined;
  const vars: Record<string, string> = {
    machine: machine ? countName(skin, machine) : "converter",
    input: def?.inputs?.[0] ? countName(skin, def.inputs[0], 2) : "its input",
    output: def?.output ? countName(skin, def.output, 2) : "output",
    source: source ? countName(skin, source) : "source",
  };
  return fresh.map((mod) => tips[mod]).filter((t): t is string => !!t).map((t) => fmt(t, vars));
}

/** Shows KILN's lines one at a time over the map; a tap finishes the typing, the next tap moves on. */
export class KilnIntro {
  private readonly layer: HTMLElement;
  private readonly catcher: HTMLElement;
  private readonly style: DialogueStyle;
  private i = -1;

  constructor(shell: HTMLElement, private readonly lines: readonly string[], private readonly name: string, private readonly tapLabel: string, portrait: PortraitMaker | undefined, private readonly done: () => void) {
    const doc = shell.ownerDocument;
    this.layer = doc.createElement("div");
    this.layer.className = "story-layer kiln-intro";
    // the input controller ignores taps inside .hud, so these never move the hero
    this.catcher = doc.createElement("div");
    this.catcher.className = "kiln-tap hud";
    this.catcher.addEventListener("click", () => this.tap());
    shell.append(this.layer, this.catcher);
    this.style = (DIALOGUE_STYLES["terminal"] ?? DIALOGUE_STYLES["strip"]!)(this.layer, portrait);
    this.next();
  }

  private next(): void {
    this.i++;
    const text = this.lines[this.i];
    if (text === undefined) { this.dispose(); this.done(); return; }
    this.style.show({ name: this.name, text, portrait: "kiln", tap: true }, this.tapLabel);
  }

  private tap(): void {
    if (this.style.finish?.()) return;
    this.next();
  }

  /** Per frame (seconds): types the line out and keeps KILN's portrait moving. */
  frame(t: number): void { this.style.frame?.(t); }

  dispose(): void {
    this.style.clear();
    this.style.dispose?.();
    this.layer.remove();
    this.catcher.remove();
  }
}
