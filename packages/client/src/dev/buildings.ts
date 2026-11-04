import {
  ACESFilmicToneMapping, Box3, BufferGeometry, Color, DirectionalLight, Group, HemisphereLight, Line, LineBasicMaterial, MOUSE, Mesh, TOUCH,
  MeshStandardMaterial, OrthographicCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LOOK, modelScaleFor } from "@fo/content";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { loadMeshy, meshyEntries, meshyScene, type MeshyEntry } from "@fo/render-3d/meshy";
import { Rigged } from "@fo/render-3d/rigged";
import { lookFor } from "@fo/render-3d/characters";
import { ART_M, CHAR_K } from "@fo/render-3d/units";
import { HEMI, SUN } from "@fo/render-3d/environment";
import { deriveTokens } from "@fo/render-3d/tokens";
import { EXPOSURE } from "@fo/render-3d/renderer";

// Buildings row (dev sandbox): every building, interactive object and decor model in one row beside the commander, seen side on through an
// orthographic camera so heights compare straight across, at the sizes the game draws today (renderer.ts buildK:
// ART_M x buildScale x look.json modelScale; other objects ART_M alone). A slider per model multiplies on top
// (x1 = the game today) and Copy settings gives the look.json values. Read-only dev view, like crashsite.ts.

const CSS = `
#bldg { position: fixed; inset: 0; z-index: 20; background: #141518; color: var(--fg); display: none; }
#bldg.open { display: block; }
#bldg canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#bldg .panel { position: absolute; left: 10px; top: 10px; bottom: 10px; width: min(330px, calc(100% - 20px)); overflow-y: auto; background: rgba(20,21,24,.92); border: 1px solid #333; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; z-index: 2; }
#bldg .row { display: flex; gap: 6px; flex-wrap: wrap; }
#bldg .sl b { display: block; font-size: 14px; }
#bldg .sl input[type=range] { width: 100%; }
#bldg .sl span { font-size: 12.5px; color: var(--dim); font-variant-numeric: tabular-nums; }
#bldg .note { font-size: 12px; color: var(--dim); }
#bldg h4 { margin: 6px 0 0; font-size: 13px; color: var(--dim); font-weight: 600; }
#bldg .tag { position: absolute; transform: translate(-50%, -100%); font-size: 11.5px; color: #e8e8ea; background: rgba(20,21,24,.75); padding: 1px 5px; border-radius: 4px; white-space: nowrap; pointer-events: none; z-index: 1; }`;

/** Ids the game sizes as buildings (renderer.ts buildK): sink/conv/struct and the greenhouse, not the gate. */
const isBuilding = (id: string): boolean => (/^(sink|conv|struct)\./.test(id) || id === "node.food_source") && id !== "struct.gate";
const ANCHOR = "sink.sales_point";
/** Gap between neighbours in the row, art metres. */
const GAP_M = 1.2;

/** Slider groups: buildings (look.json modelScale), interactive objects and decor (meshy.json width). */
type Grp = "bldg" | "obj" | "decor";
const GROUPS: [Grp | "all", string][] = [["bldg", "Buildings"], ["obj", "Interactive"], ["decor", "Decor"], ["all", "All"]];
/** Decor that is only a part of another model (the buggy's wheels ride on its rig). */
const PARTS = new Set(["decor.buggy_wheel", "decor.buggy_wheel_l"]);

interface Item { e: MeshyEntry; key: string; name: string; grp: Grp; building: boolean; box: HTMLDivElement; base: number; k: number; g: Group; w: number; d: number; h: number; x: number; tag: HTMLDivElement; out: HTMLSpanElement }

export interface BuildingsUi { open(): void; close(): void }

export function createBuildingsRow(): BuildingsUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "bldg";
  document.body.append(root);

  const skin = getSkin(DEFAULT_SKIN);
  const tk = deriveTokens(skin);
  let buildScale = LOOK.buildScale, cmdrK = 1, turned = false;
  /** Which sliders show; with rowOnly the row draws only that group too (the kiosk anchor always stays). */
  let pick: Grp | "all" = "bldg", rowOnly = true;

  const canvas = document.createElement("canvas");
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = ACESFilmicToneMapping;
  gl.toneMappingExposure = EXPOSURE;
  gl.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new Scene();
  scene.background = new Color(tk.fog);
  const sun = new DirectionalLight(new Color(tk.sun), SUN);
  sun.position.set(-600, 900, 900);
  scene.add(new HemisphereLight(new Color(tk.sky), new Color(tk.groundDark), HEMI), sun, sun.target);
  const ground = new Mesh(new PlaneGeometry(40000, 40000), new MeshStandardMaterial({ color: new Color(tk.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);
  const camera = new OrthographicCamera(-1, 1, 1, -1, -20000, 20000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  // left drag / one finger pans along the row; right drag still turns the view
  controls.mouseButtons = { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
  controls.touches = { ONE: TOUCH.PAN, TWO: TOUCH.DOLLY_ROTATE };
  const row = new Group();
  scene.add(row);
  const rigged = new Rigged(scene);
  // a line across the row at the kiosk's roof height: the anchor every building is matched to
  const guide = new Line(new BufferGeometry().setFromPoints([new Vector3(0, 0, 0), new Vector3(1, 0, 0)]), new LineBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.7 }));
  scene.add(guide);
  // the ground line along the row (the near-level camera barely shows the ground plane)
  const base = new Line(new BufferGeometry().setFromPoints([new Vector3(-20000, 0.3, 0), new Vector3(20000, 0.3, 0)]), new LineBasicMaterial({ color: 0x2a2420 }));
  scene.add(base);

  const items: Item[] = [];
  /** Commander height in art metres at x1 (as crashsite.ts and the arena: entry height x look scale x CHAR_K / 0.9). */
  let cmdrM = 0, ready = false;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };

  /** look.json key for an entry: level 1 (or none) is the bare id, other levels id:level (modelScaleFor). */
  const keyOf = (e: MeshyEntry): string => (e.level && e.level > 1 ? `${e.id}:${e.level}` : e.id);
  const scaleOf = (it: Item): number => (it.building ? ART_M * buildScale * it.base * it.k : ART_M * it.k);

  function build(): void {
    const grpOf = (e: MeshyEntry): Grp => (e.kind === "decor" ? "decor" : isBuilding(e.id) ? "bldg" : "obj");
    const order: Record<Grp, number> = { bldg: 0, obj: 1, decor: 2 };
    // story decor is unwired (placed by the story levels themselves), so it counts here too; ordinary objects only when wired
    const entries = meshyEntries().filter((e) => (e.kind === "decor" ? !PARTS.has(e.id) : !e.kind && !e.unwired) && !e.slot && !e.batch && meshyScene(e.file));
    // the kiosk first (the anchor), then buildings, interactive objects, decor
    entries.sort((a, b) => Number(b.id === ANCHOR) - Number(a.id === ANCHOR) || order[grpOf(a)] - order[grpOf(b)]);
    for (const e of entries) {
      const s = meshyScene(e.file)!;
      const g = new Group();
      g.add(s);
      const box = new Box3().setFromObject(s);
      // centre the model on its own origin, base on the ground
      s.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      const building = isBuilding(e.id);
      const key = keyOf(e);
      const tag = el("div", undefined, "tag");
      const it: Item = { e, key, name: key.replace(/^\w+\./, ""), grp: grpOf(e), building, box: el("div"), base: building ? modelScaleFor(LOOK.modelScale, e.id, e.level ?? 1) : 1, k: 1, g,
        w: box.max.x - box.min.x, d: box.max.z - box.min.z, h: box.max.y - box.min.y, x: 0, tag, out: el("span") };
      items.push(it);
      row.add(g);
      root.append(tag);
    }
    const look = lookFor("unit.player", tk, skin.models).scale;
    cmdrM = (rigged.entryFor("unit.player")?.height ?? 0.9) * look * CHAR_K / 0.9;
    buildSliders();
    ready = true;
    relayout();
    focus();
  }

  /** Place the row left to right: the commander first, then each shown model with a fixed gap. */
  function relayout(): void {
    let x = 0;
    const cmdrW = cmdrM * cmdrK * 0.4 * ART_M;
    x += cmdrW + GAP_M * ART_M;
    for (const it of items) {
      const on = !rowOnly || pick === "all" || it.grp === pick || it.e.id === ANCHOR;
      it.g.visible = on;
      it.tag.style.display = on ? "" : "none";
      if (!on) continue;
      const sc = scaleOf(it);
      it.g.scale.setScalar(sc);
      it.g.rotation.y = turned ? Math.PI / 2 : 0;
      const across = (turned ? it.d : it.w) * sc;
      it.x = x + across / 2;
      it.g.position.set(it.x, 0, 0);
      x += across + GAP_M * ART_M;
    }
    const kiosk = items.find((i) => i.e.id === ANCHOR);
    const top = kiosk ? kiosk.h * scaleOf(kiosk) : 0;
    guide.geometry.setFromPoints([new Vector3(-40, top, 0), new Vector3(x, top, 0)]);
    guide.visible = !!kiosk;
    rowLen = x;
    paint();
  }
  let rowLen = 1;

  function placeCmdr(): void {
    const e = rigged.entryFor("unit.player");
    if (!e || !ready) return;
    rigged.begin();
    const look = lookFor("unit.player", tk, skin.models).scale;
    rigged.add("cmdr", "unit.player", e, { moving: false, hurried: false, cheer: false, speed: 0, run: false }, cmdrM * cmdrK * 0.2 * ART_M, 0, turned ? 0 : Math.PI / 2, (ART_M * look * CHAR_K) / 0.9 * cmdrK);
    rigged.end(0);
  }

  /**
   * Side on and nearly level (4 degrees down, so the ground shows as a strip). Close up: the tallest model fills about
   * half the height and the row starts at the left; whole: the full row across the screen. Drag pans along the row.
   */
  function focus(whole = false): void {
    const tallest = Math.max(cmdrM * cmdrK * ART_M, ...items.filter((i) => i.g.visible).map((i) => i.h * scaleOf(i)));
    const w = root.clientWidth || 1, h = root.clientHeight || 1;
    // the panel covers the left side on wide screens
    const left = panel.style.display !== "none" && w > 700 ? 350 : 0;
    camera.zoom = whole ? Math.min((w - left) / (rowLen * 1.04), h / (tallest * 1.4)) : (h * 0.5) / tallest;
    camera.updateProjectionMatrix();
    const viewW = w / camera.zoom;
    // the screen centre in world x: the row's middle, or the row's start just right of the panel
    const cx = whole ? rowLen / 2 - left / 2 / camera.zoom : viewW / 2 - left / camera.zoom - 0.02 * viewW;
    const cy = tallest * 0.45, p = (4 * Math.PI) / 180;
    controls.target.set(cx, cy, 0);
    camera.position.set(cx, cy + Math.sin(p) * 4000, Math.cos(p) * 4000);
    controls.update();
  }

  // ---- panel ----
  const panel = el("div", undefined, "panel");
  const back = el("button", "Back"), close = el("button", "Close up"), refocus = el("button", "Whole row"), turn = el("button", "Turn 90°"), copy = el("button", "Copy settings"), reset = el("button", "Reset"), hide = el("button", "Hide panel");
  const btns = el("div", undefined, "row");
  btns.append(back, close, refocus, turn, copy, reset, hide);
  const note = el("div", `Side on, no perspective: heights compare straight across. x1 = the game today (buildScale ${LOOK.buildScale} x look.json modelScale). The yellow line is the kiosk's roof, the size anchor.`, "note");
  const sliders = el("div");
  // which sliders show (and, with the tick box, which models stand in the row)
  const radios = el("div", undefined, "row");
  radios.style.cssText = "gap:10px;font-size:14px";
  for (const [v, label] of GROUPS) {
    const l = el("label");
    const r = el("input"); r.type = "radio"; r.name = "bldgGrp"; r.value = v; r.checked = v === pick;
    r.onchange = () => { pick = v; showGroup(); relayout(); focus(); };
    l.append(r, ` ${label}`);
    radios.append(l);
  }
  const only = el("label", undefined, "note");
  const onlyCb = el("input"); onlyCb.type = "checkbox"; onlyCb.checked = rowOnly;
  onlyCb.onchange = () => { rowOnly = onlyCb.checked; relayout(); focus(); };
  only.append(onlyCb, " Row shows only the selected group (plus the kiosk)");
  panel.append(radios, only, btns, note, sliders);
  const heads: Partial<Record<Grp, HTMLElement>> = {};
  function showGroup(): void {
    for (const it of items) it.box.style.display = pick === "all" || it.grp === pick ? "" : "none";
    for (const [g, h] of Object.entries(heads)) h.style.display = pick === "all" || g === pick ? "" : "none";
  }

  function slider(title: string, min: number, max: number, step: number, val: number, onInput: (v: number) => void): { out: HTMLSpanElement; input: HTMLInputElement; box: HTMLDivElement } {
    const d = el("div", undefined, "sl");
    const s = el("input"); s.type = "range"; s.min = String(min); s.max = String(max); s.step = String(step); s.value = String(val);
    const out = el("span");
    s.oninput = () => { onInput(Number(s.value)); relayout(); };
    d.append(el("b", title), s, out);
    return { out, input: s, box: d };
  }
  let globalOut: HTMLSpanElement, cmdrOut: HTMLSpanElement;
  const inputs: { it?: Item; input: HTMLInputElement; def: number }[] = [];

  function buildSliders(): void {
    const g = slider("Building size (all)", 0.3, 1.5, 0.01, buildScale, (v) => { buildScale = v; });
    globalOut = g.out;
    inputs.push({ input: g.input, def: LOOK.buildScale });
    const c = slider("Commander size", 0.5, 2, 0.01, cmdrK, (v) => { cmdrK = v; });
    cmdrOut = c.out;
    inputs.push({ input: c.input, def: 1 });
    sliders.append(g.box, c.box);
    const titles: Record<Grp, string> = {
      bldg: "Buildings (look.json modelScale)",
      obj: "Interactive objects (meshy.json width)",
      decor: "Decor (meshy.json width; story levels may scale a placed copy again)",
    };
    for (const grp of ["bldg", "obj", "decor"] as Grp[]) {
      heads[grp] = el("h4", titles[grp]);
      sliders.append(heads[grp]!);
      for (const it of items.filter((i) => i.grp === grp)) {
        const s = slider(it.key, 0.1, 3, 0.01, it.k, (v) => { it.k = v; });
        it.out = s.out;
        it.box = s.box;
        inputs.push({ it, input: s.input, def: 1 });
        sliders.append(s.box);
      }
    }
    showGroup();
  }

  function paint(): void {
    if (!ready) return;
    globalOut.textContent = `x${buildScale.toFixed(2)}`;
    cmdrOut.textContent = `x${cmdrK.toFixed(2)} · ${(cmdrM * cmdrK).toFixed(2)} m tall`;
    for (const it of items) {
      const sc = scaleOf(it) / ART_M;
      const h = it.h * sc, w = Math.max(it.w, it.d) * sc;
      it.out.textContent = `x${it.k.toFixed(2)} · ${h.toFixed(2)} m tall · ${w.toFixed(2)} m wide${it.building ? ` · modelScale ${(it.base * it.k).toFixed(3)}` : ""}`;
      it.tag.textContent = `${it.name} ${h.toFixed(1)} m`;
    }
  }

  const v = new Vector3();
  function tags(): void {
    const w = root.clientWidth, h = root.clientHeight;
    for (const it of items) {
      if (!it.g.visible) continue;
      v.set(it.x, it.h * scaleOf(it) + 4, 0).project(camera);
      it.tag.style.left = `${((v.x + 1) / 2) * w}px`;
      it.tag.style.top = `${((1 - v.y) / 2) * h}px`;
    }
  }

  copy.onclick = () => {
    const modelScale: Record<string, number> = { ...LOOK.modelScale };
    const widths: Record<string, number> = {};
    for (const it of items) {
      if (it.building) modelScale[it.key] = +(it.base * it.k).toFixed(3);
      else if (it.k !== 1) widths[it.e.file] = +((it.e.width ?? 1) * it.k).toFixed(3);
    }
    const out = JSON.stringify({ "look.json": { buildScale: +buildScale.toFixed(3), modelScale }, ...(Object.keys(widths).length ? { "meshy.json width by file": widths } : {}), commanderK: +cmdrK.toFixed(2) }, null, 1);
    void navigator.clipboard?.writeText(out).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy settings"), 1200); }, () => prompt("Settings", out));
  };
  reset.onclick = () => {
    buildScale = LOOK.buildScale; cmdrK = 1;
    for (const it of items) it.k = 1;
    for (const i of inputs) i.input.value = String(i.def);
    relayout();
    focus();
  };
  refocus.onclick = () => focus(true);
  close.onclick = () => focus();
  turn.onclick = () => { turned = !turned; relayout(); focus(); };
  const shown = el("button", "Panel"); shown.style.cssText = "position:absolute;left:10px;top:10px;display:none;z-index:2";
  hide.onclick = () => { panel.style.display = "none"; shown.style.display = ""; };
  shown.onclick = () => { panel.style.display = ""; shown.style.display = "none"; };
  root.append(canvas, panel, shown);

  let isOpen = false, raf = 0, loading: Promise<void> | null = null, lastW = 0, lastH = 0;
  function resize(): void {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h || (w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    gl.setSize(w, h, false);
    Object.assign(camera, { left: -w / 2, right: w / 2, top: h / 2, bottom: -h / 2 });
    camera.updateProjectionMatrix();
    if (ready) focus();
  }
  function frame(): void {
    if (!isOpen) return;
    raf = requestAnimationFrame(frame);
    resize();
    placeCmdr();
    gl.render(scene, camera);
    tags();
  }
  return {
    open(): void {
      isOpen = true;
      root.classList.add("open");
      back.onclick = () => this.close();
      const ids = new Set(meshyEntries().filter((e) => (!e.kind || e.kind === "decor") && !e.slot && !e.batch).map((e) => e.id).concat("unit.player"));
      loading ??= loadMeshy(undefined, ids, undefined, true).then(() => { if (rigged.entryFor("unit.player")) build(); else panel.append(el("div", "Models failed to load", "note")); });
      cancelAnimationFrame(raf);
      frame();
    },
    close(): void {
      isOpen = false;
      root.classList.remove("open");
      cancelAnimationFrame(raf);
    },
  };
}

