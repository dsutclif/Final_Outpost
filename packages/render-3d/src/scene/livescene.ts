import {
  AmbientLight, AnimationMixer, BoxGeometry, Color, DirectionalLight, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera,
  PlaneGeometry, PointLight, Quaternion, Scene, SphereGeometry, SpotLight, Vector3, WebGLRenderer, type Material, type Object3D,
} from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadMeshy, meshyCharacters, meshyRig, meshyScene } from "../assets/meshy.js";
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

/** The bay scenes' pods at Doug's decor size, 2.66 m (docs/SCALE.md); their build is 3.9847 m long. */
const POD_K = 2.66 / 3.9847;
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
  // four pods side by side along x, each lying lengthwise toward the camera. A bay's origin is the pod's
  // cavity floor; LIFT raises it so the cradle's base (1.809 below that floor) stands on the deck (Doug, 2026-11-04)
  const LIFT = 1.809 * POD_K;
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
      camera.lookAt((-1.5 - 5.2 * k) * POD_K, 0.4 * POD_K + LIFT, 0.4 * POD_K);
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
function crewFigure(id = "unit.player"): { root: Object3D; mixer: AnimationMixer; height: number } | null {
  const e = meshyCharacters().find((x) => x.id === id), rig = e && meshyRig(e.file);
  if (!e || !rig) return null;
  const root = cloneSkinned(rig.scene);
  const mixer = new AnimationMixer(root);
  const walk = rig.clips.find((c) => c.name === e.clips?.["walk"]);
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
  const camera = new PerspectiveCamera(38, 1, 0.1, 200);
  scene.add(new AmbientLight("#9fb4c8", 1.2));
  const key = new DirectionalLight("#dfe9f5", 2.0);
  key.position.set(-6, 12, 8);
  scene.add(key);
  const deck = new Mesh(new BoxGeometry(24, 0.6, 22), new MeshStandardMaterial({ color: "#3a4048", roughness: 0.8, metalness: 0.4 }));
  deck.position.set(0, -0.3, -5);
  scene.add(deck);
  // the same bays as empty_bays (pods lie along z, cavity floor LIFT above the deck), seen from behind their feet
  const LIFT = 1.809 * POD_K, PERSON = 1.8;
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
    if (fig) { fig.root.scale.setScalar(PERSON / fig.height); scene.add(fig.root); }
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
      camera.position.set(0, (tall ? 25 : 11) * POD_K + LIFT, (tall ? 31 : 13) * POD_K);
      camera.lookAt(0, LIFT - 0.5 * POD_K, (tall ? -5 : -3) * POD_K);
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
  const K = 2.64 / 4.4;
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
  const PERSON = 1.8;
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
  const STOP = 4.2, OUT0 = 4.8, OUT1 = 5.9, SECONDS = 8.6, FROM = 70;
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
  scene.add(new AmbientLight("#3d4a68", 1.4));
  const moon = new DirectionalLight("#a9bce0", 1.1);
  moon.position.set(-10, 20, 8);
  // the kiosk's warm lamp from behind Sela, so the coin catches it
  const lamp = new PointLight("#ffc27a", 9, 9, 1.4);
  lamp.position.set(1.6, 2.4, -1.2);
  const sand = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: "#7a5f48", roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  scene.add(moon, lamp, sand);
  const sela = crewFigure("unit.customer_sela") ?? crewFigure("unit.customer"), cmd = crewFigure("unit.player");
  // Sela at x +0.6 facing -x, the commander at x -0.6 facing +x: an arm's length apart, side on to the camera
  const place = (f: NonNullable<ReturnType<typeof crewFigure>>, h: number, x: number, yaw: number): void => {
    f.root.scale.setScalar(h / f.height);
    f.root.position.set(x, 0, 0);
    f.root.rotation.set(0, yaw, 0);
    f.mixer.setTime(0);
    scene.add(f.root);
    f.root.updateMatrixWorld(true);
  };
  // each figure's rest pose and the pose with the right arm out (palm toward the other), blended over time
  const reach = (f: NonNullable<ReturnType<typeof crewFigure>>, toward: number): { rest: Map<Object3D, Quaternion>; out: Map<Object3D, Quaternion> } => {
    const rest = poseOf(f.root);
    aimBone(boneOf(f.root, "RightArm"), boneOf(f.root, "RightForeArm"), new Vector3(toward * 0.75, -0.55, 0.12));
    aimBone(boneOf(f.root, "RightForeArm"), boneOf(f.root, "RightHand"), new Vector3(toward, -0.05, 0.05));
    const out = poseOf(f.root);
    blendPose(rest, rest, 0);
    return { rest, out };
  };
  let sp: ReturnType<typeof reach> | null = null, cp: ReturnType<typeof reach> | null = null;
  let look: Map<Object3D, Quaternion> | null = null;
  if (sela) { place(sela, 1.8, 0.62, -Math.PI / 2); sp = reach(sela, -1); }
  if (cmd) {
    place(cmd, 1.98, -0.62, Math.PI / 2); cp = reach(cmd, 1);
    // and with the hand brought up in front of the chest, palm up, to look at the chip
    blendPose(cp.rest, cp.rest, 0);
    aimBone(boneOf(cmd.root, "RightArm"), boneOf(cmd.root, "RightForeArm"), new Vector3(0.35, -0.85, 0.25));
    aimBone(boneOf(cmd.root, "RightForeArm"), boneOf(cmd.root, "RightHand"), new Vector3(0.55, 0.6, 0.35));
    look = poseOf(cmd.root);
    blendPose(cp.rest, cp.rest, 0);
  }
  // the chip: the game's own currency model, at a real coin's size
  const coin = meshyScene("res.currency") ?? new Mesh(new SphereGeometry(0.02, 12, 8), new MeshStandardMaterial({ color: "#c9a24a", metalness: 0.8 }));
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
      const p = t < TAKE ? handPos(sela) : handPos(cmd);
      coin.position.copy(p).add(new Vector3(0, 0.03 + 0.02 * up, 0.02 + 0.03 * up));
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
      const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0).multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.3));
      const face = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), camera.position.clone().sub(coin.position).normalize());
      coin.quaternion.slerpQuaternions(flat, face, up);
    },
    dispose() { disposeAll(scene); },
  };
}

const SCENES: Readonly<Record<string, { models: readonly string[]; stage: (doc: Document, o: LiveSceneOptions, overlay: HTMLElement) => Staged; film?: boolean }>> = {
  chip_handoff: { models: ["unit.customer_sela", "unit.customer", "unit.player", "res.currency"], stage: chipHandoff, film: true },
  sela_arrival: { models: ["decor.buggy", "decor.buggy_wheel", "decor.buggy_wheel_l", "unit.customer_sela", "unit.customer"], stage: selaArrival, film: true },
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
