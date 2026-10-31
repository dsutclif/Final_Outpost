import type { StoryHudPart } from "@fo/skins";
import type { DialogueLine, StarSlot, StoryView } from "./director.js";
import "./story.css";

// The director's DOM. Dialogue goes through DIALOGUE_STYLES, so trying another look means adding one
// entry (and its CSS) and setting `story.dialogue` in the skin; nothing else changes.

export interface DialogueStyle { show(l: DialogueLine, tapLabel: string): void; clear(): void; frame?(t: number): void; dispose?(): void }

/** A portrait that draws itself: its canvas goes in the slot and `update` keeps it moving while it shows. */
export interface LivePortrait { readonly canvas: HTMLCanvasElement; update(t: number): void; dispose(): void }
export type PortraitMaker = (key: string) => LivePortrait | null;

/** Style A: a strip under the HUD with a portrait slot, speaker name and line. */
function stripDialogue(layer: HTMLElement, portrait?: PortraitMaker): DialogueStyle {
  const root = layer.ownerDocument.createElement("div");
  root.className = "sdlg-strip";
  root.hidden = true;
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `<div class="sdlg-portrait" hidden></div><div class="sdlg-body"><div class="sdlg-who"><b></b><span class="sdlg-tag"></span></div><p class="sdlg-text"></p><div class="sdlg-tap" hidden></div></div>`;
  layer.append(root);
  const $ = (sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
  const live = new Map<string, LivePortrait | null>();
  let showing: LivePortrait | null = null;
  return {
    show(l, tapLabel) {
      const pic = $(".sdlg-portrait");
      pic.hidden = !l.portrait;
      if (l.portrait && !live.has(l.portrait)) {
        // a second GL context is the first thing a struggling phone refuses: the slot then stays a plain disc
        let made: LivePortrait | null = null;
        try { made = portrait?.(l.portrait) ?? null; } catch { made = null; }
        live.set(l.portrait, made);
      }
      showing = l.portrait ? live.get(l.portrait) ?? null : null;
      pic.replaceChildren(...(showing ? [showing.canvas] : []));
      $(".sdlg-who b").textContent = l.name;
      $(".sdlg-who").hidden = !l.name;
      $(".sdlg-tag").textContent = l.tag ? `· ${l.tag}` : "";
      $(".sdlg-text").textContent = l.text;
      $(".sdlg-tap").textContent = tapLabel;
      $(".sdlg-tap").hidden = !l.tap;
      root.hidden = false;
      root.classList.remove("in");
      void root.offsetWidth;
      root.classList.add("in");
    },
    clear() { root.hidden = true; showing = null; },
    frame(t) { showing?.update(t); },
    dispose() { for (const p of live.values()) p?.dispose(); live.clear(); showing = null; },
  };
}

/** The reactor spirit's readout: a terminal panel low on the screen, the live cloud beside it, the line typed out. */
function terminalDialogue(layer: HTMLElement, portrait?: PortraitMaker): DialogueStyle {
  const CPS = 34;
  const root = layer.ownerDocument.createElement("div");
  root.className = "sdlg-term";
  root.hidden = true;
  root.setAttribute("aria-live", "polite");
  root.innerHTML = `<div class="sdlg-term-cloud" hidden></div><div class="sdlg-term-body"><p class="sdlg-term-text"><b></b><span class="sdlg-term-typed"></span><i class="sdlg-term-cursor"></i></p><div class="sdlg-tap" hidden></div></div>`;
  layer.append(root);
  const $ = (sel: string): HTMLElement => root.querySelector<HTMLElement>(sel)!;
  const live = new Map<string, LivePortrait | null>();
  let showing: LivePortrait | null = null, full = "", began: number | null = null, shown = -1;
  return {
    show(l, tapLabel) {
      if (l.portrait && !live.has(l.portrait)) {
        let made: LivePortrait | null = null;
        try { made = portrait?.(l.portrait) ?? null; } catch { made = null; }
        live.set(l.portrait, made);
      }
      showing = l.portrait ? live.get(l.portrait) ?? null : null;
      const cloud = $(".sdlg-term-cloud");
      cloud.hidden = !showing;
      cloud.replaceChildren(...(showing ? [showing.canvas] : []));
      $(".sdlg-term-text b").textContent = `${l.name} > `;
      // the whole line for screen readers; the eye gets it typed
      root.setAttribute("aria-label", `${l.name}: ${l.text}`);
      $(".sdlg-term-typed").textContent = "";
      full = l.text; began = null; shown = -1;
      $(".sdlg-tap").textContent = tapLabel;
      $(".sdlg-tap").hidden = !l.tap;
      root.hidden = false;
    },
    clear() { root.hidden = true; showing = null; full = ""; },
    frame(t) {
      showing?.update(t);
      if (!full) return;
      began ??= t;
      const n = Math.min(full.length, Math.floor((t - began) * CPS));
      if (n !== shown) { shown = n; $(".sdlg-term-typed").textContent = full.slice(0, n); }
    },
    dispose() { for (const p of live.values()) p?.dispose(); live.clear(); showing = null; },
  };
}

export const DIALOGUE_STYLES: Readonly<Record<string, (layer: HTMLElement, portrait?: PortraitMaker) => DialogueStyle>> = { strip: stripDialogue, terminal: terminalDialogue };

const STAR_D = "M12 1.8l3.1 6.4 7 .9-5.1 4.9 1.3 6.9L12 17.6l-6.3 3.3 1.3-6.9-5.1-4.9 7-.9z";
const CRACK_D = "M13.5 2.5l-2.5 6 3 3-3.5 3.5 1.5 3.5";
const slotHtml = (s: StarSlot): string =>
  `<svg class="sslot ${s}" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="${STAR_D}"/>${s === "cracked" ? `<path class="crack" d="${CRACK_D}"/>` : ""}</svg>`;

/** Which HUD node each hideable part is. */
const PARTS: Readonly<Record<StoryHudPart, string>> = {
  credits: "#cash", fuel: "#heatRail", walls: "#wallRail", name: "#lvlName", retry: "#retryBtn", settings: "#gearBtn", help: "#helpBtn",
};

/** `shell` is the element holding .fhud and the overlays. Everything added here is removed by dispose. */
export function createStoryView(shell: HTMLElement, opts: { dialogue?: string | undefined; tapLabel: string; portrait?: PortraitMaker | undefined }): StoryView {
  const doc = shell.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "story-layer";
  shell.append(layer);
  // one instance per style in use: a speaker's own style, else the skin's
  const baseStyle = opts.dialogue ?? "strip";
  const styles = new Map<string, DialogueStyle>();
  const styleOf = (name: string | undefined): DialogueStyle => {
    const key = name && DIALOGUE_STYLES[name] ? name : baseStyle;
    let s = styles.get(key);
    if (!s) { s = (DIALOGUE_STYLES[key] ?? stripDialogue)(layer, opts.portrait); styles.set(key, s); }
    return s;
  };
  let dialogue: DialogueStyle | null = null;

  const panel = (cls: string): HTMLElement => {
    const el = doc.createElement("div");
    el.className = cls;
    el.hidden = true;
    layer.append(el);
    return el;
  };
  const tapCatch = panel("story-tap"), card = panel("story-card"), prompt = panel("story-prompt");

  const goalsHost = shell.querySelector<HTMLElement>("#goals");
  const goals = doc.createElement("div");
  goals.className = "sgoals";
  goalsHost?.parentElement?.insertBefore(goals, goalsHost);
  shell.classList.add("story-on");

  let tap: (() => void) | null = null;
  const onLayerTap = (): void => { tap?.(); };
  tapCatch.addEventListener("click", onLayerTap);
  card.addEventListener("click", onLayerTap);
  let hiddenNow: Element[] = [];
  const text = (tag: string, cls: string, s: string): HTMLElement => {
    const el = doc.createElement(tag);
    el.className = cls;
    el.textContent = s;
    return el;
  };

  return {
    line(l) {
      const next = styleOf(l.style);
      if (dialogue && dialogue !== next) dialogue.clear();
      dialogue = next;
      shell.classList.add("story-talking");
      next.show(l, opts.tapLabel);
    },
    clearLine() { shell.classList.remove("story-talking"); dialogue?.clear(); },
    card(c) {
      card.classList.toggle("day", c.day);
      card.replaceChildren(text("p", "story-card-text", c.text), ...(c.sub ? [text("p", "story-card-sub", c.sub)] : []));
      card.hidden = false;
    },
    clearCard() { card.hidden = true; },
    onTap(fn) { tap = fn; tapCatch.hidden = !fn; },
    prompt(p, retry, other) {
      const go = text("button", "story-retry", p.retry), no = text("button", "story-other", p.other);
      go.onclick = retry;
      no.onclick = other;
      prompt.replaceChildren(text("h2", "", p.text), go, no);
      prompt.hidden = false;
    },
    clearPrompt() { prompt.hidden = true; },
    hud(hidden) {
      for (const el of hiddenNow) el.classList.remove("story-hide");
      hiddenNow = [...hidden].flatMap((p) => { const el = shell.querySelector(PARTS[p]); return el ? [el] : []; });
      for (const el of hiddenNow) el.classList.add("story-hide");
    },
    goals(slots, current) {
      const stars = doc.createElement("div");
      stars.className = "sslots";
      stars.setAttribute("role", "img");
      stars.setAttribute("aria-label", `${slots.filter((s) => s === "earned").length}/${slots.length}`);
      stars.innerHTML = slots.map(slotHtml).join("");
      goals.replaceChildren(stars, text("div", "sgoal-now", current ?? ""));
    },
    frame(t) { dialogue?.frame?.(t); },
    dispose() {
      for (const s of styles.values()) s.dispose?.();
      for (const el of hiddenNow) el.classList.remove("story-hide");
      shell.classList.remove("story-on", "story-talking");
      goals.remove();
      layer.remove();
    },
  };
}
