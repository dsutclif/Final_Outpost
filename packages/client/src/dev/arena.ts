import {
  ACESFilmicToneMapping, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Quaternion, RingGeometry, Scene, SRGBColorSpace, SphereGeometry, Vector3, WebGLRenderer, type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { loadMeshy, meshyBounds, meshyRig, meshyScene, type MeshyEntry } from "@fo/render-3d/meshy";
import { Rigged } from "@fo/render-3d/rigged";
import { lookFor } from "@fo/render-3d/characters";
import { ART_M, BUILD_K, CHAR_K, DRONE_K } from "@fo/render-3d/units";
import { SIZES } from "@fo/render-3d/sizes";
import { HEMI, SUN } from "@fo/render-3d/environment";
import { deriveTokens } from "@fo/render-3d/tokens";
import { EXPOSURE } from "@fo/render-3d/renderer";
import { ACID_COLOR, ARENA, BODY, cardRows, createFight, PROPOSALS, roster, SHOT_NAME, stepFight, TAB_OF, type Edits, type Fight, type Mode, type Tab, type Unit } from "./arenaModel.js";
import type { FighterNums } from "./fighterStats.js";
import buggyRig from "../../../render-3d/src/assets/buggy.json";

// Fighter arena (dev sandbox, R6 Release 2 Bundle 5). Three tabs (Doug 2026-11-04): Fighting (a mixed wave of attackers
// against a mixed defence), Hunting (the commander and rangers against hoppers) and Scale (every character side by
// side, each animal's size adjustable). The rules live in arenaModel.ts; this file only draws them. HP shows as a bar
// over each fighter and reach as a circle on the ground, never as card numbers (Doug). Tracers: white-hot core, blue
// glow for settlers, red for enemy guns, an acid glob in each animal's own colour.

const CSS = `
#arena { position: fixed; inset: 0; z-index: 20; background: #141518; color: var(--fg); display: none; flex-direction: column; touch-action: none; }
#arena.open { display: flex; }
#arena .bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 12px; padding-top: calc(8px + env(safe-area-inset-top)); border-bottom: 1px solid #2a2b2f; }
#arena .bar button.on { background: var(--acc); color: #1c1d20; border-color: var(--acc); }
#arena .bar label { font-size: 14px; color: var(--dim); display: flex; gap: 4px; align-items: center; }
#arena .bar input[type=number] { width: 3.6em; font: inherit; color: var(--fg); background: #2a2b30; border: 1px solid #3a3b40; border-radius: 5px; padding: 1px 4px; text-align: right; }
#arena .tabs { display: flex; gap: 0; margin-right: 6px; }
#arena .tabs button { border-radius: 0; } #arena .tabs button:first-child { border-radius: 8px 0 0 8px; } #arena .tabs button:last-child { border-radius: 0 8px 8px 0; }
#arena .stat { font-size: 13px; color: var(--dim); font-variant-numeric: tabular-nums; flex: 1 1 100%; min-height: 1.2em; }
#arena .main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(230px, 300px) 1fr minmax(230px, 300px); grid-template-areas: "left stage right"; }
#arena .cards { overflow-y: auto; touch-action: pan-y; padding: 8px; min-height: 0; -webkit-overflow-scrolling: touch; }
#arena .left { grid-area: left; } #arena .right { grid-area: right; }
#arena .cards h4 { margin: 2px 0 6px; font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
#arena .stage { grid-area: stage; position: relative; min-width: 0; min-height: 0; overflow: hidden; }
#arena .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#arena .banner { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); background: rgba(20,21,24,.9); border: 1px solid var(--acc); border-radius: 10px; padding: 8px 14px; font-weight: 600; text-align: center; display: none; max-width: 90%; }
#arena .card { background: #1f2024; border: 1px solid #333; border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
#arena .card.sel { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc) inset; }
#arena .card .hd { display: flex; align-items: center; gap: 6px; }
#arena .card .hd b { flex: 1; font-size: 14px; word-break: break-word; }
#arena .card .cnt { display: flex; gap: 4px; align-items: center; }
#arena .card .cnt button { padding: 2px 9px; }
#arena .card .cnt span { min-width: 1.6em; text-align: center; font-variant-numeric: tabular-nums; }
#arena .card table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 4px; }
#arena .card td { padding: 2px 4px 2px 0; vertical-align: middle; }
#arena .card td.l { color: var(--dim); }
#arena .card input { width: 4.2em; font: inherit; color: var(--fg); background: #2a2b30; border: 1px solid #3a3b40; border-radius: 5px; padding: 1px 4px; text-align: right; }
#arena .card input[type=range] { width: 100%; padding: 0; background: none; border: none; }
#arena .card input.ed { border-color: var(--acc); }
#arena .card .note { font-size: 11.5px; color: var(--dim); margin-top: 3px; }
#arena .tag { font-size: 11px; margin-left: 3px; white-space: nowrap; }
#arena .tag.new { color: #7fd99a; } #arena .tag.chg { color: var(--acc); }
#arena .card details { margin-top: 2px; font-size: 12px; color: var(--dim); }
#arena .card .undo { font-size: 11px; color: var(--dim); background: none; border: none; padding: 0; text-decoration: underline; }
@media (max-width: 760px) {
  #arena .main { grid-template-columns: 1fr 1fr; grid-template-rows: minmax(220px, 44vh) 1fr; grid-template-areas: "stage stage" "left right"; }
  #arena .cards { padding: 6px; }
  #arena .card { padding: 6px 7px; }
  #arena .card table { font-size: 11.5px; }
  #arena .card input { width: 3.6em; }
}`;

// longer than the game's 0.16 s so a shot can be followed by eye; the arena is for reading the fight
const TRACER_LIFE = 0.45;
const GLOW: Record<string, string> = { settler: "#5aa8ff", enemy: "#ff4a3a", acid: "#8ff05a" };
const CHAR_ID: Record<string, string> = { player: "unit.player", guard: "role.defender", medic: "role.medic", hunter: "role.hunter" };
/** World units per art metre for characters, as the game draws them. */
const CHAR_WORLD = (ART_M * CHAR_K) / 0.9;
/** Most of each kind a card allows. */
const MAX: Record<string, number> = { player: 1, enemy: 80, settler: 16 };

interface Tracer { a: Vector3; b: Vector3; kind: string; color: string; born: number }

export interface ArenaUi { open(): void; close(): void }

export function createArena(): ArenaUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "arena";
  document.body.append(root);

  const skin = getSkin(DEFAULT_SKIN);
  const nameOf = (f: FighterNums): string => skin.names[f.title] ?? skin.names[f.id] ?? f.title;
  const R = roster();
  const byId = new Map(R.fighters.map((f) => [f.id, f]));
  let tab: Tab | "scale" = "fight";
  let mode: Mode = "r2";
  const edits: Record<Mode, Edits> = { r2: {}, today: {} };
  /** Size multipliers from the Scale tab (x1 = as the game draws them today); they apply in both modes. */
  const sizes: Record<string, number> = {};
  /**
   * The buggy (story decor, not yet in a level) stands at the end of the Scale row so the people read against it. x1 is
   * the model as built, 4.4 m long; it starts at 2.6 m, the size Doug marked against Sela (2026-11-04).
   */
  const BUGGY = "decor.buggy", BUGGY_M = SIZES.buggy.buildLength;
  sizes[BUGGY] = SIZES.buggy.length / BUGGY_M; // 2.64 m
  const counts: Record<Tab, Record<string, number>> = {
    fight: { "hostile.swarmling": 24, "hostile.creature": 8, "hostile.raider_humanoid": 4, "hostile.boss": 1, player: 1, guard: 3, drone: 2, medic: 1, tower1: 1 },
    hunt: { "node.prey_dangerous": 3, "node.prey": 2, player: 1, hunter: 0, medic: 0 },
  };
  const wave = { ranks: 6, rowGap: 0.6 };
  let kite = false;
  let speed = 1, running = false, fight: Fight;
  /** Footprint radii at size 1, measured from the models once they load (BODY until then). */
  let bodies: Record<string, number> = { ...BODY };

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const num = (v: number, onSet: (v: number) => void, step = "any"): HTMLInputElement => {
    const i = el("input"); i.type = "number"; i.step = step; i.inputMode = "decimal"; i.value = String(v);
    i.onchange = () => { const n = Number(i.value); if (Number.isFinite(n)) onSet(n); };
    return i;
  };

  // ---- top bar ----
  const bar = el("div", undefined, "bar");
  const back = el("button", "Back");
  const tabs = el("div", undefined, "tabs");
  const tabBtns = (["fight", "hunt", "scale"] as const).map((k) => {
    const b = el("button", k === "fight" ? "Fighting" : k === "hunt" ? "Hunting" : "Scale");
    b.onclick = () => { tab = k; paintBar(); renderCards(); newFight(); fit(); };
    return b;
  });
  tabs.append(...tabBtns);
  const today = el("label");
  const todayBox = el("input"); todayBox.type = "checkbox";
  today.append(todayBox, "Today's rules");
  const start = el("button", "Start"), reset = el("button", "Reset");
  const speeds = [1, 2, 4].map((k) => { const b = el("button", `${k}x`); b.onclick = () => { speed = k; paintBar(); }; return b; });
  const ranksL = el("label"); ranksL.append("Per row", num(wave.ranks, (v) => { wave.ranks = Math.max(1, Math.round(v)); newFight(); }, "1"));
  const gapL = el("label"); gapL.append("Row every", num(wave.rowGap, (v) => { wave.rowGap = Math.max(0.05, v); newFight(); }), "s");
  const kiteL = el("label"); const kiteBox = el("input"); kiteBox.type = "checkbox"; kiteL.append(kiteBox, "Hunters keep moving");
  kiteBox.onchange = () => { kite = kiteBox.checked; newFight(); };
  const copy = el("button", "Copy settings");
  copy.onclick = () => {
    const out = JSON.stringify({ mode, edits: edits[mode], sizes, counts, wave, kite }, null, 1);
    void navigator.clipboard?.writeText(out).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy settings"), 1200); }, () => prompt("Settings", out));
  };
  const stat = el("div", undefined, "stat");
  bar.append(back, tabs, start, reset, ...speeds, today, ranksL, gapL, kiteL, copy, stat);
  function paintBar(): void {
    speeds.forEach((b, i) => b.classList.toggle("on", [1, 2, 4][i] === speed));
    tabBtns.forEach((b, i) => b.classList.toggle("on", ["fight", "hunt", "scale"][i] === tab));
    const play = tab !== "scale";
    for (const e of [start, reset, ...speeds, today]) e.style.display = play ? "" : "none";
    ranksL.style.display = gapL.style.display = tab === "fight" ? "" : "none";
    kiteL.style.display = tab === "hunt" ? "" : "none";
  }

  const main = el("div", undefined, "main");
  const left = el("div", undefined, "cards left"), right = el("div", undefined, "cards right"), stage = el("div", undefined, "stage");
  const banner = el("div", undefined, "banner");
  main.append(left, stage, right);
  root.append(bar, main);

  // ---- cards ----
  const fightEdits = (): Edits => {
    const e: Edits = { ...edits[mode] };
    for (const [id, k] of Object.entries(sizes)) if (id !== BUGGY) e[`${id}:size`] = k;
    return e;
  };
  function card(f: FighterNums, t: Tab): HTMLElement {
    const c = el("div", undefined, "card");
    const n0 = counts[t][f.id] ?? 0;
    c.classList.toggle("sel", n0 > 0);
    const hd = el("div", undefined, "hd");
    const cnt = el("div", undefined, "cnt");
    const minus = el("button", "−"), plus = el("button", "+"), n = el("span", String(n0));
    const most = MAX[f.id] ?? MAX[f.side]!;
    const bump = (d: number): void => {
      counts[t][f.id] = Math.max(0, Math.min(most, (counts[t][f.id] ?? 0) + d));
      n.textContent = String(counts[t][f.id]);
      c.classList.toggle("sel", counts[t][f.id]! > 0);
      newFight();
    };
    minus.onclick = () => bump(-1);
    plus.onclick = () => bump(1);
    cnt.append(minus, n, plus);
    hd.append(el("b", nameOf(f)), cnt);
    c.append(hd);
    const rows = cardRows(f, mode, edits[mode]);
    const shown = el("table"), hidden = el("table");
    for (const r of rows) {
      const tr = el("tr");
      const ek = `${f.id}:${r.stat}`;
      const inp = num(+r.v.toFixed(3), (v) => { edits[mode][ek] = v; renderCards(); newFight(); });
      if (ek in edits[mode]) inp.classList.add("ed");
      inp.title = `${r.src}${r.why ? ` · ${r.why}` : ""}`;
      const vt = el("td"); vt.append(inp);
      if (r.unit) vt.append(el("span", ` ${r.unit}`, "tag"));
      if (r.isNew) vt.append(el("span", "(new)", "tag new"));
      else if (r.changed) vt.append(el("span", `(was ${+r.today!.toFixed(3)})`, "tag chg"));
      tr.append(el("td", r.label, "l"), vt);
      (r.hidden ? hidden : shown).append(tr);
    }
    c.append(shown);
    if (hidden.childElementCount) {
      const d = el("details");
      d.append(el("summary", "HP (shown as the health bar)"), hidden);
      c.append(d);
    }
    if (Object.keys(edits[mode]).some((k) => k.startsWith(f.id + ":"))) {
      const u = el("button", "undo my edits", "undo");
      u.onclick = () => { for (const k of Object.keys(edits[mode])) if (k.startsWith(f.id + ":")) delete edits[mode][k]; renderCards(); newFight(); };
      c.append(u);
    }
    return c;
  }
  /** Scale tab: one card per character with a size slider; the stage lines them all up. */
  const SCALE_IDS = ["player", "guard", "medic", "hunter", "hostile.raider_humanoid", "hostile.boss", "drone", "hostile.swarmling", "hostile.creature", "node.prey", "node.prey_dangerous"];
  const ANIMALS = new Set(["hostile.swarmling", "hostile.creature", "node.prey", "node.prey_dangerous"]);
  function scaleCard(id: string, title: string): HTMLElement {
    const f = { id };
    const c = el("div", undefined, "card");
    const k = sizes[f.id] ?? 1;
    c.classList.toggle("sel", k !== 1);
    const hd = el("div", undefined, "hd");
    hd.append(el("b", title));
    c.append(hd);
    const tb = el("table"), tr = el("tr"), td = el("td");
    const slider = el("input"); slider.type = "range"; slider.min = "0.2"; slider.max = "2.5"; slider.step = "0.05"; slider.value = String(k);
    const box = num(k, (v) => set(v));
    const set = (v: number): void => { v = Math.max(0.1, Math.min(4, v)); if (v === 1) delete sizes[f.id]; else sizes[f.id] = v; box.value = String(v); slider.value = String(v); c.classList.toggle("sel", v !== 1); note.textContent = sizeNote(f.id); fit(); };
    slider.oninput = () => set(Number(slider.value));
    td.append(slider);
    tr.append(el("td", "Size (x)", "l"), td);
    const tr2 = el("tr"), td2 = el("td"); td2.append(box);
    tr2.append(el("td", "", "l"), td2);
    tb.append(tr, tr2);
    const note = el("div", sizeNote(f.id), "note");
    c.append(tb, note);
    return c;
  }
  function sizeNote(id: string): string {
    if (id === BUGGY) { const k = sizes[id] ?? 1; return `${(BUGGY_M * k).toFixed(2)} m long (as built ${BUGGY_M.toFixed(2)} m) · ${(k * buggyRig.radius * 2).toFixed(2)} m wheels`; }
    const e = entryOf(id), k = sizes[id] ?? 1;
    // real metres (1 m = ART_M world units, Doug 2026-11-04): a person is 1.8 m
    const L = lookScale(id), body = `footprint ${((bodies[id] ?? 12) * k * 2 / ART_M).toFixed(2)} m across`;
    if (!e) return body;
    const m = (e.length ?? e.height ?? 1.1) * L * CHAR_WORLD / ART_M;
    return `${(m * k).toFixed(2)} m ${e.length ? "long" : "tall"} (in game today ${m.toFixed(2)} m) · ${body}`;
  }
  function renderCards(): void {
    if (tab === "scale") {
      const fs = SCALE_IDS.map((id) => byId.get(id)).filter((f): f is FighterNums => !!f);
      const cardOf = (f: FighterNums): HTMLElement => scaleCard(f.id, nameOf(f));
      left.replaceChildren(el("h4", "Animals · size"), ...fs.filter((f) => ANIMALS.has(f.id)).map(cardOf));
      right.replaceChildren(el("h4", "People and drones · size"), ...fs.filter((f) => !ANIMALS.has(f.id)).map(cardOf),
        el("h4", "Vehicles · size"), scaleCard(BUGGY, "Buggy"));
      return;
    }
    const t = tab;
    const tag = mode === "r2" ? "Release 2 proposals" : "today's rules";
    const list = R.fighters.filter((f) => TAB_OF(f).includes(t));
    left.replaceChildren(el("h4", `${t === "hunt" ? "Hoppers" : "Attackers"} · ${tag}`), ...list.filter((f) => f.side === "enemy").map((f) => card(f, t)));
    right.replaceChildren(el("h4", `${t === "hunt" ? "Hunters" : "Defence"} · ${tag}`), ...list.filter((f) => f.side === "settler").map((f) => card(f, t)));
  }

  // ---- three.js arena ----
  const tk = deriveTokens(skin);
  const canvas = el("canvas"), over = el("canvas");
  stage.append(canvas, over, banner);
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = ACESFilmicToneMapping;
  gl.toneMappingExposure = EXPOSURE;
  gl.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new Scene();
  scene.background = new Color(tk.fog);
  const sun = new DirectionalLight(new Color(tk.sun), SUN);
  sun.position.set(ARENA.w / 2 - 300, 500, ARENA.h / 2 + 200);
  sun.target.position.set(ARENA.w / 2, 0, ARENA.h / 2);
  scene.add(new HemisphereLight(new Color(tk.sky), new Color(tk.groundDark), HEMI), sun, sun.target);
  const ground = new Mesh(new PlaneGeometry(ARENA.w + 200, ARENA.h + 200), new MeshStandardMaterial({ color: new Color(tk.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ARENA.w / 2, 0, ARENA.h / 2);
  const field = new Mesh(new PlaneGeometry(ARENA.w, ARENA.h), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false }));
  field.rotation.x = -Math.PI / 2;
  field.position.set(ARENA.w / 2, 0.2, ARENA.h / 2);
  const Z = ARENA.zone;
  const zone = new Mesh(new PlaneGeometry(Z.x1 - Z.x0, Z.y1 - Z.y0), new MeshBasicMaterial({ color: new Color("#c9a05a"), transparent: true, opacity: 0.12, depthWrite: false }));
  zone.rotation.x = -Math.PI / 2;
  zone.position.set((Z.x0 + Z.x1) / 2, 0.3, (Z.y0 + Z.y1) / 2);
  scene.add(ground, field, zone);
  const camera = new PerspectiveCamera(28, 1, 10, 8000);
  const dyn = new Group();
  scene.add(dyn);
  const rigged = new Rigged(dyn);

  const disc = new CircleGeometry(1, 48), rim = new RingGeometry(0.96, 1, 64);
  const circleMat = (c: string, o: number): MeshBasicMaterial => new MeshBasicMaterial({ color: new Color(c), transparent: true, opacity: o, depthWrite: false });
  const mats = { enemy: [circleMat("#ff6a50", 0.07), circleMat("#ff6a50", 0.4)], settler: [circleMat("#5aa8ff", 0.07), circleMat("#5aa8ff", 0.4)], rifle: [circleMat("#ff4a3a", 0.04), circleMat("#ff4a3a", 0.3)], body: [circleMat("#ffffff", 0.0), circleMat("#ffffff", 0.22)] };
  type Pool = { circles: Mesh[]; body: Object3D | null };
  const pool = new Map<number, Pool>();
  const fallbackGeo = { body: new CylinderGeometry(6, 7, 26, 12), head: new SphereGeometry(5, 12, 8) };

  const acidMats = new Map<string, MeshBasicMaterial[]>();
  const acidMat = (type: string): MeshBasicMaterial[] => {
    const c = ACID_COLOR[type] ?? GLOW["acid"]!;
    if (!acidMats.has(c)) acidMats.set(c, [circleMat(c, 0.05), circleMat(c, 0.35)]);
    return acidMats.get(c)!;
  };
  function circlesFor(u: Unit): { r: number; m: MeshBasicMaterial[] }[] {
    const side = u.side === "enemy" ? mats.enemy : mats.settler;
    const out = [{ r: u.s.range ?? 0, m: side }];
    if (u.s.gunRange) out.push({ r: u.s.gunRange, m: side });
    if ((u.s.shotRange ?? 0) > 0) out.push({ r: u.s.shotRange!, m: SHOT_NAME[u.type] === "Acid spit" ? acidMat(u.type) : mats.rifle });
    // the footprint the no-overlap rule keeps apart (R2)
    if (mode === "r2" && u.kind !== "tower") out.push({ r: u.body, m: mats.body });
    return out.filter((c) => c.r > 0);
  }

  function bodyFor(u: Unit): Object3D | null {
    const k = u.s.size ?? 1;
    if (u.kind === "drone") {
      const b = meshyScene("unit.drone");
      if (!b) return null;
      const g = new Group(); const h = new Group(); h.rotation.y = Math.PI / 2; h.position.y = 0.9; h.add(b); g.add(h);
      g.scale.setScalar(ART_M * CHAR_K * DRONE_K * k);
      return g;
    }
    if (u.kind === "tower") {
      const base = meshyScene("struct.ranged_defense.base"), head = meshyScene(`struct.ranged_defense.head${u.type.slice(5)}`);
      if (!base || !head) return null;
      const g = new Group(); head.position.y = 0.75; g.add(base, head);
      g.scale.setScalar(ART_M * BUILD_K);
      return g;
    }
    return null;
  }
  function fallback(u: Unit): Object3D {
    const c = u.side === "enemy" ? "#c0503c" : u.kind === "tower" ? "#8a8f99" : "#4a86c8";
    const g = new Group();
    const m = new MeshStandardMaterial({ color: new Color(c) });
    const b = new Mesh(fallbackGeo.body, m); b.position.y = 13;
    const h = new Mesh(fallbackGeo.head, m); h.position.y = 30;
    g.add(b, h);
    const low = u.type === "hostile.swarmling" || u.type === "hostile.creature" || u.kind === "hopper" || u.kind === "prey";
    g.scale.set(u.body / 7, low ? 0.45 : 1, u.body / 7);
    return g;
  }
  let core: Object3D | null = null;
  function placeCore(): void {
    if (core) { core.visible = tab === "fight"; return; }
    const c = meshyScene("sink.core.l1");
    core = c ? (() => { const g = new Group(); g.add(c); g.scale.setScalar(ART_M * BUILD_K); return g; })()
      : new Mesh(new CylinderGeometry(20, 24, 30, 16), new MeshStandardMaterial({ color: new Color("#d0a050") }));
    if (!c) core.position.y = 15;
    core.position.x = fight.base.x; core.position.z = fight.base.y;
    scene.add(core);
  }

  const cidOf = (kind: string, type: string, side: string): string => CHAR_ID[kind] ?? (side === "enemy" ? type : "");
  const entryOf = (id: string): MeshyEntry | undefined => {
    const f = byId.get(id);
    const cid = f ? cidOf(f.kind, f.id, f.side) : id;
    return cid ? rigged.entryFor(cid) : undefined;
  };
  /** The game's per-character size on top of the model height (characters.ts look.scale: commander 1.2, people 0.9, mites 0.45). */
  const lookScale = (id: string): number => {
    const f = byId.get(id);
    if (!f || f.kind === "drone" || f.kind === "tower") return 1;
    return lookFor(cidOf(f.kind, f.id, f.side), tk, skin.models).scale;
  };
  /** World units per art metre for one character, as the game draws it (renderer.ts: ART_M x look.scale x CHAR_K / 0.9). */
  const worldOf = (id: string): number => (ART_M * lookScale(id) * CHAR_K) / 0.9;
  /**
   * Footprint radius at size 1 from the model: the mean of its half width and half depth in meshy.built.json bounds,
   * at the height (or length) the game draws it. Hopper bounds are not usable (skinned scale), so they go by length.
   */
  function measureBodies(): void {
    const out: Record<string, number> = { ...BODY };
    for (const f of R.fighters) {
      if (f.kind === "tower") continue;
      if (f.kind === "drone") { const b = meshyBounds("unit.drone"); if (b) out[f.id] = ((b[3]! - b[0]!) + (b[5]! - b[2]!)) / 4 * ART_M * CHAR_K * DRONE_K; continue; }
      const e = entryOf(f.id);
      if (!e) continue;
      if (e.length) { out[f.id] = e.length * 0.32 * worldOf(f.id); continue; }
      const b = meshyBounds(e.file), h = b ? b[4]! - b[1]! : 0;
      if (!b || !(h > 0.05)) continue;
      out[f.id] = ((b[3]! - b[0]!) + (b[5]! - b[2]!)) / 4 / h * (e.height ?? 1.1) * worldOf(f.id);
    }
    bodies = out;
  }

  const ids = new Set(["unit.player", "role.defender", "role.medic", "role.hunter", "unit.drone", "unit.drone.rotor", "struct.ranged_defense", "sink.core", BUGGY, "decor.buggy_wheel", "decor.buggy_wheel_l", ...R.fighters.filter((f) => f.side === "enemy").map((f) => f.id)]);
  // models land in the background: code-built stand-ins until then, swapped once everything is in
  let rebuild = false;
  void loadMeshy(undefined, ids, undefined, true).then(() => {
    rebuild = true;
    if (core) { scene.remove(core); core = null; }
    measureBodies();
    if (!running) newFight();
    if (tab === "scale") renderCards();
  });

  /** Scale tab: every character in a row, smallest gaps that keep footprints apart, each at its own size. */
  function lineup(): Unit[] {
    const out: Unit[] = [];
    // the buggy stands first, left of the people (buggySpot), so the row starts past its length
    let x = 20 + BUGGY_M * (sizes[BUGGY] ?? 1) * ART_M + 14;
    SCALE_IDS.forEach((id, i) => {
      const f = byId.get(id);
      if (!f) return;
      const k = sizes[id] ?? 1, r = (bodies[id] ?? 12) * k;
      x += r;
      out.push({ uid: -1 - i, side: f.side, type: f.id, kind: f.kind, s: { size: k }, x, y: ARENA.h / 2, hp: 0, hpMax: 0, body: r, acc: 0, gun: 0, shot: 0, status: "ok", homeX: x, homeY: 0,
        windup: 0, lungeCd: 0, lungeAt: null, dash: null, charging: false, healCd: 0, hitCd: 0, vx: 0, vy: 0, act: 0, face: 0 });
      x += r + 6;
    });
    // centre the row on the field
    const shift = (ARENA.w - x) / 2;
    for (const u of out) u.x += shift;
    return out;
  }
  const shown = (): Unit[] => (tab === "scale" ? lineup() : fight.units);

  /** Where the buggy stands on the Scale tab: left of the first character (the commander), side on to the camera. */
  function buggySpot(): { x: number; half: number; k: number } | null {
    const first = lineup()[0];
    if (!first) return null;
    const k = sizes[BUGGY] ?? 1, half = (BUGGY_M * k * ART_M) / 2;
    return { x: first.x - first.body - 14 - half, half, k };
  }
  let buggy: Group | null = null;  /** The body and its four wheels from the rig (buggy.json: body frame y 0 at its lowest point, wheel pivots at the ground). */
  function placeBuggy(): void {
    if (!buggy) {
      const b = meshyScene(BUGGY);
      if (!b) return;
      buggy = new Group();
      const lift = buggyRig.groundBelowBody;
      b.position.y = lift;
      buggy.add(b);
      for (const h of buggyRig.hubs) {
        const w = meshyScene(h.side);
        if (w) { w.position.set(h.pos[0]!, lift + h.pos[1]! - buggyRig.radius, h.pos[2]!); buggy.add(w); }
      }
      scene.add(buggy);
    }
    const s = tab === "scale" ? buggySpot() : null;
    buggy.visible = !!s;
    if (s) { buggy.position.set(s.x, 0, ARENA.h / 2); buggy.scale.setScalar(ART_M * s.k); }
    placeDriver(s);
  }

  // A ranger seated in the buggy for reference: sized by the Ranger slider only, kept on the seat as the buggy resizes.
  // Seat hip point in the as-built buggy's ground frame (art m): 0.30 back from centre, cushion top 1.40 up, on the
  // centre line (measured in Blender, 2026-11-04); the hip joint sits about 0.073 of a person's height above the cushion.
  const SEAT = { x: 0.3, y: 1.4 }, HIP_ABOVE = 0.073;
  let driver: { root: Object3D; hip: Vector3; h: number } | null = null;
  function makeDriver(): typeof driver {
    const e = entryOf("hunter"), rig = e && meshyRig(e.file);
    if (!e || !rig) return null;
    const root = cloneSkinned(rig.scene);
    const bone = (n: string): Object3D | undefined => root.getObjectByName(`mixamorig${n}`) ?? root.getObjectByName(`mixamorig:${n}`);
    // model space faces +z: thighs forward, shins down, upper arms down and a little forward, forearms to the wheel
    const pose: [string, string, [number, number, number]][] = [];
    for (const sd of ["Left", "Right"]) pose.push([`${sd}UpLeg`, `${sd}Leg`, [0, -0.03, 1]], [`${sd}Leg`, `${sd}Foot`, [0, -1, 0.2]], [`${sd}Arm`, `${sd}ForeArm`, [0, -1, 0.35]], [`${sd}ForeArm`, `${sd}Hand`, [0, -0.35, 1]]);
    root.updateMatrixWorld(true);
    for (const [b, c, d] of pose) {
      const bo = bone(b), co = bone(c);
      if (!bo || !co || !bo.parent) continue;
      const from = bo.getWorldPosition(new Vector3()), dir = co.getWorldPosition(new Vector3()).sub(from).normalize();
      const q = new Quaternion().setFromUnitVectors(dir, new Vector3(...d).normalize());
      const parentInv = bo.parent.getWorldQuaternion(new Quaternion()).invert();
      bo.quaternion.copy(parentInv.multiply(q.multiply(bo.getWorldQuaternion(new Quaternion()))));
      bo.updateMatrixWorld(true);
    }
    const l = bone("LeftUpLeg"), r = bone("RightUpLeg");
    const hip = l && r ? l.getWorldPosition(new Vector3()).add(r.getWorldPosition(new Vector3())).multiplyScalar(0.5) : new Vector3(0, 0.9, 0);
    // art metres per model unit, as Rigged.add sizes a character by height
    const h = (e.height ?? 1.1) / ((rig.scene.userData["height"] as number) || 1.7);
    root.rotation.y = -Math.PI / 2; // facing the buggy's front (-x)
    scene.add(root);
    return { root, hip, h };
  }
  function placeDriver(s: { x: number; k: number } | null): void {
    if (!driver && s) driver = makeDriver();
    if (!driver) return;
    driver.root.visible = !!s;
    if (!s) return;
    const perM = worldOf("hunter") * (sizes["hunter"] ?? 1), scale = perM * driver.h;
    const tall = (entryOf("hunter")?.height ?? 1.1) * perM; // the ranger's standing height in world units
    driver.root.scale.setScalar(scale);
    // the hip offset turned with the body (yaw -90 degrees: model +z faces world -x)
    const hip = driver.hip.clone().multiplyScalar(scale).applyAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2);
    const seat = new Vector3(s.x + SEAT.x * ART_M * s.k, SEAT.y * ART_M * s.k + HIP_ABOVE * tall, ARENA.h / 2);
    driver.root.position.copy(seat.sub(hip));
  }

  function sync(): void {
    rigged.begin();
    const seen = new Set<number>();
    if (rebuild) { rebuild = false; for (const p of pool.values()) if (p.body) { dyn.remove(p.body); p.body = null; } }
    for (const u of shown()) {
      if (u.status === "dead") continue;
      seen.add(u.uid);
      let p = pool.get(u.uid);
      if (!p) {
        const circles = (tab === "scale" ? [{ r: u.body, m: mats.body }] : circlesFor(u)).flatMap(({ r, m }) => {
          const d = new Mesh(disc, m[0]); const e = new Mesh(rim, m[1]);
          for (const x of [d, e]) { x.rotation.x = -Math.PI / 2; x.scale.setScalar(r); x.renderOrder = 1; dyn.add(x); }
          return [d, e];
        });
        p = { circles, body: null };
        pool.set(u.uid, p);
      }
      for (const c of p.circles) { c.position.set(u.x, 0.4, u.y); c.visible = u.status === "ok" || tab === "scale"; if (tab === "scale") c.scale.setScalar(u.body); }
      const cid = cidOf(u.kind, u.type, u.side);
      const entry = cid ? rigged.entryFor(cid) : undefined;
      const moving = Math.hypot(u.vx, u.vy) > 0.02;
      const k = u.s.size ?? 1;
      if (entry) {
        if (p.body) { dyn.remove(p.body); p.body = null; }
        rigged.add(`a${u.uid}`, cid, entry, { moving, hurried: false, cheer: false, speed: Math.min(1, Math.hypot(u.vx, u.vy) / 2), run: (u.kind === "hostile" && !!u.dash) || (u.kind === "hopper" && u.charging), act: u.act > 0 && entry.clips?.["shoot"] ? "shoot" : undefined, lying: u.status === "down" || u.status === "healing" }, u.x, u.y, u.face, worldOf(u.type) * k);
        continue;
      }
      if (!p.body) { p.body = bodyFor(u) ?? fallback(u); p.body.userData["k"] = k; p.body.userData["s"] = p.body.scale.clone(); dyn.add(p.body); }
      // the Scale tab resizes in place: the body was built at size userData.k
      const k0 = p.body.userData["k"] as number;
      if (k0 !== k && p.body.userData["s"]) p.body.scale.copy(p.body.userData["s"]).multiplyScalar(k / k0);
      p.body.position.set(u.x, 0, u.y);
      if (u.kind !== "tower") p.body.rotation.set(u.status === "down" || u.status === "healing" ? -Math.PI / 2 : 0, u.face, 0, "YXZ");
      else if (u.act > 0 && p.body.children[1]) p.body.children[1].rotation.y = u.face - Math.PI / 2;
    }
    for (const [k, p] of pool) if (!seen.has(k)) { for (const c of p.circles) dyn.remove(c); if (p.body) dyn.remove(p.body); pool.delete(k); }
  }

  // ---- overlay: health bars, tracers, labels ----
  const ctx = over.getContext("2d")!;
  const tracers: Tracer[] = [];
  const v = new Vector3();
  const proj = (x: number, y: number, z: number): { x: number; y: number } => {
    v.set(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * over.clientWidth, y: (1 - v.y) / 2 * over.clientHeight };
  };
  /** Top of a character in world units: its drawn height (hoppers about a third of their length), at its size. */
  const heightOf = (u: Unit): number => {
    if (u.kind === "tower") return 46;
    if (u.kind === "drone") return 40 * DRONE_K * (u.s.size ?? 1);
    const e = entryOf(u.type) ?? entryOf(u.kind);
    const m = e ? (e.length ? e.length * 0.45 : e.height ?? 1.1) : 0.8;
    return m * worldOf(u.type) * (u.s.size ?? 1);
  };
  const flashes: { x: number; y: number; z: number; born: number }[] = [];
  /** A damage number rising over whoever was hit, so every strike, ranged or not, can be counted. */
  const pops: { x: number; y: number; z: number; text: string; color: string; born: number }[] = [];
  const muzzles: { x: number; y: number; z: number; kind: string; born: number }[] = [];

  /** Acid spit is a lobbed glob with a dripping trail and a splash, never a straight beam, so it can't be mistaken for a gun. */
  const ACID_FLIGHT = 0.6; // share of TRACER_LIFE spent in the air; the rest is the splash
  const acidAt = (tr: Tracer, t: number): { x: number; y: number } => {
    const arc = Math.sin(Math.PI * t) * (10 + tr.a.distanceTo(tr.b) * 0.25);
    return proj(tr.a.x + (tr.b.x - tr.a.x) * t, tr.a.y + (tr.b.y - tr.a.y) * t + arc, tr.a.z + (tr.b.z - tr.a.z) * t);
  };
  function drawAcid(tr: Tracer, life: number): void {
    const acid = tr.color;
    ctx.fillStyle = acid; ctx.shadowColor = acid;
    if (life < ACID_FLIGHT) {
      const t = life / ACID_FLIGHT;
      for (let j = 4; j >= 1; j--) {
        const d = acidAt(tr, Math.max(0, t - j * 0.06));
        ctx.globalAlpha = 0.5 - j * 0.1; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(d.x, d.y + j * 1.5, 3.2 - j * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      const p = acidAt(tr, t);
      ctx.globalAlpha = 1; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 6, 4.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = "#e8ffd0";
      ctx.beginPath(); ctx.arc(p.x - 1.5, p.y - 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const s = (life - ACID_FLIGHT) / (1 - ACID_FLIGHT), b = proj(tr.b.x, tr.b.y, tr.b.z);
    ctx.globalAlpha = 1 - s; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.ellipse(b.x, b.y, 7 + 9 * s, 3 + 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    for (let j = 0; j < 5; j++) {
      const ang = Math.PI * (1.1 + j * 0.2);
      ctx.beginPath(); ctx.arc(b.x + Math.cos(ang) * 14 * s, b.y + Math.sin(ang) * 10 * s, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  function draw2d(now: number): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, over.clientWidth, over.clientHeight);
    ctx.lineCap = "round";
    if (tab === "scale") {
      ctx.font = "600 11px system-ui, sans-serif"; ctx.textAlign = "center"; ctx.globalAlpha = 1;
      lineup().forEach((u, i) => {
        const f = byId.get(u.type)!, p = proj(u.x, 0, u.y + u.body + 4), top = proj(u.x, heightOf(u) + 4, u.y);
        // short names (Commander, Guard, Drone), three rows deep so neighbours don't run together
        const short = skin.names[CHAR_ID[f.kind] ?? ""] ?? (f.kind === "drone" ? "Drone" : nameOf(f));
        p.y += (i % 3) * 13;
        ctx.fillStyle = "#e8e8ea"; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = 3;
        ctx.strokeText(short, p.x, p.y + 12); ctx.fillText(short, p.x, p.y + 12);
        const k = sizes[u.type] ?? 1;
        if (k !== 1) { ctx.fillStyle = "#f2b84b"; ctx.strokeText(`x${k}`, top.x, top.y); ctx.fillText(`x${k}`, top.x, top.y); }
      });
      const bs = buggySpot();
      if (bs && buggy) {
        const p = proj(bs.x, 0, ARENA.h / 2 + 30);
        ctx.fillStyle = "#e8e8ea"; ctx.strokeStyle = "rgba(0,0,0,.75)"; ctx.lineWidth = 3;
        const t = `Buggy ${(BUGGY_M * bs.k).toFixed(2)} m`;
        ctx.strokeText(t, p.x, p.y + 12); ctx.fillText(t, p.x, p.y + 12);
      }
      return;
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i]!, k = 1 - (now - tr.born) / 1000 / TRACER_LIFE;
      if (k <= 0) { tracers.splice(i, 1); continue; }
      if (tr.kind === "acid") { drawAcid(tr, (now - tr.born) / 1000 / TRACER_LIFE); continue; }
      const a = proj(tr.a.x, tr.a.y, tr.a.z), b = proj(tr.b.x, tr.b.y, tr.b.z);
      ctx.globalAlpha = k;
      ctx.strokeStyle = GLOW[tr.kind]!; ctx.lineWidth = 5; ctx.shadowColor = GLOW[tr.kind]!; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fffdf4"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]!, k = 1 - (now - f.born) / 220;
      if (k <= 0) { flashes.splice(i, 1); continue; }
      const p = proj(f.x, f.y, f.z);
      ctx.globalAlpha = k; ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 + 6 * (1 - k), 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = muzzles.length - 1; i >= 0; i--) {
      const m = muzzles[i]!, k = 1 - (now - m.born) / 120;
      if (k <= 0) { muzzles.splice(i, 1); continue; }
      const p = proj(m.x, m.y, m.z);
      ctx.globalAlpha = k; ctx.fillStyle = "#fffdf4"; ctx.shadowColor = GLOW[m.kind]!; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.font = "700 13px system-ui, sans-serif"; ctx.textAlign = "center";
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i]!, t = (now - q.born) / 800;
      if (t >= 1) { pops.splice(i, 1); continue; }
      const p = proj(q.x, q.y, q.z);
      ctx.globalAlpha = 1 - t; ctx.fillStyle = q.color; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 3;
      ctx.strokeText(q.text, p.x, p.y - 18 * t); ctx.fillText(q.text, p.x, p.y - 18 * t);
    }
    ctx.globalAlpha = 1;
    const bw = Math.max(18, Math.min(30, over.clientWidth / 28));
    const barAt = (x: number, y: number, z: number, frac: number, downed: boolean): void => {
      const p = proj(x, y, z);
      ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 6);
      ctx.fillStyle = downed ? "#777" : frac > 0.5 ? "#62d26f" : frac > 0.25 ? "#e8c34a" : "#e8584a";
      ctx.fillRect(p.x - bw / 2, p.y, bw * Math.max(0, frac), 4);
    };
    for (const u of fight.units) {
      if (u.status === "dead" || u.hpMax <= 0) continue;
      const lying = u.status === "down" || u.status === "healing";
      const top = lying ? 14 : heightOf(u) + 6;
      barAt(u.x, top, u.y, u.hp / u.hpMax, lying);
      if (lying) { const p = proj(u.x, top, u.y); ctx.fillStyle = u.status === "healing" ? "#7fd99a" : "#ccc"; ctx.font = "10px system-ui"; ctx.textAlign = "center"; ctx.fillText(u.status === "healing" ? "healing" : "down", p.x, p.y - 3); }
    }
    if (tab === "fight") barAt(fight.base.x, 60, fight.base.y, fight.base.hp / fight.base.hpMax, false);
  }

  // ---- loop ----
  function fit(): void {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    gl.setSize(w, h, false);
    const dpr = Math.min(2, devicePixelRatio || 1);
    over.width = w * dpr; over.height = h * dpr;
    camera.aspect = w / h;
    // straight on from the south, tilted down 55 degrees; back off until the field fits both ways. The Scale tab
    // looks lower and closer, at just the line-up, so sizes read against each other
    const row = tab === "scale" ? lineup() : [];
    const bs = tab === "scale" ? buggySpot() : null;
    const x0 = bs ? bs.x - bs.half - 10 : row.length ? row[0]!.x - row[0]!.body - 10 : 0, x1 = row.length ? row[row.length - 1]!.x + row[row.length - 1]!.body + 10 : ARENA.w;
    const wide = tab === "scale" ? x1 - x0 : ARENA.w + 40, deep = tab === "scale" ? 90 : ARENA.h + 30;
    const pitch = ((tab === "scale" ? 22 : 55) * Math.PI) / 180, vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dW = wide / 2 / Math.tan(hf / 2), dH = (deep * Math.sin(pitch) + 50 * Math.cos(pitch)) / 2 / Math.tan(vf / 2);
    const d = Math.max(dW, dH) + deep / 2 * Math.cos(pitch);
    const cx = (x0 + x1) / 2, cz = ARENA.h / 2;
    camera.position.set(cx, Math.sin(pitch) * d, cz + Math.cos(pitch) * d);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(stage);

  let raf = 0, last = 0, acc = 0;
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (running && !fight.result && tab !== "scale") {
      acc += dt * speed;
      const step = 1 / ARENA.tps;
      while (acc >= step && !fight.result) {
        const h0 = fight.hits.length;
        stepFight(fight);
        acc -= step;
        for (const s of fight.shots) { tracers.push({ a: new Vector3(s.fx, 20, s.fy), b: new Vector3(s.tx, 16, s.ty), kind: s.kind, color: s.kind === "acid" ? ACID_COLOR[s.by] ?? GLOW["acid"]! : GLOW[s.kind]!, born: now }); if (s.kind !== "acid") muzzles.push({ x: s.fx, y: 20, z: s.fy, kind: s.kind, born: now }); }
        for (let i = h0; i < fight.hits.length; i++) {
          const hit = fight.hits[i]!;
          const tu = hit.target === "base" ? fight.base : fight.units.find((u) => u.uid === hit.target);
          if (!tu) continue;
          flashes.push({ x: tu.x, y: 18, z: tu.y, born: now });
          const bySettler = fight.units.find((u) => u.uid === hit.by)?.side === "settler";
          if (hit.dmg > 0) pops.push({ x: tu.x, y: 30, z: tu.y, text: `-${+hit.dmg.toFixed(1)}`, color: bySettler ? GLOW["settler"]! : (hit.ranged && ACID_COLOR[fight.units.find((u) => u.uid === hit.by)?.type ?? ""]) || GLOW["enemy"]!, born: now });
        }
      }
      if (fight.result) showResult();
    }
    placeCore();
    placeBuggy();
    zone.visible = tab === "hunt";
    sync();
    rigged.end(running ? dt * speed : dt);
    gl.render(scene, camera);
    draw2d(now);
    paintStat();
  }

  function paintStat(): void {
    if (tab === "scale") { stat.textContent = "Sizes are real metres: a person is 1.8 m. Drag a slider to resize a character; x1 is how the game draws it today. The faint ring is the footprint the no-overlap rule keeps apart. Copy settings sends me the sizes."; return; }
    const sec = (fight.tick / ARENA.tps).toFixed(1);
    const rules = mode === "r2" ? `R2 proposals (${PROPOSALS.length} overrides)` : "today's rules";
    if (tab === "hunt") {
      const left = fight.units.filter((u) => u.side === "enemy" && u.status !== "dead").length;
      const up = fight.units.filter((u) => u.side === "settler" && u.kind !== "medic" && u.status === "ok").length;
      const bites = fight.hits.filter((h) => h.byKind === "hopper").length;
      stat.textContent = `${sec} s · hoppers left ${left} · hunters up ${up} · bites landed ${bites} · injured ${fight.injuries}, healed ${fight.heals} · ${kite ? "hunters keep moving" : "hunters stand"} · ${rules}`;
      return;
    }
    const e = fight.units.filter((u) => u.side === "enemy" && u.status !== "dead").length + fight.pending.length;
    const s = fight.units.filter((u) => u.side === "settler" && u.status === "ok" && u.kind !== "medic").length;
    stat.textContent = `${sec} s · attackers left ${e} · defenders up ${s} · core ${fight.base.hp}/${fight.base.hpMax} · guards died ${fight.deaths}, healed ${fight.heals} · drones built ${fight.built} · ${rules}`;
  }
  function showResult(): void {
    const r = fight.result!;
    const who = tab === "hunt" ? (r.winner === "settlers" ? "Hunters" : "Hoppers") : r.winner === "settlers" ? "Settlers" : "Attackers";
    banner.textContent = r.winner === "draw" ? `Draw after ${r.seconds.toFixed(1)} s (${r.why})` : `${who} win in ${r.seconds.toFixed(1)} s: ${r.why}`;
    banner.style.display = "block";
    running = false;
    start.textContent = "Start";
  }
  function newFight(): void {
    const t: Tab = tab === "scale" ? "fight" : tab;
    const all = counts[t];
    const side = (s: "enemy" | "settler"): Record<string, number> => Object.fromEntries(Object.entries(all).filter(([id, n]) => n > 0 && byId.get(id)?.side === s && TAB_OF(byId.get(id)!).includes(t)));
    fight = createFight({ mode, tab: t, edits: fightEdits(), enemyCounts: side("enemy"), settlerCounts: side("settler"), ranks: wave.ranks, rowGap: wave.rowGap, kite, bodies });
    running = false; acc = 0;
    tracers.length = 0; flashes.length = 0; pops.length = 0; muzzles.length = 0;
    for (const p of pool.values()) { for (const c of p.circles) dyn.remove(c); if (p.body) dyn.remove(p.body); }
    pool.clear();
    rigged.dispose();
    if (core) { core.position.set(fight.base.x, core.position.y, fight.base.y); }
    banner.style.display = "none";
    start.textContent = "Start";
  }

  start.onclick = () => {
    if (fight.result) newFight();
    running = !running;
    start.textContent = running ? "Pause" : "Start";
  };
  reset.onclick = () => newFight();
  todayBox.onchange = () => { mode = todayBox.checked ? "today" : "r2"; renderCards(); newFight(); };
  back.onclick = () => ui.close();

  paintBar();
  newFight();
  renderCards();
  const ui: ArenaUi = {
    open() { root.classList.add("open"); fit(); if (!raf) raf = requestAnimationFrame(frame); },
    close() { root.classList.remove("open"); cancelAnimationFrame(raf); raf = 0; last = 0; running = false; start.textContent = "Start"; },
  };
  return ui;
}
