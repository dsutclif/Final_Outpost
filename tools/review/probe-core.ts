import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Box, CaptionSample, DomItem, FrameRec, LabelSample, Sample, StorySnapshot, ThingSample } from "./probe-types.js";

// The judging half of the screen probes: pure functions from one Sample (what the page measured) and the
// limits in probe-limits.json to findings. No browser, no files, so every rule here is unit tested.

export interface Limits {
  sampleEveryTicks: number;
  warmupSeconds: number;
  occlusion: { fraction: number; seconds: number; gridX: number; gridY: number; thingShrink: number };
  float: { limitU: number; seconds: number; settleSeconds: number; ignoreIds: string[] };
  overlap: { seconds: number; characterMerge: number; solidShrink: number; solidIds: string[] };
  offscreen: { slackPx: number; seconds: number; labelVisibleMin: number };
  uiOverlap: { fraction: number; seconds: number };
  heroCovered: { fraction: number; seconds: number };
  contrastMin: number;
  tapTargetPt: number;
  textMinPx: number;
  caption: { aboveSlackPx: number; faceFraction: number; faceTopShare: number; headBoxPx: number };
  frame: { longMs: number; hitchRatio: number; p95Ms: number; hitchMs: number; warmupFrames: number };
  resume: { tickDriftWhileHidden: number; spikeMs: number; reloadReadyMs: number };
  colourBlind: { minDeltaE: number };
  continuity: { lightRatio: number; positionU: number };
  shots: { perLevel: number; perStoryLevel: number; checkpointSeconds: number[] };
}

export type Severity = 1 | 2 | 3 | 4;

/** One thing a probe measured past its limit in one sample. */
export interface Hit {
  /** The rule that fired: `float`, `occluded`, `offscreen`, ... */
  check: string;
  /** Feedback category (docs/review/PLAYTEST-REVIEW-PLAN.md section 1). */
  cat: number;
  severity: Severity;
  /** Canonical id, DOM selector or metric the finding is about; no numbers. */
  subject: string;
  title: string;
  detail: string;
  metric: { name: string; value: number; limit: number };
  /** Persistence this rule needs, in seconds (0: one sample is enough). */
  seconds: number;
  track: "main" | "story";
  /** The screen box (viewport CSS px) of the element the check judged: what the probe outlines in the picture. */
  box?: Box;
}

/** A finding in the shape docs/review/CONTRACT.md section 4 wants. */
export interface Candidate {
  fingerprint: string;
  category: number;
  severity: Severity;
  via: "probe";
  pillar: number;
  track: "main" | "story";
  levelId: string;
  title: string;
  detail: string;
  metric: { name: string; value: number; limit: number };
  /** [close-up crop, full frame] when the probe could mark the problem; one full frame or none otherwise. */
  evidence: string[];
  /** The box that is outlined in the pictures (viewport CSS px). Absent for findings with no place on screen. */
  box?: Box;
}

// ------------------------------------------------------------------ geometry

export const width = (b: Box): number => b.x1 - b.x0;
export const height = (b: Box): number => b.y1 - b.y0;
export const area = (b: Box): number => Math.max(0, width(b)) * Math.max(0, height(b));

export function intersect(a: Box, b: Box): Box | null {
  const x0 = Math.max(a.x0, b.x0), y0 = Math.max(a.y0, b.y0), x1 = Math.min(a.x1, b.x1), y1 = Math.min(a.y1, b.y1);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null;
}

export const union = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

export const overlapArea = (a: Box, b: Box): number => { const i = intersect(a, b); return i ? area(i) : 0; };

/** A box pulled in by `k` of its size on every side (a character's silhouette is smaller than its bounds). */
export function shrink(b: Box, k: number): Box {
  const dx = width(b) * k, dy = height(b) * k;
  return { x0: b.x0 + dx, y0: b.y0 + dy, x1: b.x1 - dx, y1: b.y1 - dy };
}

/** How much of `target` the union of `covers` hides, 0..1, by sampling a grid of points inside it. */
export function coveredFraction(target: Box, covers: readonly Box[], gx = 12, gy = 6): number {
  if (area(target) <= 0 || covers.length === 0) return 0;
  let hit = 0;
  for (let j = 0; j < gy; j++) {
    const y = target.y0 + ((j + 0.5) / gy) * height(target);
    for (let i = 0; i < gx; i++) {
      const x = target.x0 + ((i + 0.5) / gx) * width(target);
      if (covers.some((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)) hit++;
    }
  }
  return hit / (gx * gy);
}

/** Fraction of `b` that lies inside `view`. */
export const visibleFraction = (b: Box, view: Box): number => (area(b) > 0 ? overlapArea(b, view) / area(b) : 1);

// ------------------------------------------------------------------ colour

const lin = (c: number): number => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

export function parseColour(c: string): [number, number, number, number] | null {
  const m = /rgba?\(([^)]+)\)/.exec(c);
  if (!m) return null;
  const p = m[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
  if (p.length < 3 || p.some((x) => !Number.isFinite(x))) return null;
  return [p[0]!, p[1]!, p[2]!, p[3] ?? 1];
}

export const luminance = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

/** WCAG contrast ratio between two colours, 1..21. */
export function contrast(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const la = luminance(a[0], a[1], a[2]), lb = luminance(b[0], b[1], b[2]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Viénot et al. 1999 simulation of deuteranopia on linear RGB (the filter the colour-blind pass applies). */
export function deuteranopia(rgb: readonly [number, number, number]): [number, number, number] {
  const [r, g, b] = [lin(rgb[0]), lin(rgb[1]), lin(rgb[2])];
  const out = [0.29275 * r + 0.70725 * g, 0.29275 * r + 0.70725 * g, -0.02234 * r + 0.02234 * g + b].map((v) => Math.max(0, Math.min(1, v)));
  const enc = (v: number): number => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  return [enc(out[0]!), enc(out[1]!), enc(out[2]!)];
}

/** CIE76 colour difference (Lab, D65). Around 2 is just noticeable; below ~12 two cues read as one. */
export function deltaE(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const lab = (c: readonly [number, number, number]): [number, number, number] => {
    const [r, g, bl] = [lin(c[0]), lin(c[1]), lin(c[2])];
    const x = (0.4124 * r + 0.3576 * g + 0.1805 * bl) / 0.95047, y = 0.2126 * r + 0.7152 * g + 0.0722 * bl, z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;
    const f = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
  };
  const [l1, a1, b1] = lab(a), [l2, a2, b2] = lab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}

// ------------------------------------------------------------------ naming

/** A subject with no numbers, so the same defect matches on another night. */
export const plain = (s: string): string => s.replace(/\d+/g, "#").replace(/\s+/g, " ").trim().slice(0, 60);

/** What a floating label is: its kind, plus its name when it carries one (`disc|Reactor|...`). */
export function labelSubject(key: string): string {
  const [kind = "label", name] = key.split("|");
  return plain(kind === "disc" && name ? `label.disc:${name}` : `label.${kind}`);
}

const idName = (id: string): string => id.replace(/^[a-z]+\./, "").replace(/_/g, " ");

const PILLAR: Record<number, number> = { 1: 1, 2: 4, 3: 1, 4: 4, 5: 5, 7: 1, 12: 4, 13: 7, 14: 1 };
export const pillarOf = (cat: number): number => PILLAR[cat] ?? 1;

export function fingerprintOf(cat: number, levelId: string, subject: string, check: string): string {
  return `cat${cat}|${levelId || "*"}|${subject}|${check}`;
}

// ------------------------------------------------------------------ the rules, one sample at a time

const re = (list: readonly string[]): RegExp[] => list.map((p) => new RegExp(p));
const anyMatch = (rs: readonly RegExp[], s: string): boolean => rs.some((r) => r.test(s));

const isText = (d: DomItem): boolean => d.text.length > 0;

/** Boxes that are drawn over the 3D world whatever their depth: the DOM's panels and buttons (not the full-screen tap layers). */
const panelBoxes = (s: Sample, maxShare = 0.35): Box[] => s.dom.filter((d) => d.region !== "world" && (d.tap || d.bg !== null) && d.opacity > 0.4 && area(d.box) < maxShare * s.viewport.w * s.viewport.h).map((d) => d.box);

export function analyzeSample(s: Sample, L: Limits, story = false): Hit[] {
  const out: Hit[] = [];
  const view: Box = { x0: 0, y0: 0, x1: s.viewport.w, y1: s.viewport.h };
  const track: Hit["track"] = story ? "story" : "main";
  const age = (t: ThingSample): number => t.age;

  // 1. labels hidden behind things in front of them, or behind a HUD panel
  const covers = s.things.filter((t) => t.kind !== "other" && t.age >= 0.5);
  const panels = panelBoxes(s);
  // distance along the camera's view over the ground: a thing stands in front of a label when all of its footprint is nearer
  const along = (x: number, z: number): number => (x - s.cam.x) * s.cam.fx + (z - s.cam.z) * s.cam.fz;
  for (const l of s.labels) {
    // a label the player cannot see (mostly off screen) is not a visible defect, and no picture could show it
    if (area(l.box) < 36 || visibleFraction(l.box, view) < 0.5) continue;
    const at = along(l.world.x, l.world.z);
    const front = covers.filter((t) => Math.max(along(t.foot.x0, t.foot.z0), along(t.foot.x1, t.foot.z0), along(t.foot.x0, t.foot.z1), along(t.foot.x1, t.foot.z1)) < at);
    const boxes = front.map((t) => (t.kind === "character" ? shrink(t.box, L.occlusion.thingShrink * 2) : shrink(t.box, L.occlusion.thingShrink)));
    const f = coveredFraction(l.box, [...boxes, ...panels], L.occlusion.gridX, L.occlusion.gridY);
    if (f > L.occlusion.fraction) {
      // who is in the way: the thing that alone hides the most of it, or the HUD
      const by = front.map((t, i) => ({ id: t.id, f: coveredFraction(l.box, [boxes[i]!], L.occlusion.gridX, L.occlusion.gridY) })).sort((a, b) => b.f - a.f)[0];
      const who = by && by.f > 0 ? by.id : "the HUD";
      out.push(hit("occluded", 1, f > 0.6 ? 3 : 2, labelSubject(l.key), `Label "${l.key.split("|")[1] ?? l.key.split("|")[0]}" is ${Math.round(f * 100)}% covered`, `A floating label is ${Math.round(f * 100)}% hidden, mostly by ${who} (limit ${Math.round(L.occlusion.fraction * 100)}%)`, "coveredFraction", f, L.occlusion.fraction, L.occlusion.seconds, track, l.box));
    }
  }

  // 2. floating: a model's lowest point above where the renderer's rules put its base
  const ignore = re(L.float.ignoreIds);
  for (const t of s.things) {
    if (t.kind === "character" || age(t) < L.float.settleSeconds || anyMatch(ignore, t.id)) continue;
    const up = t.baseY - t.ruleY;
    // 28 u is a metre: a hand's breadth of gap is cosmetic, a metre of it is not
    if (up > L.float.limitU) out.push(hit("float", 2, up > 28 ? 2 : 1, t.id, `${idName(t.id)} floats above the ground`, `Base ${up.toFixed(2)} u above where it should stand (${t.ruleY.toFixed(1)} u) at (${((t.foot.x0 + t.foot.x1) / 2).toFixed(0)}, ${((t.foot.z0 + t.foot.z1) / 2).toFixed(0)})`, "floatU", up, L.float.limitU, L.float.seconds, track, t.box));
  }

  // 3. characters merging with each other or standing inside a building
  const chars = s.things.filter((t) => t.kind === "character");
  const rOf = (t: ThingSample): number => 0.12 * Math.max(1, t.topY - t.baseY);
  const cx = (t: ThingSample): number => (t.foot.x0 + t.foot.x1) / 2, cz = (t: ThingSample): number => (t.foot.z0 + t.foot.z1) / 2;
  for (let i = 0; i < chars.length; i++) for (let j = i + 1; j < chars.length; j++) {
    const a = chars[i]!, b = chars[j]!;
    const d = Math.hypot(cx(a) - cx(b), cz(a) - cz(b)), lim = (rOf(a) + rOf(b)) * L.overlap.characterMerge;
    if (d < lim) out.push(hit("overlap", 2, 2, `${kindOfKey(a)}+${kindOfKey(b)}`, `${idName(a.id)} and ${idName(b.id)} stand inside each other`, `Centres ${d.toFixed(1)} u apart; people are ${(rOf(a) + rOf(b)).toFixed(0)} u across (limit ${lim.toFixed(1)} u)`, "centreDistanceU", d, lim, L.overlap.seconds, track, union(a.box, b.box)));
  }
  const solid = re(L.overlap.solidIds);
  for (const b of s.things.filter((t) => t.kind === "building" && anyMatch(solid, t.id))) {
    const kx = (b.foot.x1 - b.foot.x0) * L.overlap.solidShrink, kz = (b.foot.z1 - b.foot.z0) * L.overlap.solidShrink;
    for (const c of chars) {
      if (cx(c) > b.foot.x0 + kx && cx(c) < b.foot.x1 - kx && cz(c) > b.foot.z0 + kz && cz(c) < b.foot.z1 - kz) {
        out.push(hit("overlap", 2, 2, `${kindOfKey(c)}+${b.id}`, `${idName(c.id)} walks through ${idName(b.id)}`, `Its centre is inside the building's footprint (shrunk ${Math.round(L.overlap.solidShrink * 100)}% a side)`, "insideFootprint", 1, 0, L.overlap.seconds, track, union(c.box, b.box)));
      }
    }
  }

  // 4. DOM text and buttons: off screen, into the notch, too small, low contrast, too small to press
  for (const d of s.dom) {
    if (!isText(d) && !d.tap) continue;
    const vis = visibleFraction(d.box, view);
    const slack = L.offscreen.slackPx;
    const out0 = d.box.x0 < -slack || d.box.y0 < -slack || d.box.x1 > view.x1 + slack || d.box.y1 > view.y1 + slack;
    if (out0 && vis > 0 && d.region !== "world") out.push(hit("offscreen", 1, vis < 0.6 ? 3 : 2, `dom:${d.sel}`, `"${d.text || d.sel}" runs off the screen`, `${Math.round((1 - vis) * 100)}% of ${d.sel} is outside the ${s.viewport.w}x${s.viewport.h} screen`, "visibleFraction", vis, 1, L.offscreen.seconds, track, d.box));
    if (d.region !== "world" && d.region !== "overlay" && vis > 0.99 && (d.box.y0 < s.safe.top - slack || d.box.x0 < s.safe.left - slack || d.box.x1 > view.x1 - s.safe.right + slack || d.box.y1 > view.y1 - s.safe.bottom + slack)) {
      out.push(hit("unsafe", 13, 2, `dom:${d.sel}`, `"${d.text || d.sel}" sits in the notch or home-bar area`, `${d.sel} reaches into the safe-area inset (top ${s.safe.top}, bottom ${s.safe.bottom})`, "insetPx", Math.max(s.safe.top - d.box.y0, d.box.y1 - (view.y1 - s.safe.bottom), 0), 0, L.offscreen.seconds, track, d.box));
    }
    if (d.text && d.fontPx > 0 && d.fontPx < L.textMinPx) out.push(hit("small-text", 1, 1, `dom:${d.sel}`, `Text "${d.text.slice(0, 24)}" is tiny`, `${d.fontPx.toFixed(1)} px text (limit ${L.textMinPx} px)`, "fontPx", d.fontPx, L.textMinPx, 0, track, d.box));
    if (d.text && !d.outlined && d.bg) {
      const fg = parseColour(d.color), bg = parseColour(d.bg);
      if (fg && bg && fg[3] > 0.5) {
        const c = contrast([fg[0], fg[1], fg[2]], [bg[0], bg[1], bg[2]]);
        if (c < L.contrastMin) out.push(hit("contrast", 14, c < 2 ? 3 : 2, `dom:${d.sel}`, `Text "${d.text.slice(0, 24)}" is hard to read`, `Contrast ${c.toFixed(2)}:1 against its background (limit ${L.contrastMin}:1)`, "contrastRatio", c, L.contrastMin, 0, track, d.box));
      }
    }
    if (d.tap && d.region !== "world") {
      const small = Math.min(width(d.box), height(d.box));
      if (small < L.tapTargetPt) out.push(hit("tap-target", 7, small < 32 ? 2 : 1, `dom:${d.sel}`, `"${d.text || d.sel}" is a small tap target`, `${width(d.box).toFixed(0)}x${height(d.box).toFixed(0)} pt (limit ${L.tapTargetPt} pt)`, "minSidePt", small, L.tapTargetPt, 0, track, d.box));
    }
  }

  // 5. world labels cut by the screen edge, and labels or panels stacked on each other
  for (const l of s.labels) {
    const vis = visibleFraction(l.box, view);
    if (vis > L.offscreen.labelVisibleMin && vis < 0.95) out.push(hit("offscreen", 1, 1, labelSubject(l.key), `Label "${l.key.split("|")[1] ?? l.key.split("|")[0]}" is cut by the screen edge`, `${Math.round((1 - vis) * 100)}% of it is off screen`, "visibleFraction", vis, 0.95, L.offscreen.seconds, track, l.box));
  }
  const stackable: { sub: string; box: Box; label: boolean; idx: number }[] = [
    ...s.labels.filter((l) => area(l.box) > 36 && visibleFraction(l.box, view) >= 0.5).map((l) => ({ sub: labelSubject(l.key), box: l.box, label: true, idx: -1 })),
    ...s.dom.flatMap((d, idx) => (d.region !== "overlay" && d.text && d.region !== "world" ? [{ sub: `dom:${d.sel}`, box: d.box, label: false, idx }] : [])),
  ];
  const within = (idx: number, of: number): boolean => { for (let p = idx; p >= 0; p = s.dom[p]?.parent ?? -1) if (p === of) return true; return false; };
  for (let i = 0; i < stackable.length; i++) for (let j = i + 1; j < stackable.length; j++) {
    const a = stackable[i]!, b = stackable[j]!;
    if (a.sub === b.sub || (!a.label && !b.label && (within(a.idx, b.idx) || within(b.idx, a.idx)))) continue;
    const o = overlapArea(a.box, b.box), small = Math.min(area(a.box), area(b.box));
    if (small > 0 && o / small > L.uiOverlap.fraction) {
      const [x, y] = [a.sub, b.sub].sort() as [string, string];
      out.push(hit("ui-overlap", 1, o / small > 0.6 ? 3 : 2, `${x}+${y}`, `${a.label ? "Label" : "Text"} ${x.replace(/^(dom:|label\.)/, "")} overlaps ${y.replace(/^(dom:|label\.)/, "")}`, `${Math.round((o / small) * 100)}% of the smaller one is covered by the other (limit ${Math.round(L.uiOverlap.fraction * 100)}%)`, "overlapFraction", o / small, L.uiOverlap.fraction, L.uiOverlap.seconds, track, union(a.box, b.box)));
    }
  }

  // 6. the hero under a panel
  const hero = s.things.find((t) => t.key === "player");
  if (hero) {
    const f = coveredFraction(hero.box, panelBoxes(s).filter((b) => area(b) < area(view) * 0.6), 8, 8);
    if (f > L.heroCovered.fraction) out.push(hit("hero-covered", 3, 2, "unit.player", `The hero is ${Math.round(f * 100)}% under a panel`, `A HUD panel or caption hides ${Math.round(f * 100)}% of the hero's box (limit ${Math.round(L.heroCovered.fraction * 100)}%)`, "coveredFraction", f, L.heroCovered.fraction, L.heroCovered.seconds, track, hero.box));
  }

  // 7. the story caption against its speaker
  if (s.caption) out.push(...analyzeCaption(s.caption, s, L));
  return out;
}

const kindOfKey = (t: ThingSample): string => t.id;

/** The speaker's face: the top slice of their box, or a small box round the head point. */
export function faceBox(speaker: Box | null, head: { x: number; y: number } | null, L: Limits): Box | null {
  if (speaker) return { x0: speaker.x0 + width(speaker) * 0.2, x1: speaker.x1 - width(speaker) * 0.2, y0: speaker.y0, y1: speaker.y0 + height(speaker) * L.caption.faceTopShare };
  if (head) { const r = L.caption.headBoxPx / 2; return { x0: head.x - r, x1: head.x + r, y0: head.y - r, y1: head.y + r }; }
  return null;
}

export function analyzeCaption(c: CaptionSample, s: Sample, L: Limits): Hit[] {
  const out: Hit[] = [];
  const who = c.speaker ?? "narrator";
  const face = faceBox(c.speakerBox, c.head, L);
  const slack = L.caption.aboveSlackPx;
  if (face) {
    const f = overlapArea(c.box, face) / Math.max(1, area(face));
    if (f > L.caption.faceFraction) out.push(hit("caption-on-face", 5, f > 0.6 ? 3 : f > 0.4 ? 2 : 1, `caption.${who}`, `${who}'s caption sits over their face`, `The ${c.style} covers ${Math.round(f * 100)}% of ${who}'s face (limit ${Math.round(L.caption.faceFraction * 100)}%): "${c.text.slice(0, 50)}"`, "faceCovered", f, L.caption.faceFraction, 0, "story", union(c.box, face)));
  }
  if (c.style === "bubble" && c.head) {
    const above = c.box.y1 <= c.head.y + slack;
    // a speaker near the top gets the bubble below the head instead: fine so long as it clears the face
    const below = c.speakerBox ? c.box.y0 >= c.speakerBox.y0 + (c.speakerBox.y1 - c.speakerBox.y0) * L.caption.faceTopShare - slack : false;
    if (!above && !below) out.push(hit("caption-not-above-head", 5, 2, `caption.${who}`, `${who}'s caption is not above their head`, `Bubble bottom ${c.box.y1.toFixed(0)} px, head at ${c.head.y.toFixed(0)} px: "${c.text.slice(0, 50)}"`, "bubbleBottomOverHeadPx", c.box.y1 - c.head.y, slack, 0, "story", c.speakerBox ? union(c.box, c.speakerBox) : c.box));
  }
  const view: Box = { x0: s.safe.left, y0: s.safe.top, x1: s.viewport.w - s.safe.right, y1: s.viewport.h - s.safe.bottom };
  if (c.box.x0 < view.x0 - 1 || c.box.x1 > view.x1 + 1 || c.box.y0 < view.y0 - 1 || c.box.y1 > view.y1 + 1) {
    const vis = visibleFraction(c.box, view);
    out.push(hit("caption-outside-safe", 5, vis < 0.8 ? 3 : 2, `caption.${who}`, `${who}'s caption leaves the safe area`, `${Math.round((1 - vis) * 100)}% of the ${c.style} is outside the screen or its safe area: "${c.text.slice(0, 50)}"`, "visibleFraction", vis, 1, 0, "story", c.box));
  }
  return out;
}

function hit(check: string, cat: number, severity: Severity, subject: string, title: string, detail: string, metric: string, value: number, limit: number, seconds: number, track: Hit["track"], box?: Box): Hit {
  const o: Hit = { check, cat, severity, subject: plain(subject), title, detail, metric: { name: metric, value: Math.round(value * 1000) / 1000, limit }, seconds, track };
  if (box) o.box = { x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1 };
  return o;
}

// ------------------------------------------------------------------ persistence

export interface Finding extends Hit {
  fingerprint: string;
  /** Sim or wall milliseconds of the first and last sample it held. */
  from: number;
  to: number;
  samples: number;
  /** The sample time with the worst metric. */
  worstAt: number;
}

/**
 * Turns per-sample hits into findings: a rule with `seconds` must hold in consecutive samples for that long.
 * `observe` returns the findings that just became confirmed, so the runner can take a picture at that moment.
 */
export class Tracker {
  private streaks = new Map<string, { from: number; to: number; samples: number; worst: Hit; worstAt: number; confirmed: boolean }>();
  private done = new Map<string, Finding>();

  constructor(private readonly levelId: string) {}

  observe(clockMs: number, hits: readonly Hit[]): Finding[] {
    const now = new Set<string>();
    const fresh: Finding[] = [];
    for (const h of hits) {
      const fp = fingerprintOf(h.cat, this.levelId, h.subject, h.check);
      now.add(fp);
      let s = this.streaks.get(fp);
      if (!s) { s = { from: clockMs, to: clockMs, samples: 0, worst: h, worstAt: clockMs, confirmed: false }; this.streaks.set(fp, s); }
      s.to = clockMs;
      s.samples++;
      if (worse(h, s.worst)) { s.worst = h; s.worstAt = clockMs; }
      const was = s.confirmed;
      if (!was && (h.seconds === 0 || s.to - s.from >= h.seconds * 1000)) s.confirmed = true;
      if (!s.confirmed) continue;
      const prev = this.done.get(fp);
      const keep = prev && !worse(s.worst, prev) ? prev : { ...s.worst, fingerprint: fp, from: s.from, to: s.to, samples: s.samples, worstAt: s.worstAt };
      const f: Finding = { ...keep, from: prev?.from ?? s.from, to: s.to, samples: (prev?.samples ?? 0) + 1 };
      this.done.set(fp, f);
      // the picture is taken now, so it outlines where the element is now, not where it was at its worst
      if (!was) fresh.push(h.box ? { ...f, box: h.box } : f);
    }
    for (const fp of [...this.streaks.keys()]) if (!now.has(fp)) this.streaks.delete(fp);
    return fresh;
  }

  findings(): Finding[] { return [...this.done.values()]; }
}

/** Is `a` further past its limit than `b`? Metrics that must stay above a limit (visible fraction, contrast) count downward. */
function worse(a: Hit, b: Hit): boolean {
  const below = a.metric.value < a.metric.limit;
  return below ? a.metric.value < b.metric.value : a.metric.value > b.metric.value;
}

export function toCandidate(f: Finding, levelId: string, evidence: string[], box?: Box): Candidate {
  return {
    fingerprint: f.fingerprint, category: f.cat, severity: f.severity, via: "probe", pillar: pillarOf(f.cat), track: f.cat === 5 ? "story" : f.track,
    levelId, title: f.title, detail: f.detail, metric: f.metric, evidence, ...(box && evidence.length ? { box } : {}),
  };
}

// ------------------------------------------------------------------ frame log

export interface FrameStats { frames: number; medMs: number; p95Ms: number; worstMs: number; longFrames: number }

const pct = (sorted: number[], p: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;

/** Median, 95th percentile, longest and count of long frames over the CPU cost of each frame, after the warm-up frames. */
export function frameStats(frames: readonly FrameRec[], L: Limits): FrameStats {
  const use = frames.slice(L.frame.warmupFrames).map((f) => f.cpu).sort((a, b) => a - b);
  if (!use.length) return { frames: 0, medMs: 0, p95Ms: 0, worstMs: 0, longFrames: 0 };
  return { frames: use.length, medMs: pct(use, 0.5), p95Ms: pct(use, 0.95), worstMs: use[use.length - 1]!, longFrames: use.filter((m) => m > L.frame.longMs).length };
}

/** One finding per event that came before a long frame, with the longest such frame, and one for a high 95th percentile. */
export function frameHits(frames: readonly FrameRec[], L: Limits, throttle = 1): Hit[] {
  const out: Hit[] = [];
  const worst = new Map<string, { ms: number; n: number }>();
  // a hitch is a frame well past the level's own pace as well as past the limit: a level that is slow all through is the p95 finding
  const cut = Math.max(L.frame.longMs, L.frame.hitchRatio * frameStats(frames, L).medMs);
  for (const f of frames.slice(L.frame.warmupFrames)) {
    if (f.cpu <= cut) continue;
    const cause = f.ev.length ? f.ev[f.ev.length - 1]! : f.last || "none";
    const w = worst.get(cause) ?? { ms: 0, n: 0 };
    w.n++; w.ms = Math.max(w.ms, f.cpu);
    worst.set(cause, w);
  }
  for (const [cause, w] of worst) {
    out.push(hit("longframe", 12, w.ms >= L.frame.hitchMs ? 3 : 2, `frame.${cause}`, `Frame hitch of ${Math.round(w.ms)} ms after "${cause}"`, `${w.n} frame${w.n > 1 ? "s" : ""} over ${Math.round(cut)} ms of JavaScript, the longest ${Math.round(w.ms)} ms, right after a "${cause}" event (CPU throttled ${throttle}x)`, "frameMs", w.ms, L.frame.longMs, 0, "main"));
  }
  const st = frameStats(frames, L);
  if (st.p95Ms > L.frame.p95Ms) out.push(hit("p95", 12, 2, "frame.p95", `Frame time is high all through the level (p95 ${Math.round(st.p95Ms)} ms)`, `Median ${st.medMs.toFixed(1)} ms, 95th percentile ${st.p95Ms.toFixed(1)} ms over ${st.frames} frames (CPU throttled ${throttle}x)`, "p95Ms", st.p95Ms, L.frame.p95Ms, 0, "main"));
  return out;
}

/** Console and page errors, one hit per distinct message. */
export function errorHits(errors: readonly string[]): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const e of errors) {
    const msg = e.replace(/^[^:]*:\s*/, "").replace(/^(Uncaught\s+)?\w*Error:\s*/, "");
    const key = plain(msg).slice(0, 40);
    if (!key || seen.has(key) || /GPU stall|KHR_parallel_shader_compile|favicon|Download the React DevTools|\[vite\]/i.test(msg)) continue;
    seen.add(key);
    out.push(hit("console-error", 12, 3, `console.${key}`, `Console error: ${msg.slice(0, 80)}`, msg.slice(0, 200), "errors", 1, 0, 0, "main"));
  }
  return out;
}

// ------------------------------------------------------------------ continuity (story)

/** Mean luminance (0..1) of RGBA pixels, ignoring fully transparent ones. */
export function meanLuminance(rgba: Uint8Array | Buffer, step = 4): number {
  let sum = 0, n = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4 * step) {
    if (rgba[i + 3] === 0) continue;
    sum += luminance(rgba[i]!, rgba[i + 1]!, rgba[i + 2]!);
    n++;
  }
  return n ? sum / n : 0;
}

/**
 * Compares the world a film ended on with the one the level opened on: light, and the things in the film's
 * last frame that the level does not have (or the reverse).
 */
export function continuityHits(levelId: string, film: string, filmLight: number | null, levelLight: number | null, filmNames: readonly string[], level: StorySnapshot, L: Limits): Hit[] {
  const out: Hit[] = [];
  if (filmLight !== null && levelLight !== null && filmLight > 0 && levelLight > 0) {
    const ratio = Math.max(filmLight, levelLight) / Math.min(filmLight, levelLight);
    if (ratio > L.continuity.lightRatio) out.push(hit("light-jump", 5, 2, `film.${film}`, `The light jumps at the cut from ${film} into the level`, `The film's last frame is ${filmLight.toFixed(2)} bright, the level's first is ${levelLight.toFixed(2)} (${ratio.toFixed(1)}x apart; limit ${L.continuity.lightRatio}x)`, "lightRatio", ratio, L.continuity.lightRatio, 0, "story"));
  }
  const here = new Set([...level.residents.map((r) => r.role), ...level.traders.map((t) => t.kind), "unit.player", ...level.captures.map((c) => c.type)]);
  for (const n of filmNames) {
    if (!/^(unit|role)\./.test(n)) continue;
    if (n === "unit.player" || [...here].some((h) => h === n || n.startsWith(h) || h.startsWith(n))) continue;
    out.push(hit("cast-missing", 5, 2, `film.${film}:${n}`, `${n} is in the last frame of ${film} but not in the level`, `${n} is posed in the film's final shot; the level opens with ${[...here].join(", ") || "only the hero"}`, "missingCast", 1, 0, 0, "story"));
  }
  return out;
}


// ------------------------------------------------------------------ command line

const here = dirname(fileURLToPath(import.meta.url));

export interface Args { out: string; levels: string[]; story: string[]; base: string | null; throttle: number; seconds: number; wall: number; limits: string; interrupt: boolean; colourBlind: boolean; notch: boolean; keepServer: boolean }

export function parseArgs(argv: readonly string[]): Args {
  const a = argv.filter((x) => x !== "--");
  const get = (n: string): string | undefined => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };
  const list = (n: string): string[] => (get(n) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const out = get("--out");
  if (!out) throw new Error("usage: review:probe -- --out <dir> --levels <id,...> [--story <id,...>] [--base <url>] [--throttle 4] [--seconds 90]");
  return {
    out: resolve(out), levels: list("--levels"), story: list("--story"), base: get("--base") ?? null, throttle: Number(get("--throttle") ?? 1),
    seconds: Number(get("--seconds") ?? 90), wall: Number(get("--wall") ?? 420), limits: resolve(get("--limits") ?? join(here, "probe-limits.json")),
    interrupt: !a.includes("--no-interrupt"), colourBlind: !a.includes("--no-colourblind"), notch: !a.includes("--no-notch"), keepServer: a.includes("--keep-server"),
  };
}


// ------------------------------------------------------------------ marking a problem in a picture

/** The close-up region round a box: some context on every side, never smaller than `minPx`, kept inside the viewport. */
export function cropRegion(box: Box, view: { w: number; h: number }, ctxPx = 60, minPx = 170): Box {
  const b: Box = { x0: Math.max(0, box.x0), y0: Math.max(0, box.y0), x1: Math.min(view.w, box.x1), y1: Math.min(view.h, box.y1) };
  const pad = Math.max(ctxPx, 0.35 * Math.max(width(b), height(b)));
  const grow = (lo: number, hi: number, max: number): [number, number] => {
    if (hi - lo < minPx) { const m = (lo + hi) / 2; lo = m - minPx / 2; hi = m + minPx / 2; }
    if (lo < 0) { hi -= lo; lo = 0; }
    if (hi > max) { lo -= hi - max; hi = max; }
    return [Math.max(0, lo), Math.min(max, hi)];
  };
  const [x0, x1] = grow(b.x0 - pad, b.x1 + pad, view.w);
  const [y0, y1] = grow(b.y0 - pad, b.y1 + pad, view.h);
  return { x0: Math.floor(x0), y0: Math.floor(y0), x1: Math.ceil(x1), y1: Math.ceil(y1) };
}
