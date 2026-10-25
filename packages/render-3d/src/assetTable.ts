import {
  ACESFilmicToneMapping, AnimationMixer, Box3, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshStandardMaterial,
  PCFShadowMap, PerspectiveCamera, PlaneGeometry, Scene, SRGBColorSpace, Vector3, WebGLRenderer, type Object3D, type SkinnedMesh,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { loadMeshy, meshyEntries, meshyRig, meshyScene, setMeshyBrightness, type MeshyEntry } from "./assets/meshy.js";
import { SUN, SUN_OFS, HEMI } from "./scene/environment.js";
import { deriveTokens } from "./tokens.js";
import { ART_M, BUILD_K, CHAR_K, FOV_DEG, ITEM_K, PITCH_DEG, TIERS, YAW_DEG, screenToWorld } from "./units.js";
import { EXPOSURE } from "./renderer.js";

// Asset table (dev sandbox): every built Meshy model on a grid over a ground plane, lit and
// toned like the game camera (renderer.ts exposure and output, environment.ts lights from the
// active skin's tokens, units.ts camera angles), so a brightness reading here matches the game.
// No fog-free sky dome, storm or core light: the table is a plain daytime lab.

const PITCH = (PITCH_DEG * Math.PI) / 180, YAW = (YAW_DEG * Math.PI) / 180;
const GAP = 14;

export interface AssetTable {
  /** Pan the view by a screen drag in CSS px. */
  pan(dxPx: number, dyPx: number): void;
  centre(): void;
  setBrightness(k: number): void;
  resize(): void;
  /** Models placed once loaded (0 until then). */
  readonly status: { placed: number };
  dispose(): void;
}

export function createAssetTable(stage: HTMLElement, brightness: number): AssetTable {
  const t = deriveTokens(getSkin(DEFAULT_SKIN));
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none";
  stage.appendChild(canvas);
  const gl = new WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  gl.outputColorSpace = SRGBColorSpace; // renderer.ts init
  gl.toneMapping = ACESFilmicToneMapping;
  gl.toneMappingExposure = EXPOSURE;
  const tier = TIERS.medium;
  gl.shadowMap.enabled = tier.shadows;
  gl.shadowMap.type = PCFShadowMap;
  gl.setPixelRatio(Math.min(tier.maxPixelRatio, Math.max(1, devicePixelRatio || 1)));

  const scene = new Scene();
  scene.background = new Color(t.fog);
  // environment.ts: hemisphere sky over groundDark, warm key light low from the left
  const hemi = new HemisphereLight(new Color(t.sky), new Color(t.groundDark), HEMI);
  const sun = new DirectionalLight(new Color(t.sun), SUN);
  sun.castShadow = true;
  sun.shadow.mapSize.set(tier.shadowSize, tier.shadowSize);
  Object.assign(sun.shadow.camera, { left: -520, right: 520, top: 640, bottom: -640, near: 10, far: 2000 });
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 1.5;
  scene.add(hemi, sun, sun.target);

  const camera = new PerspectiveCamera(FOV_DEG, 1, 10, 6000);
  const look = new Vector3();
  let viewW = 300, tableW = 300, tableH = 300;
  const mixers: AnimationMixer[] = [];
  const models = new Group();
  scene.add(models);

  const ground = new Mesh(new PlaneGeometry(6000, 6000), new MeshStandardMaterial({ color: new Color(t.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const size = new Vector3();
  const state = { placed: 0 };

  /** World scale for an entry: buildings by BUILD_K, items by ITEM_K, the rest by ART_M alone. */
  function worldK(e: MeshyEntry): number {
    if (e.kind === "item") return ART_M * ITEM_K;
    return e.kind ? ART_M : ART_M * BUILD_K;
  }

  function build(e: MeshyEntry): Object3D | undefined {
    if (e.kind === "character") {
      const rig = meshyRig(e.file);
      if (!rig) return undefined;
      const root = cloneSkinned(rig.scene);
      root.traverse((o) => { if ((o as Mesh).isMesh) o.frustumCulled = false; });
      const clip = rig.clips.find((c) => c.name === e.clips?.["idle"]) ?? rig.clips[0];
      if (clip) { const m = new AnimationMixer(root); m.clipAction(clip).play(); m.setTime(0); mixers.push(m); }
      root.updateMatrixWorld(true);
      // as rigged.ts: art metres per model unit by height (or body length), measured as drawn
      const box = new Box3();
      root.traverse((o) => {
        const m = o as SkinnedMesh;
        if (!m.isMesh) return;
        if (m.isSkinnedMesh) { m.skeleton.update(); m.computeBoundingBox(); box.union(m.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
        else { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld)); }
      });
      box.getSize(size);
      const h = e.length ? e.length / (Math.max(size.x, size.z) || 1) : (e.height ?? 1.1) / (size.y || 1.7);
      const g = new Group();
      g.add(root);
      g.scale.setScalar(ART_M * CHAR_K * h);
      return g;
    }
    const s = meshyScene(e.file);
    if (!s) return undefined;
    const g = new Group();
    g.add(s);
    g.scale.setScalar(worldK(e));
    return g;
  }

  function layout(): void {
    const items = meshyEntries().map((e) => ({ e, g: build(e) })).filter((x): x is { e: MeshyEntry; g: Object3D } => !!x.g);
    state.placed = items.length;
    const portrait = stage.clientHeight > stage.clientWidth;
    const boxes = items.map(({ g }) => { g.updateMatrixWorld(true); return new Box3().setFromObject(g); });
    const rowMax = Math.max(220, (portrait ? 3.2 : 7) * median(boxes.map((b) => b.max.x - b.min.x + GAP)));
    // flow rows left to right; a row is as deep as its deepest model
    let x = 0, z = 0, rowD = 0, maxX = 0;
    items.forEach(({ g }, i) => {
      const b = boxes[i]!, w = b.max.x - b.min.x, d = b.max.z - b.min.z;
      if (x > 0 && x + w > rowMax) { x = 0; z += rowD + GAP; rowD = 0; }
      g.position.set(x - b.min.x, -b.min.y, z - b.min.z);
      g.traverse((o) => { if ((o as Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      models.add(g);
      x += w + GAP;
      rowD = Math.max(rowD, d);
      maxX = Math.max(maxX, x);
    });
    tableW = Math.max(maxX, 100);
    tableH = z + rowD;
    // the table is turned 45 degrees: a row spans about 0.71 of its length across the screen
    viewW = Math.min((tableW + tableH) * 0.71, tableW * 0.71 + 40) + 80;
    centre();
  }

  function centre(): void { look.set(tableW / 2, 0, tableH / 2); }

  function resize(): void {
    const w = stage.clientWidth, h = stage.clientHeight;
    gl.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  let raf = 0, last = performance.now();
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    for (const m of mixers) m.update(dt);
    // as renderer.ts followCamera: back off until viewW of ground fills the width
    const vfov = (camera.fov * Math.PI) / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const d = viewW / 2 / Math.tan(hfov / 2);
    camera.position.set(look.x + Math.sin(YAW) * Math.cos(PITCH) * d, Math.sin(PITCH) * d, look.z + Math.cos(YAW) * Math.cos(PITCH) * d);
    camera.near = Math.max(10, d * 0.2);
    camera.far = d * 6;
    camera.updateProjectionMatrix();
    camera.lookAt(look);
    camera.updateMatrixWorld();
    // the sun follows the look point (environment.ts update)
    sun.position.set(look.x + SUN_OFS[0], SUN_OFS[1], look.z + SUN_OFS[2]);
    sun.target.position.copy(look);
    sun.target.updateMatrixWorld();
    if (!scene.fog) scene.fog = new Fog(t.fog, 0, 1);
    (scene.fog as Fog).near = d + 570; // environment.ts: fog is measured from the camera
    (scene.fog as Fog).far = d + 2570;
    ground.position.set(look.x, 0, look.z);
    gl.render(scene, camera);
  }

  setMeshyBrightness(brightness);
  resize();
  // unwired = true: models that are built but not used in the game show too
  void loadMeshy(undefined, undefined, undefined, true).then(layout);
  raf = requestAnimationFrame(frame);

  return {
    pan(dxPx, dyPx) {
      // as the old sandbox: a drag moves the ground by its screen share of viewW
      const k = viewW / stage.clientWidth;
      const w = screenToWorld(-dxPx * k, (-dyPx * k) / Math.sin(PITCH));
      look.x += w.x;
      look.z += w.y;
    },
    centre, setBrightness: setMeshyBrightness, resize, status: state,
    dispose() { cancelAnimationFrame(raf); gl.dispose(); canvas.remove(); },
  };
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)] ?? 40;
}
