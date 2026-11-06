import {
  ACESFilmicToneMapping, BoxGeometry, Color, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { loadMeshy, meshyEntries, meshyGeometry } from "@fo/render-3d/meshy";
import { Rigged } from "@fo/render-3d/rigged";
import { lookFor } from "@fo/render-3d/characters";
import { ART_M, CHAR_K } from "@fo/render-3d/units";
import { SIZES } from "@fo/render-3d/sizes";
import { HEMI, SUN } from "@fo/render-3d/environment";
import { deriveTokens } from "@fo/render-3d/tokens";
import { EXPOSURE } from "@fo/render-3d/renderer";
import level from "../../../../levels/story/story-L001.json";

// Crash site (dev sandbox): the story level 1 wreck, the commander's open stasis pod and the commander lying face down
// on it, at the sizes the game draws today, with a size slider for each. Placement mirrors renderer.ts placeStoryDecor
// (position, lift, yaw, roll, scale) and buildDeckPlates; characters go by height as in arena.ts. Read-only dev view.

const CSS = `
#crash { position: fixed; inset: 0; z-index: 20; background: #141518; color: var(--fg); display: none; }
#crash.open { display: block; }
#crash canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#crash .panel { position: absolute; left: 10px; top: 10px; bottom: 10px; width: min(320px, calc(100% - 20px)); overflow-y: auto; background: rgba(20,21,24,.92); border: 1px solid #333; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; }
#crash .row { display: flex; gap: 6px; flex-wrap: wrap; }
#crash .sl b { display: block; font-size: 14px; }
#crash .sl input { width: 100%; }
#crash .sl span { font-size: 12.5px; color: var(--dim); font-variant-numeric: tabular-nums; }
#crash .note { font-size: 12px; color: var(--dim); }
#crash .ratio { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; }`;

/** The film's hand-off: commander 1.14 m tall beside a 60 m wide ship. */
const FILM = { cmdrM: 1.14, shipM: 60 };
const NAMES = ["unit.player", "decor.halcyon_wreck", "decor.stasis_pod", "decor.stasis_glass"];
const D2R = Math.PI / 180;

interface Ent { type: string; id: string; at?: [number, number]; yaw?: number; lift?: number; roll?: number; scale?: number; size?: [number, number, number]; color?: string }

export interface CrashUi { open(): void; close(): void }

export function createCrashSite(): CrashUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "crash";
  document.body.append(root);

  const ents = (level as unknown as { entities: Ent[] }).entities;
  const byId = (id: string): Ent => ents.find((e) => e.id === id)!;
  const wreckE = byId("wreck"), podE = byId("pod0"), lidE = byId("lid0");
  const decks = ents.filter((e) => e.type === "decor.deck_plate");

  const skin = getSkin(DEFAULT_SKIN);
  const tk = deriveTokens(skin);
  // Doug's sizes of 2026-11-04 as the starting point (ship 27 m; decor pods 2.66 m, base 0.80 m in the sand)
  const sizes = { ship: 0.54, pod: 0.8, cmdr: 1 };
  /** Where the pod's base sits against the sand, metres (negative: sunk in). Today's levels have it 1.19 m down, in the deck. */
  let podBaseM = -SIZES.pod.buried;
  /** The concrete deck plates: off, so the pods sit straight in the sand (Doug, 2026-11-04). */
  let showDeck = false;

  const canvas = document.createElement("canvas");
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = ACESFilmicToneMapping;
  gl.toneMappingExposure = EXPOSURE;
  gl.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new Scene();
  scene.background = new Color(tk.fog);
  const sun = new DirectionalLight(new Color(tk.sun), SUN);
  sun.position.set(300, 900, 700);
  sun.target.position.set(650, 0, 200);
  scene.add(new HemisphereLight(new Color(tk.sky), new Color(tk.groundDark), HEMI), sun, sun.target);
  const ground = new Mesh(new PlaneGeometry(9000, 9000), new MeshStandardMaterial({ color: new Color(tk.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(650, -0.5, 200);
  scene.add(ground);
  const camera = new PerspectiveCamera(28, 1, 5, 30000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  const dyn = new Group();
  scene.add(dyn);
  const rigged = new Rigged(dyn);

  // deck plates as plain steel slabs (the game textures them; size and place are what matter here), hidden by default
  const deckMeshes: Mesh[] = [];
  for (const d of decks) {
    if (!d.at || !d.size) continue;
    const [w, dp, h] = d.size;
    const m = new Mesh(new BoxGeometry(w, h, dp), new MeshStandardMaterial({ color: new Color(d.color ?? "#a9acb8"), metalness: 0.08, roughness: 0.8 }));
    m.position.set(d.at[0], (d.lift ?? 0) + h / 2, d.at[1]);
    m.rotation.y = ((d.yaw ?? 0) * D2R);
    m.visible = showDeck;
    scene.add(m);
    deckMeshes.push(m);
  }

  const wreck = new Group(), pod = new Group();
  scene.add(wreck, pod);
  /** Art metres to world units for a decor entity, as placeStoryDecor: its `width` over the longer ground side. */
  const kOf = (id: string): number => {
    const g = meshyGeometry(id), e = meshyEntries().find((x) => x.id === id);
    if (!g) return 0;
    const b = g.geo.boundingBox ?? (g.geo.computeBoundingBox(), g.geo.boundingBox!);
    return ART_M * (e?.width ?? 1.4) / Math.max(0.01, b.max.x - b.min.x, b.max.z - b.min.z);
  };
  const metres: { wreckLen: number; podLen: number; cmdrH: number } = { wreckLen: 0, podLen: 0, cmdrH: 0 };
  let podTop = 0, ready = false;
  const hasCmdr = (): boolean => !!rigged.entryFor("unit.player");

  function decor(id: string, e: Ent, into: Group, relTo?: Ent): Mesh | null {
    const g = meshyGeometry(id);
    if (!g) return null;
    if (!g.geo.getAttribute("normal")) g.geo.computeVertexNormals();
    const m = new Mesh(g.geo, g.mat);
    const k = kOf(id) * (e.scale ?? 1);
    const o = relTo?.at ?? [0, 0];
    // positions relative to the group origin (the entity's own `at` for the ship, the pod's for pod and lid)
    m.position.set((e.at![0] - o[0]), e.lift ?? 0, (e.at![1] - o[1]));
    m.rotation.order = "YXZ";
    m.rotation.set(((e.roll ?? 0) * D2R), ((e.yaw ?? 0) * D2R), 0);
    m.scale.setScalar(k);
    into.add(m);
    return m;
  }

  function build(): void {
    const w = decor("decor.halcyon_wreck", wreckE, wreck);
    wreck.position.set(wreckE.at![0], 0, wreckE.at![1]);
    if (w) w.position.set(0, wreckE.lift ?? 0, 0);
    decor("decor.stasis_pod", podE, pod, podE);
    decor("decor.stasis_glass", lidE, pod, podE);
    pod.position.set(podE.at![0], 0, podE.at![1]);
    const pg = meshyGeometry("decor.stasis_pod")!.geo.boundingBox!;
    const kp = kOf("decor.stasis_pod") * (podE.scale ?? 1);
    metres.wreckLen = 60 * (wreckE.scale ?? 1); // the manifest width of the model, art metres across
    metres.podLen = (pg.max.x - pg.min.x) * kp / ART_M;
    podTop = (podE.lift ?? 0) + pg.max.y * kp;
    const look = lookFor("unit.player", tk, skin.models).scale;
    const e = rigged.entryFor("unit.player");
    metres.cmdrH = (e?.height ?? 0.9) * look * CHAR_K / 0.9;
    ready = true;
    syncSizes();
    paint();
    focus(false);
  }

  /** Real sizes now: metres at x1, times the slider. */
  const real = (): { ship: number; pod: number; cmdr: number; ratio: number } => {
    const ship = metres.wreckLen * sizes.ship, cmdr = metres.cmdrH * sizes.cmdr;
    return { ship, pod: metres.podLen * sizes.pod, cmdr, ratio: cmdr ? ship / cmdr : 0 };
  };

  function syncSizes(): void {
    wreck.scale.setScalar(sizes.ship);
    pod.scale.setScalar(sizes.pod);
    // the pod's base (its model's lowest point, at the entity's lift inside the group) on the chosen height
    pod.position.y = podBaseM * ART_M - (podE.lift ?? 0) * sizes.pod;
    for (const m of deckMeshes) m.visible = showDeck;
  }
  /** The pod's top in world units now. */
  const podTopNow = (): number => pod.position.y + podTop * sizes.pod;

  /** Lay the commander face down along the pod's long axis, just above the sand; called each frame (Rigged resets the root). */
  function placeCmdr(): void {
    const e = rigged.entryFor("unit.player");
    if (!e || !ready) return;
    rigged.begin();
    const look = lookFor("unit.player", tk, skin.models).scale;
    const world = (ART_M * look * CHAR_K) / 0.9 * sizes.cmdr;
    rigged.add("cmdr", "unit.player", e, { moving: false, hurried: false, cheer: false, speed: 0, run: false }, 0, 0, 0, world);
    rigged.end(0);
    const r = rigged.rootOf("cmdr");
    if (!r) return;
    const yaw = (podE.yaw ?? 0) * D2R, a = yaw + Math.PI / 2;
    const Hw = metres.cmdrH * ART_M * sizes.cmdr;
    // fixed just above the sand (Doug): the pod height slider moves only the pod around him
    const top = CHEST * Hw + 0.05 * ART_M;
    // head toward +axis; centre the body on the pod's middle
    r.rotation.set(Math.PI / 2, a, 0, "YXZ");
    r.position.set(pod.position.x - Math.sin(a) * Hw / 2, top, pod.position.z - Math.cos(a) * Hw / 2);
  }
  /** Half the body's front-to-back depth, as a fraction of height: how far the body's mid-plane sits above what it lies on. */
  const CHEST = 0.1;

  function focus(close: boolean): void {
    const t = close
      ? new Vector3(pod.position.x, 0.5 * ART_M, pod.position.z)
      : new Vector3((wreck.position.x + pod.position.x) / 2, 40, (wreck.position.z + pod.position.z) / 2);
    const dist = close ? 230 * Math.max(0.5, Math.max(sizes.pod, sizes.cmdr)) : 2900 * Math.max(0.6, sizes.ship);
    // the game's camera: pitch 30 down, turned 45 about the vertical, sitting toward +x +z
    const p = 30 * D2R, y = 45 * D2R;
    controls.target.copy(t);
    camera.position.set(t.x + Math.sin(y) * Math.cos(p) * dist, t.y + Math.sin(p) * dist, t.z + Math.cos(y) * Math.cos(p) * dist);
    camera.updateProjectionMatrix();
    controls.update();
  }

  // ---- panel ----
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const panel = el("div", undefined, "panel");
  const back = el("button", "Back"), focusPod = el("button", "Focus pod"), whole = el("button", "Whole ship"), copy = el("button", "Copy settings"), hide = el("button", "Hide panel");
  const row = el("div", undefined, "row");
  row.append(back, focusPod, whole, copy, hide);
  const ratio = el("div", undefined, "ratio");
  const note = el("div", `Reference: in the opening film the commander was ${FILM.cmdrM} m tall at the hand-off while the ship was ${FILM.shipM} m wide, ratio ship/commander = ${(FILM.shipM / FILM.cmdrM).toFixed(1)}.`, "note");
  panel.append(row, ratio, note);
  const readouts: Record<string, HTMLSpanElement> = {};
  const defs = [["ship", "Ship size", "ship length"], ["pod", "Pod size", "pod length"], ["cmdr", "Commander size", "commander height"]] as const;
  for (const [k, title] of defs) {
    const d = el("div", undefined, "sl");
    const s = el("input"); s.type = "range"; s.min = "0.2"; s.max = "3"; s.step = "0.01"; s.value = String(sizes[k]);
    const out = el("span");
    readouts[k] = out;
    s.oninput = () => { sizes[k] = Number(s.value); syncSizes(); paint(); };
    d.append(el("b", title), s, out);
    panel.append(d);
  }
  // the pod's height in the sand: its base from 2 m down to 0.5 m up
  {
    const d = el("div", undefined, "sl");
    const s = el("input"); s.type = "range"; s.min = "-2"; s.max = "0.5"; s.step = "0.02"; s.value = String(podBaseM);
    const out = el("span");
    readouts["podBase"] = out;
    s.oninput = () => { podBaseM = Number(s.value); syncSizes(); paint(); };
    d.append(el("b", "Pod height"), s, out);
    panel.append(d);
  }
  {
    const d = el("label", undefined, "sl");
    const c = el("input"); c.type = "checkbox"; c.checked = showDeck;
    c.onchange = () => { showDeck = c.checked; syncSizes(); };
    d.append(c, " Show the concrete pad (today's deck plates)");
    panel.append(d);
  }
  function paint(): void {
    const r = real();
    const podH = ready ? (podTop - (podE.lift ?? 0)) * sizes.pod / ART_M : 0;
    const buried = Math.max(0, Math.min(podH, -podBaseM));
    readouts["podBase"]!.textContent = `base ${podBaseM >= 0 ? `${podBaseM.toFixed(2)} m above` : `${(-podBaseM).toFixed(2)} m below`} the sand · ${podH ? Math.round((buried / podH) * 100) : 0}% of the ${podH.toFixed(2)} m pod buried`;
    readouts["ship"]!.textContent = `x${sizes.ship.toFixed(2)} · ship length ${r.ship.toFixed(1)} m`;
    readouts["pod"]!.textContent = `x${sizes.pod.toFixed(2)} · pod length ${r.pod.toFixed(2)} m`;
    readouts["cmdr"]!.textContent = `x${sizes.cmdr.toFixed(2)} · commander height ${r.cmdr.toFixed(2)} m`;
    ratio.textContent = `Ship / commander now: ${r.ratio.toFixed(1)} (film ${(FILM.shipM / FILM.cmdrM).toFixed(1)})`;
  }
  copy.onclick = () => {
    const r = real();
    const out = JSON.stringify({ multipliers: { ...sizes }, metres: { shipLength: +r.ship.toFixed(2), podLength: +r.pod.toFixed(2), commanderHeight: +r.cmdr.toFixed(2), podBase: +podBaseM.toFixed(2) }, concretePad: showDeck, ratio: +r.ratio.toFixed(1), filmRatio: +(FILM.shipM / FILM.cmdrM).toFixed(1) }, null, 1);
    void navigator.clipboard?.writeText(out).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy settings"), 1200); }, () => prompt("Settings", out));
  };
  focusPod.onclick = () => focus(true);
  whole.onclick = () => focus(false);
  const shown = el("button", "Panel"); shown.style.cssText = "position:absolute;left:10px;top:10px;display:none";
  hide.onclick = () => { panel.style.display = "none"; shown.style.display = ""; };
  shown.onclick = () => { panel.style.display = ""; shown.style.display = "none"; };
  root.append(canvas, panel, shown);

  let isOpen = false, raf = 0, loading: Promise<void> | null = null;
  function resize(): void {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    gl.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  function frame(): void {
    if (!isOpen) return;
    raf = requestAnimationFrame(frame);
    resize();
    placeCmdr();
    gl.render(scene, camera);
  }
  return {
    open(): void {
      isOpen = true;
      root.classList.add("open");
      back.onclick = () => this.close();
      paint();
      loading ??= loadMeshy(undefined, new Set(NAMES), undefined, true).then(() => { if (meshyGeometry("decor.stasis_pod") && hasCmdr()) build(); else panel.append(el("div", "Models failed to load", "note")); });
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
