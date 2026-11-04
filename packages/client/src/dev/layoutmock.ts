import {
  ACESFilmicToneMapping, BoxGeometry, BufferGeometry, CatmullRomCurve3, CircleGeometry, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  Float32BufferAttribute, Group, HemisphereLight, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D,
  PerspectiveCamera, Plane, PlaneGeometry, Raycaster, RingGeometry, Scene, SphereGeometry, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { loadMeshy, meshyEntries, meshyGeometry, meshyScene } from "@fo/render-3d/meshy";
import { Rigged } from "@fo/render-3d/rigged";
import { lookFor } from "@fo/render-3d/characters";
import { ART_M, BUILD_K, CHAR_K, FOV_DEG, PITCH_DEG, VIEW_W, YAW_DEG } from "@fo/render-3d/units";
import { HEMI, SUN } from "@fo/render-3d/environment";
import { deriveTokens } from "@fo/render-3d/tokens";
import { EXPOSURE } from "@fo/render-3d/renderer";
import { LOOK, modelScaleFor } from "@fo/content";

// Layout mock (dev sandbox): the crash site of story levels 1-5 as one drag-and-arrange map, in real metres, before
// anything in the game is rebuilt. Positions are metres on the ground (x east, z south = down the screen), drawn at
// ART_M units per metre. Read-only dev view; Copy settings sends the numbers back.

const CSS = `
#layoutmock { position: fixed; inset: 0; z-index: 20; background: #141518; color: var(--fg); display: none; }
#layoutmock.open { display: block; }
#layoutmock canvas { position: absolute; display: block; touch-action: none; }
#layoutmock .panel { position: absolute; left: 10px; top: 10px; bottom: 10px; width: min(320px, calc(100% - 20px)); overflow-y: auto; background: rgba(20,21,24,.92); border: 1px solid #333; border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 8px; z-index: 3; }
#layoutmock .row { display: flex; gap: 6px; flex-wrap: wrap; }
#layoutmock .sl b { display: block; font-size: 14px; }
#layoutmock .sl input { width: 100%; }
#layoutmock .sl span, #layoutmock .note { font-size: 12.5px; color: var(--dim); font-variant-numeric: tabular-nums; }
#layoutmock .out { font-size: 13px; font-variant-numeric: tabular-nums; line-height: 1.5; }
#layoutmock .tag { position: absolute; z-index: 2; pointer-events: none; font-size: 11px; line-height: 1.2; white-space: nowrap; padding: 2px 5px; border-radius: 4px; background: rgba(10,10,12,.78); color: #fff; transform: translate(-50%, -100%); font-variant-numeric: tabular-nums; }
#layoutmock .tag.small { font-size: 10px; opacity: .85; }`;

const NAMES = ["unit.player", "decor.halcyon_wreck", "decor.stasis_pod", "decor.stasis_glass", "sink.core.l1", "decor.ore_pile"];
const D2R = Math.PI / 180;
const M = ART_M;
const SCREEN_M = 6.07; // one phone screen width at play zoom, metres
// Doug's sizes (2026-11-04, second pass): decor pods 2.66 m long and 1.44 m tall, base 0.80 m in the sand (56%)
const SIZES = { ship: 27, pod: 2.66, cmdr: 1.98, podBuried: 0.8, settlementRadius: 10, recorder: [0.5, 0.3, 0.4], ridgeHeight: 1.5, ridgeWidth: 4 };
// iPhone 17: 402 x 874 points, portrait
const PHONE = { w: 402, h: 874 };
const POD_YAW = 173.9; // levels/story/story-L001.json pod yaw
// level-1 lid placement relative to its pod (world units at the level's own x0.833) and lift
const LID = { open: { dx: 3.9, dz: -30, lift: 59.1, roll: 118 }, shut: { dx: 1.5, dz: -5.9, lift: 44.5, roll: 0 }, levelK: 0.833 };

const SLOT_YAW = Math.PI / 2;
const m2 = (v: number): number => Math.round(v * 100) / 100;

export interface LayoutUi { open(): void; close(): void }

export function createLayoutMock(): LayoutUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "layoutmock";
  document.body.append(root);

  const skin = getSkin(DEFAULT_SKIN);
  const tk = deriveTokens(skin);
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
  sun.target.position.set(0, 0, 200);
  scene.add(new HemisphereLight(new Color(tk.sky), new Color(tk.groundDark), HEMI), sun, sun.target);
  const ground = new Mesh(new PlaneGeometry(20000, 20000), new MeshStandardMaterial({ color: new Color(tk.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.5;
  scene.add(ground);
  const camera = new PerspectiveCamera(28, 1, 5, 40000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = false;
  const dyn = new Group();
  scene.add(dyn);
  const rigged = new Rigged(dyn);

  // ---- state, metres ----
  const wreck = new Group(), pods = new Group(), reactor = new Group(), recorder = new Group(), ore = new Group();
  const ringGroup = new Group();
  scene.add(wreck, pods, reactor, recorder, ore, ringGroup);
  const setM = (o: Object3D, x: number, z: number): void => { o.position.x = x * M; o.position.z = z * M; };
  const getM = (o: Object3D): { x: number; z: number } => ({ x: o.position.x / M, z: o.position.z / M });
  // Doug's layout of 2026-11-04 as the start (docs/handoff/films-scenes.md); the ore at his blue disc's centre
  setM(wreck, 1.52, -1.88); setM(pods, 8.77, 6.37); setM(reactor, -10.05, 12.51); setM(recorder, 14.67, -0.67); setM(ore, -19.5, 20.9);
  let wreckYaw = -18;
  wreck.rotation.y = wreckYaw * D2R;

  const ridgeMs: [number, number][] = [[18, -15], [19.5, -6], [17, 3], [19, 12], [17.5, 19], [18.5, 25]];
  const ridgeHandles: Mesh[] = [];
  const ridgeMesh = new Mesh(new BufferGeometry(), new MeshStandardMaterial({ color: 0xd2b27a, roughness: 1, side: DoubleSide }));
  scene.add(ridgeMesh);
  const handleMat = new MeshBasicMaterial({ color: 0xffd34d });
  ridgeMs.forEach(([x, z]) => {
    const h = new Mesh(new SphereGeometry(0.5 * M, 12, 8), handleMat);
    setM(h, x, z); h.position.y = 0.5 * M;
    scene.add(h); ridgeHandles.push(h);
  });

  // ---- recorder + settlement ring ----
  {
    const [bx = 0.5, by = 0.3, bz = 0.4] = SIZES.recorder as number[];
    const box = new Mesh(new BoxGeometry(bx * M, by * M, bz * M), new MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6, emissive: 0x552200 }));
    box.position.y = by * M / 2;
    const pick = new Mesh(new SphereGeometry(0.9 * M, 8, 6), new MeshBasicMaterial({ visible: false }));
    recorder.add(box, pick);
    const R = SIZES.settlementRadius * M;
    const disc = new Mesh(new CircleGeometry(R, 64), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.07, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.4;
    const ring = new Mesh(new RingGeometry(R - 0.12 * M, R, 96), new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45;
    reactor.add(disc, ring);
  }

  // ---- phone screens ----
  interface Phone { name: string; handle: Mesh; line: LineLoop; label: HTMLElement }
  const phones: Phone[] = [];
  const aspect = PHONE.w / PHONE.h;
  const camDist = (VIEW_W / 2) / (Math.tan(FOV_DEG / 2 * D2R) * aspect);
  const offsetDir = (): Vector3 => {
    const p = PITCH_DEG * D2R, y = YAW_DEG * D2R;
    return new Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
  };
  /** Place a camera as the game's play camera looking at `look` (world units). */
  function playCamera(cam: PerspectiveCamera, look: Vector3): void {
    cam.fov = FOV_DEG; cam.aspect = aspect; cam.near = 5; cam.far = 40000;
    cam.position.copy(look).addScaledVector(offsetDir(), camDist);
    cam.lookAt(look);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  }
  const ground0 = new Plane(new Vector3(0, 1, 0), 0);
  function footprint(look: Vector3): Vector3[] {
    const c = new PerspectiveCamera();
    playCamera(c, look);
    return [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([nx, ny]) => {
      const ray = new Raycaster();
      ray.setFromCamera(new Vector2(nx!, ny!), c);
      return ray.ray.intersectPlane(ground0, new Vector3()) ?? look.clone();
    });
  }
  function refreshPhone(p: Phone): void {
    const pts = footprint(new Vector3(p.handle.position.x, 0, p.handle.position.z));
    const g = p.line.geometry as BufferGeometry;
    g.setFromPoints(pts.map((v) => new Vector3(v.x, 0.6, v.z)));
  }
  const phoneNames = ["Start (L1)", "Settlement", "Wreck walk (L4)"];
  const phoneColors = [0x4de1ff, 0x7dff6a, 0xff6af0];

  // ---- labels ----
  interface Tag { el: HTMLElement; obj: Object3D; name: string; dy: number }
  const tags: Tag[] = [];
  const addTag = (obj: Object3D, name: string, dy: number, small = false): HTMLElement => {
    const e = document.createElement("div");
    e.className = "tag" + (small ? " small" : "");
    root.append(e);
    tags.push({ el: e, obj, name, dy });
    return e;
  };

  // ---- model assembly ----
  /** Longer horizontal side of a decor model, in its own geometry units. */
  const longSide = (g: BufferGeometry): number => {
    g.computeBoundingBox();
    const b = g.boundingBox!;
    return Math.max(0.01, b.max.x - b.min.x, b.max.z - b.min.z);
  };
  let cmdrH1 = 0, cmdrWorldK = 0, podLongLocalX = true, podPitch = 0, ready = false;
  const podOffsets: number[] = [];

  function build(): void {
    // wreck: long side 27 m, centred on its bounding box
    const wg = meshyGeometry("decor.halcyon_wreck")!;
    if (!wg.geo.getAttribute("normal")) wg.geo.computeVertexNormals();
    const kw = SIZES.ship * M / longSide(wg.geo);
    const wb = wg.geo.boundingBox!;
    const wm = new Mesh(wg.geo, wg.mat);
    wm.scale.setScalar(kw);
    wm.position.set(-(wb.min.x + wb.max.x) / 2 * kw, 0.1, -(wb.min.z + wb.max.z) / 2 * kw);
    wreck.add(wm);

    // pods: 3.98 m on the long side; base 1.36 m below the sand; first one open
    const pg = meshyGeometry("decor.stasis_pod")!;
    const lg = meshyGeometry("decor.stasis_glass")!;
    for (const x of [pg, lg]) if (!x.geo.getAttribute("normal")) x.geo.computeVertexNormals();
    const pb = pg.geo.boundingBox!;
    const kp = SIZES.pod * M / longSide(pg.geo);
    podLongLocalX = (pb.max.x - pb.min.x) >= (pb.max.z - pb.min.z);
    const shortM = (podLongLocalX ? pb.max.z - pb.min.z : pb.max.x - pb.min.x) * kp / M;
    podPitch = shortM + 0.7;
    // Pod and lid in the bay frame the live scenes use (livescene.ts emptyBays): the built pod is 3.98 m long, so
    // model units are metres; the frame's origin is the cavity floor, the cradle's base 1.809 m below it, the glass
    // hinged along the back long edge. The frame is turned so the long side runs north-south.
    void lg; void LID; void POD_YAW; void SLOT_YAW;
    const k1 = SIZES.pod / 3.9847; // the build is 3.9847 m long
    // the cavity floor sits 1.809 build-metres above the cradle's base; scaled with the pod, while the burial depth is
    // real metres (an earlier version scaled the depth too)
    const CAVITY = 1.809, frameY = (CAVITY * k1 - SIZES.podBuried) * M;
    // three pods as the film and game show them (Doug): the commander's, featured and open, and two sealed in the
    // background (level 1's data places five, but only these three read as pods)
    for (let i = 0; i < 3; i++) {
      const ox = (i - 1) * podPitch * M;
      podOffsets.push(ox);
      const slot = new Group();
      slot.position.set(ox, frameY, 0);
      slot.rotation.y = -Math.PI / 2;
      slot.scale.setScalar(M * k1);
      const p = meshyScene("decor.stasis_pod");
      if (p) { p.position.set(0.034, -CAVITY, -0.257); slot.add(p); }
      const hinge = new Group();
      hinge.position.set(0, 0.1, 0.71);
      const glass = meshyScene("decor.stasis_glass");
      if (glass) { glass.position.z = -0.709; hinge.add(glass); }
      // the commander's pod open (as empty_bays opens bay 5), the four others sealed
      hinge.rotation.x = i === 0 ? 1.75 : 0;
      slot.add(hinge);
      pods.add(slot);
    }
    // commander: 1.98 m
    const e = rigged.entryFor("unit.player")!;
    const look = lookFor("unit.player", tk, skin.models).scale;
    cmdrH1 = (e.height ?? 0.9) * look * CHAR_K / 0.9; // metres at x1
    cmdrWorldK = (M * look * CHAR_K) / 0.9 * (SIZES.cmdr / cmdrH1);

    // reactor, at the game's building scale: ART_M x buildScale x look.json modelScale (the mock first left out modelScale)
    const c = meshyScene("sink.core.l1");
    if (c) { const g = new Group(); g.add(c); g.scale.setScalar(M * BUILD_K * modelScaleFor(LOOK.modelScale, "sink.core", 1)); reactor.add(g); }
    else { const m = new Mesh(new CylinderGeometry(20, 24, 30, 16), new MeshStandardMaterial({ color: 0xd0a050 })); m.position.y = 15; reactor.add(m); }
    // the reactor's ore: the game's ore pile decor (meshy width 2 m), drawn at ART_M like other decor
    const op = meshyScene("node.material_source");
    if (op) { const g = new Group(); g.add(op); g.scale.setScalar(M); ore.add(g); }
    else { const m = new Mesh(new SphereGeometry(0.9 * M, 12, 8), new MeshStandardMaterial({ color: 0x8fd0ff })); m.position.y = 0.3 * M; ore.add(m); }
    // now the pod slots exist: put the phone look points where they were meant to start
    phoneInitial().forEach((v, i) => { const ph = phones[i]!; ph.handle.position.x = v.x; ph.handle.position.z = v.z; refreshPhone(ph); });
    ready = true;
    whole();
  }
  /** Game decor scale for a model id (renderer.ts placeStoryDecor): manifest width over the longer ground side. */
  function kOfId(id: string, geo: BufferGeometry): number {
    const e = meshyEntries().find((x) => x.id === id);
    return ART_M * (e?.width ?? 1.4) / longSide(geo);
  }

  function placeCmdr(): void {
    const e = rigged.entryFor("unit.player");
    if (!e || !ready) return;
    rigged.begin();
    rigged.add("cmdr", "unit.player", e, { moving: false, hurried: false, cheer: false, speed: 0, run: false }, 0, 0, 0, cmdrWorldK);
    rigged.end(0);
    const r = rigged.rootOf("cmdr");
    if (!r) return;
    // along the pod's long side (north-south), head to the south, face down
    void podLongLocalX;
    const a = 0;
    const Hw = SIZES.cmdr * M;
    const top = 0.1 * Hw + 0.05 * M;
    const cx = pods.position.x + podOffsets[0]!;
    r.rotation.set(Math.PI / 2, a, 0, "YXZ");
    r.position.set(cx - Math.sin(a) * Hw / 2, top, pods.position.z - Math.cos(a) * Hw / 2);
  }

  // ---- ridge mesh ----
  function rebuildRidge(): void {
    const pts = ridgeHandles.map((h) => new Vector3(h.position.x, 0, h.position.z));
    const curve = new CatmullRomCurve3(pts, false, "centripetal");
    const N = 90, U = 11, H = SIZES.ridgeHeight * M, W = SIZES.ridgeWidth * M / 2;
    const pos: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = curve.getPoint(t), tg = curve.getTangent(t);
      const nx = -tg.z, nz = tg.x, nl = Math.hypot(nx, nz) || 1;
      for (let j = 0; j < U; j++) {
        const u = (j / (U - 1)) * 2 - 1;
        const c = Math.cos(u * Math.PI / 2);
        pos.push(p.x + (nx / nl) * u * W, c * c * H, p.z + (nz / nl) * u * W);
      }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < U - 1; j++) {
      const a = i * U + j, b = a + 1, c = a + U, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    ridgeMesh.geometry.dispose();
    ridgeMesh.geometry = g;
  }

  // ---- phones: build now (they need no models) ----
  const phoneInitial = (): Vector3[] => {
    const p0 = new Vector3(pods.position.x + (podOffsets[0] ?? -2 * 4.7 * M), 0, pods.position.z);
    return [p0, reactor.position.clone(), p0.clone().add(recorder.position).multiplyScalar(0.5)];
  };
  function makePhones(): void {
    const starts = phoneInitial();
    phoneNames.forEach((name, i) => {
      const handle = new Mesh(new CylinderGeometry(0.7 * M, 0.7 * M, 0.3 * M, 16), new MeshBasicMaterial({ color: phoneColors[i] }));
      handle.position.copy(starts[i]!); handle.position.y = 0.7;
      const line = new LineLoop(new BufferGeometry(), new LineBasicMaterial({ color: phoneColors[i] }));
      line.frustumCulled = false;
      scene.add(handle, line);
      const label = addTag(handle, name, 0.9 * M);
      const p = { name, handle, line, label };
      phones.push(p);
      refreshPhone(p);
    });
  }

  // ---- movable things ----
  interface Movable { key: string; obj: Object3D; onMove?: (() => void) | undefined }
  const movables: Movable[] = [];
  const reg = (key: string, obj: Object3D, onMove?: () => void): void => { obj.userData["key"] = key; movables.push({ key, obj, onMove }); };
  reg("wreck", wreck); reg("pods", pods); reg("reactor", reactor); reg("recorder", recorder); reg("ore", ore);
  ridgeHandles.forEach((h, i) => reg(`ridge${i}`, h, rebuildRidge));

  // ---- panel ----
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };
  const panel = el("div", undefined, "panel");
  const back = el("button", "Back"), copy = el("button", "Copy settings"), hide = el("button", "Hide panel");
  const row1 = el("div", undefined, "row");
  row1.append(back, copy, hide);
  const row2 = el("div", undefined, "row");
  const bWhole = el("button", "Whole layout");
  row2.append(bWhole);
  const phoneBtns = phoneNames.map((n) => el("button", `Phone view: ${n.replace(/ \(.*/, "")}`));
  const row3 = el("div", undefined, "row");
  row3.append(...phoneBtns);
  const yawD = el("div", undefined, "sl");
  const yawS = el("input"); yawS.type = "range"; yawS.min = "-180"; yawS.max = "180"; yawS.step = "1"; yawS.value = String(wreckYaw);
  const yawOut = el("span", `wreck yaw ${wreckYaw} deg`);
  yawS.oninput = () => { wreckYaw = Number(yawS.value); wreck.rotation.y = wreckYaw * D2R; yawOut.textContent = `wreck yaw ${wreckYaw} deg`; };
  yawD.append(el("b", "Wreck yaw"), yawS, yawOut);
  const readout = el("div", undefined, "out");
  const note = el("div", "Drag the ship, pods, reactor, ore, recorder, yellow ridge points or coloured screen discs across the ground; the camera is locked while you drag. Each outline is the exact patch of ground an iPhone 17 (402 x 874 pt, portrait) shows at play zoom: 6.07 m across its middle, and long on the ground because the camera looks across it at 30 degrees. Seen from the game's angle (Whole layout, or Phone view) it has the phone's shape.", "note");
  panel.append(row1, row2, row3, yawD, readout, note);
  const shown = el("button", "Panel"); shown.style.cssText = "position:absolute;left:10px;top:10px;display:none;z-index:3";
  hide.onclick = () => { panel.style.display = "none"; shown.style.display = ""; };
  shown.onclick = () => { panel.style.display = ""; shown.style.display = "none"; };
  root.append(canvas, panel, shown);

  const dist = (a: Object3D, b: Object3D): number => Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z) / M;
  const podsFirst = (): Object3D => { const o = new Object3D(); o.position.set(pods.position.x + (podOffsets[0] ?? 0), 0, pods.position.z); return o; };
  function paint(): void {
    const pf = podsFirst();
    const line = (n: string, m: number): string => `${n}: ${m.toFixed(1)} m = ${(m / SCREEN_M).toFixed(1)} screens`;
    readout.innerHTML = [
      line("pods to reactor", dist(pf, reactor)),
      line("reactor to ore", dist(reactor, ore)),
      line("pods to recorder", dist(pf, recorder)),
      line("reactor to recorder", dist(reactor, recorder)),
      line("ship length", SIZES.ship),
    ].join("<br>");
  }
  copy.onclick = () => {
    const pf = podsFirst();
    const pos = (o: Object3D): { x: number; z: number } => { const p = getM(o); return { x: m2(p.x), z: m2(p.z) }; };
    const out = JSON.stringify({
      unitsPerMetre: M,
      wreck: { ...pos(wreck), yawDeg: wreckYaw },
      pods: { groupCentre: pos(pods), commanderPod: { x: m2(pf.position.x / M), z: m2(pf.position.z / M) }, pitchM: m2(podPitch) },
      reactor: pos(reactor),
      recorder: pos(recorder),
      ore: pos(ore),
      ridge: ridgeHandles.map(pos),
      phoneLookPoints: Object.fromEntries(phones.map((p) => [p.name, pos(p.handle)])),
      distancesM: { podsToReactor: m2(dist(pf, reactor)), podsToRecorder: m2(dist(pf, recorder)), reactorToRecorder: m2(dist(reactor, recorder)) },
      fixedSizesM: SIZES,
    }, null, 1);
    void navigator.clipboard?.writeText(out).then(() => { copy.textContent = "Copied"; setTimeout(() => (copy.textContent = "Copy settings"), 1200); }, () => prompt("Settings", out));
  };

  // ---- camera views ----
  let phoneMode = false;
  function whole(): void {
    phoneMode = false;
    camera.fov = 28;
    const ps: Object3D[] = [wreck, pods, reactor, recorder, ...ridgeHandles, ...phones.map((p) => p.handle)];
    let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (const o of ps) { minx = Math.min(minx, o.position.x); maxx = Math.max(maxx, o.position.x); minz = Math.min(minz, o.position.z); maxz = Math.max(maxz, o.position.z); }
    const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
    const R = Math.hypot(maxx - minx, maxz - minz) / 2 + 6 * M;
    resize();
    const half = Math.atan(Math.tan(14 * D2R) * Math.min(1, camera.aspect));
    const d = R / Math.sin(half);
    controls.target.set(cx, 0, cz);
    camera.position.set(cx, 0, cz).addScaledVector(offsetDir(), d);
    camera.updateProjectionMatrix();
    controls.update();
  }
  function phoneView(i: number): void {
    phoneMode = true;
    const h = phones[i]!.handle;
    const look = new Vector3(h.position.x, 0, h.position.z);
    controls.target.copy(look);
    playCamera(camera, look);
    controls.update();
    resize();
  }
  bWhole.onclick = whole;
  phoneBtns.forEach((b, i) => { b.onclick = () => phoneView(i); });

  // ---- dragging ----
  const ray = new Raycaster();
  const ndc = new Vector2();
  let drag: { m: Movable; off: Vector3 } | null = null;
  const groundHit = (ev: PointerEvent, atY: number): Vector3 | null => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -atY), new Vector3());
  };
  const phoneByHandle = (o: Object3D): Phone | undefined => phones.find((p) => p.handle === o);
  canvas.addEventListener("pointerdown", (ev) => {
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const roots = [...movables.map((m) => m.obj), ...phones.map((p) => p.handle)];
    const hit = ray.intersectObjects(roots, true)[0];
    if (!hit) return;
    let o: Object3D | null = hit.object;
    while (o && !roots.includes(o)) o = o.parent;
    if (!o) return;
    const mv = movables.find((m) => m.obj === o) ?? { key: "phone", obj: o, onMove: () => { const p = phoneByHandle(o!); if (p) refreshPhone(p); } };
    const g = groundHit(ev, 0);
    if (!g) return;
    drag = { m: mv, off: new Vector3(o.position.x - g.x, 0, o.position.z - g.z) };
    controls.enabled = false;
    canvas.setPointerCapture(ev.pointerId);
    ev.stopPropagation();
  }, true);
  canvas.addEventListener("pointermove", (ev) => {
    if (!drag) return;
    const g = groundHit(ev, 0);
    if (!g) return;
    drag.m.obj.position.x = g.x + drag.off.x;
    drag.m.obj.position.z = g.z + drag.off.z;
    drag.m.onMove?.();
  });
  const endDrag = (ev: PointerEvent): void => {
    if (!drag) return;
    drag = null;
    controls.enabled = true;
    try { canvas.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  // test hook: window.__layoutMock lets a script read/move things without real pointer events
  (window as unknown as Record<string, unknown>)["__layoutMock"] = { movables, getM, setM, camera, controls, gl, whole, pods, scene };

  // ---- loop ----
  let isOpen = false, raf = 0, loading: Promise<void> | null = null;
  function resize(): void {
    const w = root.clientWidth, h = root.clientHeight;
    if (!w || !h) return;
    let cw = w, ch = h, left = 0, top = 0;
    if (phoneMode) {
      ch = Math.min(h - 20, PHONE.h); cw = Math.round(ch * aspect);
      left = Math.round((w - cw) / 2); top = Math.round((h - ch) / 2);
      camera.fov = FOV_DEG;
    }
    canvas.style.left = `${left}px`; canvas.style.top = `${top}px`;
    canvas.style.width = `${cw}px`; canvas.style.height = `${ch}px`;
    gl.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    // with the panel open, centre the view in the free area to its right
    const shift = !phoneMode && panel.style.display !== "none" ? Math.min(330, cw * 0.4) / 2 : 0;
    if (shift) camera.setViewOffset(cw, ch, -shift, 0, cw, ch); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  const proj = new Vector3();
  function placeTags(): void {
    const rr = root.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
    for (const t of tags) {
      const p = getM(t.obj);
      t.el.textContent = `${t.name} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) m`;
      proj.set(t.obj.position.x, t.dy, t.obj.position.z).project(camera);
      t.el.style.left = `${cr.left - rr.left + (proj.x * 0.5 + 0.5) * cr.width}px`;
      t.el.style.top = `${cr.top - rr.top + (-proj.y * 0.5 + 0.5) * cr.height}px`;
      if (phoneMode) { t.el.style.display = "none"; continue; }
      t.el.style.display = proj.z < 1 && Math.abs(proj.x) < 1 && Math.abs(proj.y) < 1 ? "" : "none";
    }
  }
  function frame(): void {
    if (!isOpen) return;
    // the phone view shows what the player sees: no handles or outlines
    for (const h of ridgeHandles) h.visible = !phoneMode;
    for (const ph of phones) { ph.handle.visible = !phoneMode; ph.line.visible = !phoneMode; }
    for (const t of tags) if (phoneMode) t.el.style.display = "none";
    raf = requestAnimationFrame(frame);
    resize();
    placeCmdr();
    paint();
    placeTags();
    gl.render(scene, camera);
  }
  // labels for everything movable
  addTag(wreck, "Halcyon wreck", 4 * M);
  addTag(pods, "Pods (3)", 3 * M);
  addTag(ore, "Ore", 1.6 * M);
  addTag(reactor, "Reactor", 8 * M);
  addTag(recorder, "Flight recorder", 1.6 * M);
  ridgeHandles.forEach((h, i) => addTag(h, `ridge ${i + 1}`, 1.6 * M, true));
  makePhones();
  rebuildRidge();

  return {
    open(): void {
      isOpen = true;
      root.classList.add("open");
      back.onclick = () => this.close();
      loading ??= loadMeshy(undefined, new Set(NAMES), undefined, true).then(() => {
        if (meshyGeometry("decor.stasis_pod") && meshyGeometry("decor.halcyon_wreck") && rigged.entryFor("unit.player")) build();
        else panel.append(el("div", "Models failed to load", "note"));
      });
      cancelAnimationFrame(raf);
      if (!ready) whole();
      frame();
    },
    close(): void {
      isOpen = false;
      root.classList.remove("open");
      cancelAnimationFrame(raf);
    },
  };
}
