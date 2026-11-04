import {
  AmbientLight, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  PointLight, Scene, Vector3, WebGLRenderer, type Material,
} from "three";
import { loadMeshy, meshyScene } from "../assets/meshy.js";

// Live scenes (docs/STORY-LEVELS-V2-PLAN.md, Phase 2 F2): short story scenes staged in three.js with the
// game's own models instead of a pre-rendered video, on their own canvas so the game renderer is untouched.
// Words and images come from the skin (`text`, `images`); this file holds only staging and timing.

export type LiveSceneResult = "ended" | "skipped" | "failed";

export interface LiveSceneOptions {
  /** User-facing words by key, from the skin. */
  text: Readonly<Record<string, string>>;
  /** Image URLs by key, from the skin. */
  images: Readonly<Record<string, string>>;
  skipLabel?: string;
  /** Dev: hold on this second instead of playing (a tap ends it). */
  at?: number;
  /** Dev: draw every surface as wireframe, to judge staging and motion before materials and the filter. */
  wire?: boolean;
  /** In a small frame over play instead of full screen: no skip, taps pass through, it ends by itself. */
  inset?: boolean;
}

interface Staged {
  seconds: number;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Pose everything for second t. */
  pose(t: number): void;
  /** Screen-anchored labels: a world point and its element, kept over the point each frame. */
  labels: { at: Vector3; el: HTMLElement }[];
  dispose(): void;
}

const ease = (k: number): number => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));

/** The cryo deck on KILN's bay camera: four sealed pods read OCCUPIED, bay 5 unlocks, its glass lifts on nobody. */
function emptyBays(doc: Document, o: LiveSceneOptions, overlay: HTMLElement): Staged {
  const scene = new Scene();
  scene.background = new Color("#05080a");
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new AmbientLight("#9fb4c8", 1.3));
  const key = new DirectionalLight("#dfe9f5", 2.2);
  key.position.set(-6, 12, 8);
  scene.add(key);
  const deck = new Mesh(new BoxGeometry(24, 0.6, 9), new MeshStandardMaterial({ color: "#3a4048", roughness: 0.8, metalness: 0.4 }));
  deck.position.y = -0.3;
  scene.add(deck);
  const labels: Staged["labels"] = [];
  const bays: { light: Mesh; mat: MeshStandardMaterial; hinge: Group; glow: PointLight }[] = [];
  // four pods side by side along x, each lying lengthwise toward the camera
  for (let i = 0; i < 4; i++) {
    const bay = new Group();
    bay.position.set((i - 1.5) * 4.6, 0, 0);
    bay.rotation.y = -Math.PI / 2;
    const pod = meshyScene("decor.stasis_pod");
    // the crash film's pod: its build stands it on its sunk cradle, so these put the film's pod frame (cavity
    // floor at the deck, hinge along the back long edge) on the bay's origin
    if (pod) { pod.position.set(0.034, -1.809, -0.257); bay.add(pod); }
    const hinge = new Group();
    hinge.position.set(0, 0.1, 0.71);
    const glass = meshyScene("decor.stasis_glass");
    if (glass) { glass.position.z = -0.709; hinge.add(glass); }
    bay.add(hinge);
    const mat = new MeshStandardMaterial({ color: "#1a1a1a", emissive: "#3cff7a", emissiveIntensity: 2 });
    const light = new Mesh(new BoxGeometry(0.5, 0.18, 0.12), mat);
    light.position.set(-1.75, 0.4, 0.95);
    bay.add(light);
    const glow = new PointLight("#bfe6ff", 0, 6);
    glow.position.set(0, 1.4, 0);
    bay.add(glow);
    scene.add(bay);
    bays.push({ light, mat, hinge, glow });
    const el = doc.createElement("div");
    el.className = "live-tag";
    el.textContent = o.text["occupied"] ?? "";
    overlay.append(el);
    labels.push({ at: new Vector3((i - 1.5) * 4.6, 2.6, 2.9), el });
  }
  const plate = doc.createElement("div");
  plate.className = "live-plate";
  plate.innerHTML = `<img alt="" src="${o.images["badge"] ?? ""}"><b></b><span></span>`;
  plate.querySelector("b")!.textContent = o.text["name"] ?? "";
  plate.querySelector("span")!.textContent = o.text["rank"] ?? "";
  overlay.append(plate);
  const bay5 = bays[0]!;
  return {
    seconds: 6.2,
    scene, camera, labels,
    pose(t) {
      // a high security camera that drifts in on bay 5
      const k = span(t, 0, 6);
      camera.position.set(-2 - 4.5 * k, 15 - 3.5 * k, 10 - 2.6 * k);
      camera.lookAt(-1.5 - 5.2 * k, 0.4, 0.4);
      // bay 5's lock releases at 1.6 s: OCCUPIED turns amber, the glass jolts, then swings up on its back hinge
      const open = t >= 1.6;
      bay5.mat.emissive.set(open ? "#ffb02e" : "#3cff7a");
      labels[0]!.el.textContent = (open ? o.text["unlocked"] : o.text["occupied"]) ?? "";
      labels[0]!.el.classList.toggle("warn", open);
      const jolt = t > 1.6 && t < 1.8 ? 0.04 : 0;
      bay5.hinge.position.y = 0.1 + jolt;
      bay5.hinge.rotation.x = 1.75 * span(t, 3.2, 5.0);
      bay5.glow.intensity = 6 * span(t, 3.4, 4.6);
      plate.classList.toggle("on", t >= 1.9 && t < 4.6);
      for (const b of bays.slice(1)) b.mat.emissiveIntensity = 1.6 + 0.4 * Math.sin(t * 9 + b.light.id);
    },
    dispose() {
      scene.traverse((m) => {
        const mesh = m as Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mt = mesh.material as Material | Material[] | undefined;
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose()); else mt?.dispose();
      });
    },
  };
}

const SCENES: Readonly<Record<string, { models: readonly string[]; stage: (doc: Document, o: LiveSceneOptions, overlay: HTMLElement) => Staged }>> = {
  empty_bays: { models: ["decor.stasis_pod", "decor.stasis_glass"], stage: emptyBays },
};

export const LIVE_SCENES: readonly string[] = Object.keys(SCENES);

/** Full-screen live scene over `host`. Tap (or Skip) ends it; no WebGL or a missing scene resolves "failed" at once. */
export async function playLiveScene(host: HTMLElement, id: string, o: LiveSceneOptions): Promise<LiveSceneResult> {
  const def = SCENES[id];
  if (!def) return "failed";
  const doc = host.ownerDocument;
  let gl: WebGLRenderer;
  // a held dev frame keeps its buffer so it can be read back
  try { gl = new WebGLRenderer({ antialias: true, powerPreference: "high-performance", preserveDrawingBuffer: o.at !== undefined }); } catch { return "failed"; }
  await loadMeshy(undefined, new Set(def.models), undefined, true);
  const wrap = doc.createElement("div");
  wrap.className = o.inset ? "cine live inset" : "cine live";
  wrap.setAttribute("role", "dialog");
  const overlay = doc.createElement("div");
  overlay.className = "live-overlay";
  const hud = doc.createElement("div");
  hud.className = "live-hud";
  hud.textContent = o.text["feed"] ?? "";
  const skip = doc.createElement("button");
  skip.className = "cine-skip";
  skip.textContent = o.skipLabel ?? "Skip";
  gl.domElement.className = "live-canvas";
  const scan = doc.createElement("i");
  scan.className = "live-scan";
  wrap.append(gl.domElement, scan, overlay, hud, ...(o.inset ? [] : [skip]));
  host.append(wrap);
  const staged = def.stage(doc, o, overlay);
  // a held frame is a dev check: leave the staging where the console can measure it
  if (o.at !== undefined) (globalThis as { __liveStaged?: Staged }).__liveStaged = staged;
  if (o.wire) {
    staged.scene.overrideMaterial = new MeshBasicMaterial({ color: "#7fffd4", wireframe: true });
    wrap.classList.add("wire");
  }
  const size = (): void => {
    const w = wrap.clientWidth || 1, h = wrap.clientHeight || 1;
    gl.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    gl.setSize(w, h, false);
    staged.camera.aspect = w / h;
    // keep the four bays in frame on a tall phone screen
    staged.camera.fov = w / h < 0.8 ? 58 : 38;
    staged.camera.updateProjectionMatrix();
  };
  size();
  const tmp = new Vector3();
  const frame = (t: number): void => {
    staged.pose(t);
    gl.render(staged.scene, staged.camera);
    const w = wrap.clientWidth, h = wrap.clientHeight;
    for (const l of staged.labels) {
      tmp.copy(l.at).project(staged.camera);
      l.el.style.transform = `translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px) translate(-50%, -100%)`;
    }
  };
  return new Promise<LiveSceneResult>((done) => {
    let raf = 0, t0 = 0, finished = false;
    const end = (r: LiveSceneResult): void => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      removeEventListener("resize", size);
      wrap.classList.add("out");
      setTimeout(() => { staged.dispose(); gl.dispose(); wrap.remove(); done(r); }, 300);
    };
    if (!o.inset) wrap.addEventListener("click", () => end("skipped"));
    addEventListener("resize", size);
    if (o.at !== undefined) frame(o.at);
    const tick = (now: number): void => {
      t0 ||= now;
      const t = o.at ?? (now - t0) / 1000;
      if (t >= staged.seconds) { end("ended"); return; }
      frame(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  });
}
