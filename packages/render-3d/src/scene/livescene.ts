import {
  AmbientLight, AnimationMixer, Box3, LoopOnce, Matrix4, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  ACESFilmicToneMapping, CircleGeometry, Fog, HemisphereLight, PlaneGeometry, PointLight, Quaternion, Scene, SphereGeometry, SpotLight, Vector3, WebGLRenderer, type Material, type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadMeshy, meshyCharacters, meshyRig, meshyScene } from "../assets/meshy.js";
import { heldInHand } from "./rigged.js";
import { ART_M, FOV_DEG, PITCH_DEG, YAW_DEG } from "../units.js";
import { SUN_OFS, lookGround } from "./environment.js";
import type { LiveLook } from "../contract.js";
import { POD_CAVITY_M, POD_K, SIZES } from "../sizes.js";
import RIG from "../assets/buggy.json";

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
  /** The game's ground and light at the moment the scene starts (renderer liveLook()); a scene that opts in stands on it. */
  look?: LiveLook;
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

/** A bay's cavity floor above the ground plane: the game sinks the decor pod 0.80 m, so the base is below the plane (sizes.ts). */
const BAY_LIFT = POD_CAVITY_M;
const ease = (k: number): number => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
/**
 * Swap a wide-angle shot for the game's own lens (FOV_DEG, a near-flat 8 degrees): the camera backs off along its line of
 * sight so the framing is unchanged, but near and far pods keep the proportions the game shows (a wide lens makes the
 * near pod and the people beside it read bigger than the game's).
 */
function gameLens(camera: PerspectiveCamera, target: Vector3): void {
  const wide = camera.aspect < 0.8 ? 58 : 38; // what size() set for this aspect
  const f = Math.tan((wide * Math.PI) / 360) / Math.tan((FOV_DEG * Math.PI) / 360);
  camera.position.sub(target).multiplyScalar(f).add(target);
  camera.fov = FOV_DEG;
  camera.updateProjectionMatrix();
}
const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));

/** The cryo deck on KILN's bay camera: four sealed pods read OCCUPIED, bay 5 unlocks, its glass lifts on nobody. */
function emptyBays(doc: Document, o: LiveSceneOptions, overlay: HTMLElement): Staged {
  const scene = new Scene();
  scene.background = new Color("#05080a");
  const camera = new PerspectiveCamera(38, 1, 0.1, 1200);
  scene.add(new AmbientLight("#9fb4c8", 1.3));
  const key = new DirectionalLight("#dfe9f5", 2.2);
  key.position.set(-6, 12, 8);
  scene.add(key);
  const deck = new Mesh(new BoxGeometry(24, 0.6, 9), new MeshStandardMaterial({ color: "#3a4048", roughness: 0.8, metalness: 0.4 }));
  deck.position.y = -0.3;
  scene.add(deck);
  const labels: Staged["labels"] = [];
  const bays: { light: Mesh; mat: MeshStandardMaterial; hinge: Group; glow: PointLight }[] = [];
  // four pods side by side along x, each lying lengthwise toward the camera. A bay's origin is the pod's
  // cavity floor; LIFT raises it so the cradle's base (1.809 below that floor) stands on the deck (Doug, 2026-11-04)
  const LIFT = BAY_LIFT;
  for (let i = 0; i < 4; i++) {
    const bay = new Group();
    bay.position.set((i - 1.5) * 4.6 * POD_K, LIFT, 0);
    bay.rotation.y = -Math.PI / 2;
    bay.scale.setScalar(POD_K);
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
    labels.push({ at: new Vector3((i - 1.5) * 4.6 * POD_K, 2.6 * POD_K + LIFT, 2.9 * POD_K), el });
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
      camera.position.set((-2 - 4.5 * k) * POD_K, (15 - 3.5 * k) * POD_K + LIFT, (10 - 2.6 * k) * POD_K);
      const look = new Vector3((-1.5 - 5.2 * k) * POD_K, 0.4 * POD_K + LIFT, 0.4 * POD_K);
      camera.lookAt(look);
      gameLens(camera, look);
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
    dispose() { disposeAll(scene); },
  };
}

/** Dispose every geometry and material under a scene. */
function disposeAll(scene: Scene): void {
  scene.traverse((m) => {
    const mesh = m as Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mt = mesh.material as Material | Material[] | undefined;
    if (Array.isArray(mt)) mt.forEach((x) => x.dispose()); else mt?.dispose();
  });
}

/** One character (the commander's model by default: the Halcyon EVA suit) with its own skeleton and its walk on a mixer. */
function crewFigure(id = "unit.player", clipKey = "walk"): { root: Object3D; mixer: AnimationMixer; height: number } | null {
  const e = meshyCharacters().find((x) => x.id === id), rig = e && meshyRig(e.file);
  if (!e || !rig) return null;
  const root = cloneSkinned(rig.scene);
  const mixer = new AnimationMixer(root);
  const walk = rig.clips.find((c) => c.name === e.clips?.[clipKey]);
  if (walk) mixer.clipAction(walk).play();
  return { root, mixer, height: (rig.scene.userData["height"] as number) || 1.7 };
}

/**
 * KILN's flight recorder, bay camera 05-08, four minutes before impact (docs/STORY-SCREENPLAY.md level 4): the four
 * sealed pods open from inside, four suited figures climb out, close and lock the empty pods, and walk away from the
 * camera, seen only from behind; the bay lights turn to OCCUPIED; static.
 */
function crashLog(doc: Document, o: LiveSceneOptions, overlay: HTMLElement): Staged {
  const scene = new Scene();
  scene.background = new Color("#05080a");
  const camera = new PerspectiveCamera(38, 1, 0.1, 1200);
  scene.add(new AmbientLight("#9fb4c8", 1.2));
  const key = new DirectionalLight("#dfe9f5", 2.0);
  key.position.set(-6, 12, 8);
  scene.add(key);
  const deck = new Mesh(new BoxGeometry(24, 0.6, 22), new MeshStandardMaterial({ color: "#3a4048", roughness: 0.8, metalness: 0.4 }));
  deck.position.set(0, -0.3, -5);
  scene.add(deck);
  // the same bays as empty_bays (pods lie along z, cavity floor LIFT above the deck), seen from behind their feet
  const LIFT = BAY_LIFT;
  const labels: Staged["labels"] = [];
  const bays: { mat: MeshStandardMaterial; hinge: Group; el: HTMLElement; fig: ReturnType<typeof crewFigure>; x: number; at: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * 4.6 * POD_K;
    const bay = new Group();
    bay.position.set(x, LIFT, 0);
    bay.rotation.y = -Math.PI / 2;
    bay.scale.setScalar(POD_K);
    const pod = meshyScene("decor.stasis_pod");
    if (pod) { pod.position.set(0.034, -1.809, -0.257); bay.add(pod); }
    const hinge = new Group();
    hinge.position.set(0, 0.1, 0.71);
    const glass = meshyScene("decor.stasis_glass");
    if (glass) { glass.position.z = -0.709; hinge.add(glass); }
    bay.add(hinge);
    const mat = new MeshStandardMaterial({ color: "#1a1a1a", emissive: "#ff4a3a", emissiveIntensity: 2 });
    const light = new Mesh(new BoxGeometry(0.5, 0.18, 0.12), mat);
    light.position.set(-1.75, 0.4, 0.95);
    bay.add(light);
    scene.add(bay);
    const fig = crewFigure();
    // the commander (bay 5) stands 1.98 m, the crew 1.8 m (characters.ts)
    if (fig) { fig.root.scale.setScalar((i === 0 ? SIZES.commander : SIZES.person) / fig.height); scene.add(fig.root); }
    const el = doc.createElement("div");
    el.className = "live-tag warn";
    overlay.append(el);
    labels.push({ at: new Vector3(x, 2.6 * POD_K + LIFT, 2.9 * POD_K), el });
    // each crew member a beat apart, so the four read as people rather than one copy
    bays.push({ mat, hinge, el, fig, x, at: i * 0.35 });
  }
  const stamp = doc.createElement("div");
  stamp.className = "live-stamp";
  stamp.textContent = o.text["impact"] ?? "";
  const noise = doc.createElement("i");
  noise.className = "live-static";
  overlay.append(stamp, noise);
  const SECONDS = 10.5;
  return {
    seconds: SECONDS,
    scene, camera, labels,
    pose(t) {
      // a fixed security camera high behind the pods' foot ends, looking down the deck
      // (high and far enough back that all four bays and their aisles fit a tall phone screen)
      const tall = camera.aspect < 0.8;
      camera.position.set(0, tall ? 14.5 : 11 * POD_K + LIFT, tall ? 20 : 13 * POD_K);
      const look = new Vector3(0, tall ? 0.2 : LIFT - 0.5 * POD_K, tall ? -3.5 : -3 * POD_K);
      camera.lookAt(look);
      gameLens(camera, look);
      for (const b of bays) {
        const s = t - b.at;
        // the glass lifts from inside (0.6-1.8), closes again once the pod is empty (4.4-5.4)
        b.hinge.rotation.x = 1.75 * (span(s, 0.6, 1.8) - span(s, 4.4, 5.4));
        const locked = s >= 5.5;
        b.mat.emissive.set(locked ? "#3cff7a" : "#ff4a3a");
        b.el.textContent = (locked ? o.text["occupied"] : o.text["unsealed"]) ?? "";
        b.el.classList.toggle("warn", !locked);
        const f = b.fig;
        if (!f) continue;
        // lying face up in the cavity (feet toward the deck's far end, head toward the camera), then sitting up and
        // stepping out sideways into the aisle on the pod's right (1.6-3.6)
        const up = span(s, 1.6, 2.8), out = span(s, 2.6, 3.6);
        // the walk away from the camera down that aisle (from 5.6), the clip running only while they walk
        const w = Math.max(0, s - 5.6);
        f.root.position.set(b.x + 2.3 * POD_K * out, (LIFT + 0.2 * POD_K) * (1 - out), -0.9 * (1 - up) - w * 1.3);
        f.root.rotation.set(-Math.PI / 2 * (1 - up), Math.PI, 0, "YXZ");
        f.mixer.setTime(w > 0 ? w : 0);
      }
      stamp.classList.toggle("on", t < 8.6);
      noise.classList.toggle("on", t >= 9.2);
    },
    dispose() { disposeAll(scene); },
  };
}

/** Turn bone `b` so its child `c` points along `dir` (world), keeping the rest of the chain. */
function aimBone(b: Object3D | undefined, c: Object3D | undefined, dir: Vector3): void {
  if (!b || !c || !b.parent) return;
  b.updateMatrixWorld(true);
  const from = b.getWorldPosition(new Vector3()), cur = c.getWorldPosition(new Vector3()).sub(from).normalize();
  const q = new Quaternion().setFromUnitVectors(cur, dir.clone().normalize());
  const parentInv = b.parent.getWorldQuaternion(new Quaternion()).invert();
  b.quaternion.copy(parentInv.multiply(q.multiply(b.getWorldQuaternion(new Quaternion()))));
  b.updateMatrixWorld(true);
}

/**
 * A right hand's palm: its middle and the way it faces, from the wrist and the index and pinky knuckles. `sign` (+1 or -1) is
 * the side that faces the body at rest (see palmSign), so the normal keeps meaning "palm side" in every pose.
 */
function palmOf(root: Object3D, sign: number): { at: Vector3; n: Vector3 } | null {
  const h = boneOf(root, "RightHand"), i = boneOf(root, "RightHandIndex1"), p = boneOf(root, "RightHandPinky1"), m = boneOf(root, "RightHandMiddle1");
  if (!h || !i || !p || !m) return null;
  root.updateMatrixWorld(true);
  const w = h.getWorldPosition(new Vector3()), a = i.getWorldPosition(new Vector3()).sub(w), b = p.getWorldPosition(new Vector3()).sub(w);
  return { at: w.clone().lerp(m.getWorldPosition(new Vector3()), 0.55), n: a.cross(b).normalize().multiplyScalar(sign) };
}
/** Which side of the right hand is the palm: at rest (arms down) it faces the body's midline. */
function palmSign(root: Object3D): number {
  const pm = palmOf(root, 1);
  if (!pm) return 1;
  return pm.n.dot(new Vector3(root.position.x, pm.at.y, root.position.z).sub(pm.at)) >= 0 ? 1 : -1;
}
/** Roll the forearm about its own axis until the palm faces up (a hand held out flat to receive or give). */
function palmUp(root: Object3D, sign: number): void {
  const pm = palmOf(root, sign), fa = boneOf(root, "RightForeArm"), h = boneOf(root, "RightHand");
  if (!pm || !fa || !h || !fa.parent) return;
  const axis = h.getWorldPosition(new Vector3()).sub(fa.getWorldPosition(new Vector3())).normalize();
  const flat = (v: Vector3): Vector3 => v.clone().sub(axis.clone().multiplyScalar(v.dot(axis))).normalize();
  const from = flat(pm.n), to = flat(new Vector3(0, 1, 0));
  const angle = Math.atan2(axis.dot(from.clone().cross(to)), from.dot(to));
  const q = new Quaternion().setFromAxisAngle(axis, angle);
  const parentInv = fa.parent.getWorldQuaternion(new Quaternion()).invert();
  fa.quaternion.copy(parentInv.multiply(q.multiply(fa.getWorldQuaternion(new Quaternion()))));
  fa.updateMatrixWorld(true);
}

/**
 * Sela's arrival (docs/STORY-SCREENPLAY.md level 3, Phase 2): at night a pair of headlights comes up the road out of
 * the dark, her buggy slows and parks at the camp's edge with its lights still on, and she climbs out with her lamp and
 * starts walking in. The level then follows her walk to the kiosk. A film look, not a camera feed.
 */
function selaArrival(_doc: Document, _o: LiveSceneOptions, _overlay: HTMLElement): Staged {
  const scene = new Scene();
  scene.background = new Color("#070a12");
  const camera = new PerspectiveCamera(38, 1, 0.1, 400);
  scene.add(new AmbientLight("#3d4a68", 1.6));
  const moon = new DirectionalLight("#a9bce0", 1.6);
  moon.position.set(-20, 30, 10);
  scene.add(moon);
  const sand = new Mesh(new PlaneGeometry(220, 220), new MeshStandardMaterial({ color: "#7a5f48", roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  const road = new Mesh(new PlaneGeometry(200, 3.4), new MeshStandardMaterial({ color: "#3f342c", roughness: 1 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(60, 0.01, 0);
  scene.add(sand, road);
  // stones along the road, placed by a fixed hash so every play is the same
  const stone = new MeshStandardMaterial({ color: "#4a3f36", roughness: 1 });
  for (let i = 0; i < 60; i++) {
    const h = (n: number): number => { const s = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return s - Math.floor(s); };
    // small and kept off the camera's foreground (the camera stands near z 11), so they read as scattered stones
    const r = new Mesh(new BoxGeometry(0.15 + h(1) * 0.4, 0.1 + h(2) * 0.25, 0.15 + h(3) * 0.35), stone);
    const side = h(4) < 0.5 ? -1 : 1;
    r.position.set(-12 + h(5) * 90, 0.05, side < 0 ? -(2.6 + h(6) * 12) : 2.6 + h(6) * 3.5);
    r.rotation.y = h(7) * 3;
    scene.add(r);
  }
  // the buggy as Doug sized it (2.64 m long; the build is 4.4 m), wheels on its rig, forward -x
  const K = SIZES.buggy.length / SIZES.buggy.buildLength;
  const buggy = new Group();
  const wheels: Object3D[] = [];
  const body = meshyScene("decor.buggy");
  if (body) { body.position.y = RIG.groundBelowBody; buggy.add(body); }
  for (const h of RIG.hubs) {
    const w = meshyScene(h.side);
    if (!w) continue;
    // a pivot at the hub, so the wheel rolls about its own axle
    const hub = new Group();
    hub.position.set(h.pos[0]!, RIG.groundBelowBody + h.pos[1]!, h.pos[2]!);
    w.position.y = -RIG.radius;
    hub.add(w);
    buggy.add(hub);
    wheels.push(hub);
  }
  buggy.scale.setScalar(K);
  scene.add(buggy);
  // two headlights at the front, aimed down the road ahead
  const lamps: SpotLight[] = [];
  for (const z of [-0.55, 0.55]) {
    const spot = new SpotLight("#fff2d6", 60, 40, 0.42, 0.5, 1.4);
    spot.position.set(-2.1, 1.0, z);
    spot.target.position.set(-12, 0, z * 2);
    buggy.add(spot, spot.target);
    lamps.push(spot);
    const bulb = new Mesh(new SphereGeometry(0.12, 10, 8), new MeshBasicMaterial({ color: "#fff6e0" }));
    bulb.position.copy(spot.position);
    buggy.add(bulb);
  }
  // Sela in her own dark blue suit (unit.customer_sela), 1.8 m, seated at the wheel until the buggy stops
  const sela = crewFigure("unit.customer_sela") ?? crewFigure("unit.customer");
  const PERSON = SIZES.person;
  const seated = new Map<Object3D, Quaternion>(), standing = new Map<Object3D, Quaternion>();
  let hip = new Vector3(0, 0.9, 0), standHip = new Vector3(0, 0.9, 0);
  const lamp = new PointLight("#ffc27a", 0, 7, 1.6);
  scene.add(lamp);
  if (sela) {
    sela.root.scale.setScalar(PERSON / sela.height);
    scene.add(sela.root);
    // seated pose in the model frame (it faces +z): thighs forward, shins down, hands out to the wheel
    const bone = (n: string): Object3D | undefined => sela.root.getObjectByName(`mixamorig${n}`) ?? sela.root.getObjectByName(`mixamorig:${n}`);
    sela.mixer.setTime(0);
    sela.root.updateMatrixWorld(true);
    // the standing pose (the walk's first frame) she rises into
    sela.root.traverse((b) => { if ((b as { isBone?: boolean }).isBone) standing.set(b, b.quaternion.clone()); });
    {
      const l = bone("LeftUpLeg"), r = bone("RightUpLeg");
      if (l && r) standHip = l.getWorldPosition(new Vector3()).add(r.getWorldPosition(new Vector3())).multiplyScalar(0.5).divide(sela.root.scale);
    }
    for (const sd of ["Left", "Right"]) {
      aimBone(bone(`${sd}UpLeg`), bone(`${sd}Leg`), new Vector3(0, -0.03, 1));
      aimBone(bone(`${sd}Leg`), bone(`${sd}Foot`), new Vector3(0, -1, 0.2));
      aimBone(bone(`${sd}Arm`), bone(`${sd}ForeArm`), new Vector3(0, -1, 0.35));
      aimBone(bone(`${sd}ForeArm`), bone(`${sd}Hand`), new Vector3(0, -0.35, 1));
    }
    sela.root.traverse((b) => { if ((b as { isBone?: boolean }).isBone) seated.set(b, b.quaternion.clone()); });
    const l = bone("LeftUpLeg"), r = bone("RightUpLeg");
    if (l && r) hip = l.getWorldPosition(new Vector3()).add(r.getWorldPosition(new Vector3())).multiplyScalar(0.5).divide(sela.root.scale);
  }
  // timeline (s): the drive in, eased to a stop at x = 0; she climbs out on the camera's side and walks toward the camp
  // Doug 2026-11-09: the film now ends BEFORE the buggy parks, long before she gets out (SECONDS is cut at 3.0, OUT0 and later are
  // never reached). The drive in, the parking and her stepping out are shown in play by the story `vehicle` action.
  const STOP = 4.2, OUT0 = 4.8, OUT1 = 5.9, SECONDS = 3.0, FROM = 70;
  const driveX = (t: number): number => FROM * (1 - ease(Math.min(1, t / STOP)) ** 0.6);
  const up = new Vector3(0, 1, 0);
  return {
    seconds: SECONDS,
    scene, camera, labels: [],
    pose(t) {
      const x = driveX(t);
      buggy.position.set(x, 0, 0);
      // the wheels roll by the distance driven (forward -x turns them +z)
      for (const w of wheels) w.rotation.z = (FROM - x) / (RIG.radius * K);
      for (const s of lamps) s.intensity = 60 * Math.min(1, t / 0.6);
      // a low camera at the camp's edge: it finds the lights far off, then settles back from the parked buggy so it
      // and Sela's walk stay in frame (farther back on a tall phone screen)
      const k = ease(t / STOP), tall = camera.aspect < 0.8;
      camera.position.set(tall ? -11 + 1.5 * k : -7 + 2 * k, (tall ? 2.2 : 1.6) + 0.8 * k, tall ? 12 - 1 * k : 7.5 - 1.5 * k);
      camera.lookAt(x * 0.85 - 0.8, 0.8, 0.5);
      if (!sela) return;
      const s = sela.root.scale.x;
      // her hips: on the seat, then in an arc up over the side and down to standing height beside the door
      const seatHip = new Vector3(x + 0.3 * K, 1.4 * K + 0.073 * PERSON, 0);
      const doorHip = new Vector3(x + 0.15, standHip.y * s, 1.3);
      if (t < OUT1) {
        // the climb out (OUT0-OUT1): every bone eases from the seated pose to the standing one while the hips travel,
        // and she turns from facing ahead to facing the door
        const k = span(t, OUT0, OUT1);
        for (const [b, q] of seated) b.quaternion.slerpQuaternions(q, standing.get(b) ?? q, k);
        const hipW = new Vector3().lerpVectors(seatHip, doorHip, k);
        hipW.y += 0.35 * Math.sin(Math.PI * Math.min(1, k * 1.15));
        const yaw = -Math.PI / 2 + (Math.PI / 2) * Math.sin(Math.PI * k) * 0.6;
        const hipM = new Vector3().lerpVectors(hip, standHip, k).multiplyScalar(s).applyAxisAngle(up, yaw);
        sela.root.position.copy(hipW.sub(hipM));
        sela.root.rotation.set(0, yaw, 0);
      } else {
        // standing beside the door, she turns toward camp and walks (toward the camera's left)
        const w = t - OUT1, turn = span(t, OUT1, OUT1 + 0.5);
        sela.mixer.setTime(w);
        const base = doorHip.clone().sub(standHip.clone().multiplyScalar(s).applyAxisAngle(up, -Math.PI / 2));
        sela.root.position.copy(base).add(new Vector3(-w * 1.25, 0, w * 0.35));
        sela.root.rotation.set(0, -Math.PI / 2 + 0.27 * turn, 0);
      }
      // her lamp, warm, at hand height on the camera's side
      lamp.intensity = 3 * span(t, OUT0 - 0.3, OUT1);
      lamp.position.copy(sela.root.position).add(new Vector3(0, 1.0, 0.35));
    },
    dispose() { disposeAll(scene); },
  };
}

/** A character's bone by its mixamo name (with or without the colon the loader may strip). */
const boneOf = (root: Object3D, n: string): Object3D | undefined => root.getObjectByName(`mixamorig${n}`) ?? root.getObjectByName(`mixamorig:${n}`);
/** Every bone's rotation now, to blend between poses. */
function poseOf(root: Object3D): Map<Object3D, Quaternion> {
  const m = new Map<Object3D, Quaternion>();
  root.traverse((b) => { if ((b as { isBone?: boolean }).isBone) m.set(b, b.quaternion.clone()); });
  return m;
}
function blendPose(a: Map<Object3D, Quaternion>, b: Map<Object3D, Quaternion>, k: number): void {
  for (const [bone, q] of a) bone.quaternion.slerpQuaternions(q, b.get(bone) ?? q, k);
}

/**
 * The Halcyon chip (docs/STORY-SCREENPLAY.md level 3, Doug 2026-11-04): by the kiosk at night Sela holds out a worn
 * coin on her palm, the commander reaches and takes it, and the camera closes on the chip and its stamped H.
 */
function chipHandoff(_doc: Document, _o: LiveSceneOptions, _overlay: HTMLElement): Staged {
  const scene = new Scene();
  scene.background = new Color("#070a12");
  const camera = new PerspectiveCamera(32, 1, 0.05, 200);
  scene.add(new AmbientLight("#4a5878", 1.7));
  const moon = new DirectionalLight("#b9caf0", 2.3);
  moon.position.set(-10, 20, 8);
  // a warm rim from the other side so both suits keep their outline against the dark
  const rim = new DirectionalLight("#ffb070", 1.4);
  rim.position.set(8, 6, -10);
  scene.add(rim);
  // the kiosk's warm lamp from behind Sela, so the coin catches it
  const lamp = new PointLight("#ffc27a", 9, 9, 1.4);
  lamp.position.set(1.6, 2.4, -1.2);
  const sand = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: "#7a5f48", roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  scene.add(moon, lamp, sand);
  // the 2048-texture builds of the same Meshy models (meshy.json *.hi, unwired): this scene is close on two faces, so the game's 512 ones look blurred
  const sela = crewFigure("unit.customer_sela.hi") ?? crewFigure("unit.customer_sela") ?? crewFigure("unit.customer"), cmd = crewFigure("unit.player.hi") ?? crewFigure("unit.player");
  // Sela at x +0.6 facing -x, the commander at x -0.6 facing +x: an arm's length apart, side on to the camera
  const signs = new Map<Object3D, number>();
  const place = (f: NonNullable<ReturnType<typeof crewFigure>>, h: number, x: number, yaw: number): void => {
    f.root.scale.setScalar(h / f.height);
    f.root.position.set(x, 0, 0);
    f.root.rotation.set(0, yaw, 0);
    f.mixer.setTime(0);
    scene.add(f.root);
    f.root.updateMatrixWorld(true);
    signs.set(f.root, palmSign(f.root));
  };
  // each figure's rest pose and the pose with the right arm out (palm toward the other), blended over time
  const reach = (f: NonNullable<ReturnType<typeof crewFigure>>, toward: number): { rest: Map<Object3D, Quaternion>; out: Map<Object3D, Quaternion> } => {
    const rest = poseOf(f.root);
    aimBone(boneOf(f.root, "RightArm"), boneOf(f.root, "RightForeArm"), new Vector3(toward * 0.75, -0.55, 0.12));
    aimBone(boneOf(f.root, "RightForeArm"), boneOf(f.root, "RightHand"), new Vector3(toward, -0.05, 0.05));
    palmUp(f.root, signs.get(f.root) ?? 1);
    const out = poseOf(f.root);
    blendPose(rest, rest, 0);
    return { rest, out };
  };
  let sp: ReturnType<typeof reach> | null = null, cp: ReturnType<typeof reach> | null = null;
  let look: Map<Object3D, Quaternion> | null = null;
  if (sela) { place(sela, 1.8, 0.62, -Math.PI / 2); sp = reach(sela, -1); }
  if (cmd) {
    place(cmd, SIZES.commander, -0.62, Math.PI / 2); cp = reach(cmd, 1);
    // and with the hand brought up in front of the chest, palm up, to look at the chip
    blendPose(cp.rest, cp.rest, 0);
    aimBone(boneOf(cmd.root, "RightArm"), boneOf(cmd.root, "RightForeArm"), new Vector3(0.35, -0.85, 0.25));
    aimBone(boneOf(cmd.root, "RightForeArm"), boneOf(cmd.root, "RightHand"), new Vector3(0.9, 0.2, 0.25));
    palmUp(cmd.root, signs.get(cmd.root) ?? 1);
    look = poseOf(cmd.root);
    blendPose(cp.rest, cp.rest, 0);
  }
  // the chip: the game's own currency model, at a real coin's size
  const coin = meshyScene("res.currency.hi") ?? meshyScene("res.currency") ?? new Mesh(new SphereGeometry(0.02, 12, 8), new MeshStandardMaterial({ color: "#c9a24a", metalness: 0.8 }));
  // a big chip (6 cm) so it reads on a phone, with its own small warm light so the stamped H catches it
  coin.scale.multiplyScalar(0.06 / 0.3);
  const glint = new PointLight("#ffd9a0", 1.6, 0.8, 1.2);
  scene.add(coin, glint);
  // the middle of the palm: part way from the wrist to the middle finger's knuckle, a little above the hand
  const handPos = (f: ReturnType<typeof crewFigure>): Vector3 => {
    const h = f && boneOf(f.root, "RightHand"), m = f && boneOf(f.root, "RightHandMiddle1");
    if (!f || !h) return new Vector3(0, 1.1, 0);
    f.root.updateMatrixWorld(true);
    const w = h.getWorldPosition(new Vector3());
    return m ? w.lerp(m.getWorldPosition(new Vector3()), 0.7) : w;
  };
  const SECONDS = 6.4, GIVE = 0.6, MEET = 2.4, TAKE = 3.0, BACK = 4.0;
  return {
    seconds: SECONDS,
    scene, camera, labels: [],
    pose(t) {
      // Sela's arm goes out first; the commander reaches to meet it, takes the chip, and draws it in to look at it
      if (sela && sp) blendPose(sp.rest, sp.out, span(t, GIVE, MEET) - span(t, TAKE + 0.3, BACK + 0.4));
      // the commander reaches, takes it, then brings the hand up to chest height to look at it
      const up = span(t, TAKE + 0.4, BACK + 0.5);
      if (cmd && cp) {
        blendPose(cp.rest, cp.out, span(t, MEET - 0.9, TAKE));
        if (look && up > 0) { const outNow = poseOf(cmd.root); blendPose(outNow, look, up); }
      }
      // the chip sits on the giver's palm, then in the taker's hand wherever it goes
      const giver = t < TAKE ? sela : cmd, pm = giver && palmOf(giver.root, signs.get(giver.root) ?? 1);
      // lying in the open palm (a hair above it), flat against it; as it is lifted it tilts toward the camera
      if (pm) coin.position.copy(pm.at).addScaledVector(pm.n, 0.05); else coin.position.copy(handPos(giver ?? null));
      const lifted = coin.position.clone();
      glint.position.copy(coin.position).add(new Vector3(0, 0.15, 0.25));
      // a two-shot that pushes in on the hands, then a medium close on the chip held up, the commander behind it
      // (not so close that the game's low-poly models break up)
      const k = span(t, 0, MEET + 0.4), z = span(t, TAKE + 0.4, SECONDS - 0.5);
      const tall = camera.aspect < 0.8;
      const wide = new Vector3(0, 1.5, tall ? 5.2 : 3.4), near = new Vector3(0, 1.25, tall ? 2.4 : 1.8);
      camera.position.lerpVectors(wide, near, k).lerp(lifted.clone().add(new Vector3(0.12, 0.04, tall ? 0.85 : 0.65)), z);
      camera.lookAt(new Vector3(0, 1.3, 0).lerp(coin.position, Math.max(k * 0.6, z)));
      // flat in the palm, then turned so its face (the stamped H) looks at the camera as it is lifted
      const flat = pm ? new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), pm.n) : new Quaternion();
      const face = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), camera.position.clone().sub(coin.position).normalize());
      coin.quaternion.slerpQuaternions(flat, face, 0.45 * Math.max(span(t, GIVE, MEET), up));
    },
    dispose() { disposeAll(scene); },
  };
}

/** How far the game's ground runs round the scene (metres), and where its fog starts and closes (metres from the origin). */
const LOOK_GROUND_M = 110, LOOK_FOG = [24, 100] as const;

/**
 * The game's own set at this moment (o.look): its sand, pebbles, fog and light, so the scene cuts back to play with no
 * change of ground or colour. The sun shines from the game's direction and casts shadows over the middle of the set.
 */
function gameSet(scene: Scene, look: LiveLook): void {
  scene.background = new Color(look.fog);
  scene.fog = new Fog(look.fog, LOOK_FOG[0], LOOK_FOG[1]);
  scene.add(new HemisphereLight(look.hemi.sky, look.hemi.ground, look.hemi.intensity));
  const sun = new DirectionalLight(look.sun.color, look.sun.intensity);
  sun.position.set(...SUN_OFS).normalize().multiplyScalar(30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 80 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const ground = lookGround(look, LOOK_GROUND_M * ART_M);
  ground.scale.setScalar(1 / ART_M);
  scene.add(ground);
}

/** A dawn set for the level 5 endings: warm low sun on pale sand (the fall scene without the game's look, e.g. dev). */
function dawnSet(scene: Scene): void {
  scene.background = new Color("#e9b88a");
  scene.add(new AmbientLight("#ffd9b8", 1.5));
  const sun = new DirectionalLight("#ffc690", 2.4);
  sun.position.set(14, 7, 6);
  scene.add(sun);
  // a disc, so the closing camera turn (45 degrees) never shows a corner on the horizon
  const sand = new Mesh(new CircleGeometry(300, 64), new MeshStandardMaterial({ color: "#a98660", roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  scene.add(sand);
  const stone = new MeshStandardMaterial({ color: "#7d6248", roughness: 1 });
  for (let i = 0; i < 40; i++) {
    const h = (n: number): number => { const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
    const r = new Mesh(new BoxGeometry(0.15 + h(1) * 0.4, 0.1 + h(2) * 0.25, 0.15 + h(3) * 0.35), stone);
    r.position.set(-14 + h(5) * 28, 0.05, -6 + h(6) * 4 - 1);
    r.rotation.y = h(7) * 3;
    scene.add(r);
  }
}

/** The dropped helmet: the item's own model, or a plain dome when it is missing. */
function helmetModel(): Object3D {
  return meshyScene("item.lieutenant_helmet") ?? new Mesh(new SphereGeometry(0.22, 12, 8), new MeshStandardMaterial({ color: "#222" }));
}

/**
 * The warlord's fall (docs/STORY-SCREENPLAY.md level 5, S32; BACKLOG #6, motion Doug approved 2026-11-07 as stick
 * figures, tools/cinematics/vale_fall_stick.py): Vale, in the warlord's suit and black helmet, comes on firing; one
 * shot strikes, then the last one throws Vale straight back off the feet onto the back. The helmet comes off as the
 * head meets the sand and rolls clear. Vale rolls over, gets up and starts to run east (screen right); the run itself
 * is in play (the story `swap` action), so the scene ends on the first strides. Side-on camera, no close-up.
 * The motion is the `fall` clip baked onto Vale's rig (tools/cinematics/vale_fall_bake.py). Without the Vale models it
 * falls back to the old warlord running through, whose helmet is its head.
 */
function warlordFall(_doc: Document, o: LiveSceneOptions, _overlay: HTMLElement): Staged {
  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 400);
  if (o.look) gameSet(scene, o.look);
  else dawnSet(scene);
  const H = 2.2; // the warlord's height in scene units
  const e = meshyCharacters().find((x) => x.id === "hostile.boss_vale"), rig = e && meshyRig(e.file);
  const face = meshyScene("item.vale_head");
  const fallClip = rig?.clips.find((c) => c.name === e?.clips?.["fall"]);
  const fireClip = rig?.clips.find((c) => c.name === e?.clips?.["shootMove"]);
  const vale = rig && face && fallClip ? crewFigure("hostile.boss_vale", "shootMove") : null;
  const boss = vale ?? crewFigure("hostile.boss", "run");
  const root = boss?.root;
  const K = boss ? H / boss.height : 1;
  if (root) { root.scale.setScalar(K); scene.add(root); }
  const fall = vale && fallClip ? vale.mixer.clipAction(fallClip) : undefined;
  const fire = vale && fireClip ? vale.mixer.existingAction(fireClip) : undefined;
  if (fall) { fall.clampWhenFinished = true; fall.setLoop(LoopOnce, 1); }
  const helmet = helmetModel();
  scene.add(helmet);
  // Vale's head rides the Head bone, turned by the rig's own head markers: up from Head to HeadTop_End, forward toward
  // the headfront bone (the bust and the helmet stand along +y and face +z). A turn taken from the bind pose instead
  // tipped both about 55 degrees forward, so the worn helmet sat crooked (Doug, 2026-11-07).
  const headBone = vale && face ? boneOf(vale.root, "Head") : undefined;
  const headTopBone = vale ? boneOf(vale.root, "HeadTop_End") : undefined, headFront = vale?.root.getObjectByName("headfront");
  const w1 = new Vector3(), w2 = new Vector3(), fwd = new Vector3(), side = new Vector3(), basis = new Matrix4();
  const headBox = new Box3();
  let headRest = new Quaternion(), headUp = 0, headH = 0;
  const q = new Quaternion(), v = new Vector3(), up = new Vector3();
  if (face && headBone && root) {
    root.updateMatrixWorld(true);
    headBox.setFromObject(face);
    const s = (H * VALE_HEAD) / Math.max(1e-6, headBox.max.y - headBox.min.y);
    face.scale.setScalar(s);
    headH = (headBox.max.y - headBox.min.y) * s;
    headUp = -headH * VALE_NECK;
    headRest = headBone.getWorldQuaternion(new Quaternion()).invert().multiply(root.getWorldQuaternion(new Quaternion()));
    scene.add(face);
  }
  // the helmet item is built lying on its side as dropped, its neck opening facing +z. Worn, a quarter turn about its
  // x axis points the opening down (Doug, 2026-11-07: upright on the head) and the opening's centre sits on the neck.
  // Dropped, it comes to rest as built, as the helmet lies in play. Sized to the head across its width (x).
  const helmBox = new Box3().setFromObject(helmet), helmW = Math.max(1e-6, helmBox.max.x - helmBox.min.x);
  const headW = face ? (headBox.max.x - headBox.min.x) * face.scale.x : 0;
  const helmK = headW ? (headW * VALE_HELMET) / helmW : 1;
  helmet.scale.setScalar(helmK);
  const X_AXIS = new Vector3(1, 0, 0), Y_AXIS = new Vector3(0, 1, 0);
  const helmFit = new Quaternion().setFromAxisAngle(Y_AXIS, VALE_HELMET_YAW).multiply(new Quaternion().setFromAxisAngle(X_AXIS, VALE_HELMET_TIP));
  const HC = helmBox.getCenter(new Vector3()).multiplyScalar(helmK); // its middle, in its own (scaled) frame
  const NECK = new Vector3(HC.x, HC.y, helmBox.max.z * helmK); // the neck opening's centre
  const HELM_REST = new Quaternion().setFromAxisAngle(Y_AXIS, -0.6); // at rest, turned a little toward the camera
  // shots: a flash on the chest at each hit; the last one is the strike that starts the fall
  const flash = new Mesh(new SphereGeometry(0.12, 8, 6), new MeshBasicMaterial({ color: "#fff2c0" }));
  const flashLight = new PointLight("#ffd27a", 0, 4);
  scene.add(flash, flashLight);
  // timeline (s): firing as it comes on, one hit, the strike (the fall clip's frame 0), the clip to its end
  const STRIKE = 0.9, SHOTS = [0.45, STRIKE], X0 = 0.6; // X0: where the strike lands (the clip starts over its root)
  const FALL = fallClip?.duration ?? 0, SECONDS = vale ? STRIKE + FALL : 4.0;
  // when the head first meets the sand: sample the clip once, here
  let OFF = STRIKE + 0.85;
  const hipsBone = root ? boneOf(root, "Hips") : undefined, hipsAt = new Vector3(X0, 0, 0);
  if (fall && headBone && root) {
    fall.play();
    root.position.set(X0, 0, 0);
    vale!.mixer.setTime(0);
    root.updateMatrixWorld(true);
    hipsBone?.getWorldPosition(hipsAt); // where the strike finds the hips: the lead-in walks them there
    // the head's height through the fall, sampled at 60 fps
    const ys: number[] = [];
    for (let tt = 0; tt < Math.min(FALL, 2.5); tt += 1 / 60) {
      vale!.mixer.setTime(tt);
      root.updateMatrixWorld(true);
      ys.push(headBone.getWorldPosition(v).y);
    }
    // contact: once the head has dropped below 40% of its standing height, the first frame it stops falling
    let hit = ys.findIndex((y) => y < ys[0]! * 0.4);
    while (hit >= 0 && hit + 1 < ys.length && ys[hit + 1]! < ys[hit]! - 0.002) hit++;
    if (hit >= 0) OFF = STRIKE + hit / 60;
    fall.stop();
  }
  // the gun stays in Vale's right hand through the whole fall (Doug), placed as in play (meshy.json held, align gun)
  if (vale && e && rig) {
    const ms = boss!.height / (e.height ?? 1.1);
    for (const h of e.held?.["*"] ?? []) {
      if (h.align !== "gun") continue;
      const gun = meshyScene(h.prop), hand = boneOf(vale.root, "RightHand");
      if (!gun || !hand) continue;
      root!.position.set(0, 0, 0); root!.rotation.set(0, 0, 0); root!.scale.setScalar(1);
      root!.updateMatrixWorld(true);
      heldInHand(root!, vale.mixer, h, ms, rig.clips).decompose(gun.position, gun.quaternion, gun.scale);
      hand.add(gun);
      root!.scale.setScalar(K);
    }
  }
  let helmFrom: Vector3 | undefined, helmTo: Vector3 | undefined;
  const helmQ0 = new Quaternion();
  return {
    seconds: SECONDS, scene, camera, labels: [],
    pose(t) {
      const tall = camera.aspect < 0.8;
      if (root && vale && fall) {
        if (t < STRIKE) {
          // coming on from the right, facing west, firing
          // (the firing clip travels as it loops, so the root is set to walk the hips along a steady line)
          root.rotation.y = -Math.PI / 2;
          root.position.set(0, 0, 0);
          fall.stop();
          if (fire) { fire.play(); fire.weight = 1; }
          vale.mixer.setTime(t);
          root.updateMatrixWorld(true);
          const h = hipsBone ? hipsBone.getWorldPosition(v) : v.set(0, 0, 0);
          root.position.set(hipsAt.x + 0.9 * (STRIKE - t) - h.x, 0, hipsAt.z - h.z);
        } else {
          // the fall clip carries its own turn and travel (root motion in the hips)
          root.rotation.y = 0;
          root.position.set(X0, 0, 0);
          fire?.stop();
          fall.play();
          vale.mixer.setTime(t - STRIKE);
        }
      } else if (root && boss) {
        root.rotation.y = Math.PI / 2;
        root.position.set(-3 + 2.2 * t, 0, 0);
        boss.mixer.setTime(t);
      }
      root?.updateMatrixWorld(true);
      // the head follows the Head bone; the worn helmet sits square over it
      let headTop = new Vector3(X0, H, 0);
      if (face && headBone) {
        headBone.getWorldPosition(v);
        if (headTopBone && headFront) {
          up.copy(headTopBone.getWorldPosition(w1)).sub(v).normalize();
          fwd.copy(headFront.getWorldPosition(w2)).sub(v);
          fwd.addScaledVector(up, -fwd.dot(up)).normalize();
          side.crossVectors(up, fwd);
          q.setFromRotationMatrix(basis.makeBasis(side, up, fwd));
        } else {
          headBone.getWorldQuaternion(q).multiply(headRest);
          up.set(0, 1, 0).applyQuaternion(q);
        }
        face.quaternion.copy(q);
        face.position.copy(v).addScaledVector(up, headUp);
        headTop = face.position.clone().addScaledVector(up, headH * VALE_HELMET_AT);
      }
      const hips = root ? (boneOf(root, "Hips")?.getWorldPosition(new Vector3()) ?? root.position) : new Vector3();
      const chest = new Vector3(hips.x, hips.y + H * 0.17, hips.z + 0.25);
      const shot = SHOTS.find((s) => t >= s && t < s + 0.09);
      flash.visible = shot !== undefined;
      flash.position.copy(chest);
      flashLight.position.copy(chest);
      flashLight.intensity = shot !== undefined ? 6 : 0;
      // the helmet: worn until the head meets the sand, then it pops off and rolls toward the camera and stops
      if (!face) helmet.visible = false;
      else if (t < OFF) {
        helmet.visible = true;
        helmet.quaternion.copy(q).multiply(helmFit);
        helmet.position.copy(headTop).sub(v.copy(NECK).applyQuaternion(helmet.quaternion));
        helmFrom = undefined;
      } else {
        // it jumps off the head on impact, tumbles once toward the camera with two bounces, and comes to rest on its
        // side in about 0.7 s; it turns about its middle (HC)
        if (!helmFrom) {
          helmQ0.copy(q).multiply(helmFit); // where it sits on the head this frame
          helmFrom = headTop.clone().add(v.copy(HC).sub(NECK).applyQuaternion(helmQ0));
          helmTo = new Vector3(headTop.x + 0.6, HC.y, headTop.z + 0.6); // past the head, clear of the arm and legs as Vale gets up
        }
        const d = t - OFF, k = Math.min(1, d / 0.7), ek = 1 - (1 - k) ** 3;
        const hop = 0.3 * Math.abs(Math.sin(Math.min(d, 0.7) * 9)) * Math.exp(-d * 4);
        const mid = new Vector3().lerpVectors(helmFrom, helmTo!, ek);
        mid.y += hop;
        helmet.quaternion.slerpQuaternions(helmQ0, HELM_REST, ek).premultiply(q.setFromAxisAngle(X_AXIS, ek * Math.PI * 2));
        helmet.position.copy(mid).sub(v.copy(HC).applyQuaternion(helmet.quaternion));
      }
      // camera: side-on and steady, framed on the fall spot; as Vale gets up and runs it eases right, pulls back and
      // rises toward the game's own view (30 degrees down, turned 45 degrees), so the cut back to play is a small step
      // (Doug, 2026-11-08)
      const out = span(t, SECONDS - CAM_OUT, SECONDS);
      const cx = hipsAt.x + 0.5 + 0.3 * span(t, SECONDS - 1.6, SECONDS);
      const lookY = (tall ? 0.85 : 0.8) * (1 - out) + 0.6 * out;
      const d0 = tall ? 6.8 : 4.6, y0 = (tall ? 1.6 : 1.3) - lookY;
      const dist = Math.hypot(d0, y0) * (1 + (CAM_BACK - 1) * out);
      const pitch = Math.atan2(y0, d0) * (1 - out) + CAM_PITCH * out, yaw = CAM_YAW * out;
      camera.position.set(cx + Math.sin(yaw) * Math.cos(pitch) * dist, lookY + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
      camera.lookAt(cx, lookY, 0);
    },
    // the models (and the gun in Vale's hand) share their GPU data with the game, which is drawing Vale again as this
    // closes: take them out first, so only the set is disposed
    dispose() { root?.removeFromParent(); face?.removeFromParent(); helmet.removeFromParent(); disposeAll(scene); },
  };
}
/**
 * Vale's head (crop of the bust, chin to crown plus the neck) as a share of the warlord's height (its suit without a
 * head). Sizes are capped against the old warlord's grey helmet (Doug, 2026-11-08: head and helmet at most 20% bigger).
 * In play units the grey helmet is 0.113 wide, 0.172 tall and 0.176 deep. The black helmet is the cap: 0.136 x 0.193 x
 * 0.178 (1.2x the width). Its shell is thick, so the head inside it is 0.091 x 0.145 (with its neck) x 0.133, about 0.8x
 * the grey helmet; the same size in play (meshy.json held, scale 0.63), so the head the helmet leaves is the one that runs.
 */
const VALE_HEAD = 0.132;
/** How far the head sinks below the Head bone into the neck ring, as a share of the head's height. */
const VALE_NECK = 0.25;
/** The worn helmet's width against the head's width (1.5: 1.2x the grey helmet's), and how high on the head its neck opening sits (crown covered). */
const VALE_HELMET = 1.5, VALE_HELMET_AT = 0.1;
/** The helmet's turn about the head's up axis so its visor faces the way the face does. */
const VALE_HELMET_YAW = 0;
/** The closing move: over the last CAM_OUT seconds the camera backs off CAM_BACK times and turns to the game's angles. */
const CAM_OUT = 2.0, CAM_BACK = 3.6, CAM_PITCH = (PITCH_DEG * Math.PI) / 180, CAM_YAW = (YAW_DEG * Math.PI) / 180;
/** The quarter turn that stands the helmet item (built lying on its side) upright on the head. */
const VALE_HELMET_TIP = Math.PI / 2;

const SCENES: Readonly<Record<string, { models: readonly string[]; stage: (doc: Document, o: LiveSceneOptions, overlay: HTMLElement) => Staged; film?: boolean; game?: boolean }>> = {
  chip_handoff: { models: ["unit.customer_sela.hi", "unit.player.hi", "res.currency.hi", "unit.customer_sela", "unit.customer", "unit.player", "res.currency"], stage: chipHandoff, film: true },
  sela_arrival: { models: ["decor.buggy", "decor.buggy_wheel", "decor.buggy_wheel_l", "unit.customer_sela", "unit.customer"], stage: selaArrival, film: true },
  warlord_fall: { models: ["hostile.boss_vale", "item.vale_head", "hostile.boss", "item.lieutenant_helmet", "prop.minigun"], stage: warlordFall, film: true, game: true },
  empty_bays: { models: ["decor.stasis_pod", "decor.stasis_glass"], stage: emptyBays },
  crash_log: { models: ["decor.stasis_pod", "decor.stasis_glass", "unit.player"], stage: crashLog },
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
  // on the game's own set: draw it the way the game does (tone mapping, exposure, sun shadows from everything standing)
  if (def.game && o.look) {
    gl.toneMapping = ACESFilmicToneMapping;
    gl.toneMappingExposure = o.look.exposure;
    gl.shadowMap.enabled = true;
    staged.scene.traverse((x) => { if ((x as Mesh).isMesh && !x.parent?.name.startsWith("lookGround")) x.castShadow = true; });
  }
  // a film-look scene drops the camera-feed filter, scanlines and REC readout
  if (def.film) wrap.classList.add("film");
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
