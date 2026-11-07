import { Box3, Matrix4, Sprite, Vector3, type Object3D, type PerspectiveCamera, type Scene, type SkinnedMesh } from "three";

// Read-only measurements of the live scene for the review probes (client/src/dev/review.ts, dev builds only).
// Nothing here changes the scene; it runs when asked, not every frame.

export interface ScreenBox { x0: number; y0: number; x1: number; y1: number }

export type ThingKind = "building" | "node" | "decor" | "character" | "other";

/** One drawn thing: a placed model or a character, with where it is in the world and on the screen (mount CSS px). */
export interface DebugThing {
  key: string;
  /** Canonical id (`sink.core`, `node.fuel_deposit`, `unit.player`, ...). */
  id: string;
  kind: ThingKind;
  /** World bounds: x, y (up), z. */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  /** Where the renderer's own rules put this thing's base: the slab top for buildings, else the ground. */
  ruleY: number;
  /** Projected bounds. */
  screen: ScreenBox;
  /** Distance from the camera, so nearer things can be told from farther. */
  depth: number;
  /** A character's head: the top centre of its bounds, projected. */
  head?: { x: number; y: number };
  /** A character's feet: the bottom centre of its bounds, projected. */
  feet?: { x: number; y: number };
  /** Seconds since it appeared; a model pops in over its first 0.45 s, so measure after that. */
  age: number;
}

/** A floating label (a canvas sprite). */
export interface DebugLabel {
  /** The label's cache key: what it shows (`lock|Locked`, `ord|res.x|...`). */
  key: string;
  screen: ScreenBox;
  depth: number;
  world: { x: number; y: number; z: number };
}

export interface DebugScene {
  /** Mount size, CSS px. */
  w: number;
  h: number;
  things: DebugThing[];
  labels: DebugLabel[];
  /** The story's night-to-day progress, or null when story lighting is off. */
  lighting: number | null;
  camera: { x: number; y: number; z: number };
  /** The camera's horizontal forward direction on the ground (unit), for telling what is nearer to it. */
  forward: { x: number; z: number };
}

export interface ProbeInput {
  scene: Scene;
  camera: PerspectiveCamera;
  w: number;
  h: number;
  placed: readonly { key: string; id: string; root: Object3D; age: number; ruleY: number }[];
  characters: readonly { key: string; id: string; root: Object3D; age: number }[];
  /** Characters drawn from the crowd (no rig): world foot position, height and a name. */
  crowd: readonly { key: string; id: string; x: number; z: number; y: number; height: number }[];
  lighting: number | null;
}

const BUILDING = /^(sink|conv|struct)\./;

const kindOf = (id: string): ThingKind => (BUILDING.test(id) ? "building" : id.startsWith("node.") ? "node" : id.startsWith("decor.") ? "decor" : id.startsWith("unit.") || id.startsWith("role.") ? "character" : "other");

const tmpBox = new Box3();
const tmpV = new Vector3();

/** Project a world point to mount CSS px, like Renderer3D.toScreen. */
function project(camera: PerspectiveCamera, w: number, h: number, p: Vector3): { x: number; y: number } {
  tmpV.copy(p).project(camera);
  return { x: (tmpV.x * 0.5 + 0.5) * w, y: (-tmpV.y * 0.5 + 0.5) * h };
}

/** Screen bounds of a world box: all eight corners projected. */
export function projectBox(camera: PerspectiveCamera, w: number, h: number, min: readonly number[], max: readonly number[]): ScreenBox {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const c = new Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? max[0]! : min[0]!, i & 2 ? max[1]! : min[1]!, i & 4 ? max[2]! : min[2]!);
    const q = project(camera, w, h, c);
    if (q.x < x0) x0 = q.x;
    if (q.x > x1) x1 = q.x;
    if (q.y < y0) y0 = q.y;
    if (q.y > y1) y1 = q.y;
  }
  return { x0, y0, x1, y1 };
}

/** Bounds of the meshes that draw: hidden children (props not in hand, ghosts) leave the box alone. */
function drawnBox(root: Object3D, out: Box3): Box3 {
  out.makeEmpty();
  root.updateWorldMatrix(true, true);
  root.traverseVisible((o) => {
    const m = o as unknown as { isMesh?: boolean; isSprite?: boolean; geometry?: { boundingBox: Box3 | null; computeBoundingBox(): void }; boundingBox?: Box3 | null; computeBoundingBox?: () => void; matrixWorld: Matrix4 };
    if (!m.isMesh || m.isSprite || !m.geometry) return;
    // skinned meshes keep a pose-aware box of their own
    if (m.boundingBox !== undefined) { if (m.boundingBox === null) m.computeBoundingBox?.(); }
    else if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = (m.boundingBox ?? m.geometry.boundingBox);
    if (!b || b.isEmpty()) return;
    tmpBox.copy(b).applyMatrix4(m.matrixWorld);
    out.union(tmpBox);
  });
  return out;
}

/** A skinned character's bounds as posed now: a sample of its vertices through the skeleton (a rig's own mesh bounds are in other units). */
function skinnedBox(root: Object3D, out: Box3): Box3 {
  out.makeEmpty();
  root.updateWorldMatrix(true, true);
  const v = new Vector3();
  root.traverseVisible((o) => {
    const m = o as SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.skeleton.update();
    const pos = m.geometry.getAttribute("position");
    const step = Math.max(1, Math.floor(pos.count / 500));
    for (let i = 0; i < pos.count; i += step) { m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); out.expandByPoint(v); }
  });
  return out;
}

export function collectDebugScene(i: ProbeInput): DebugScene {
  const { camera, w, h } = i;
  camera.updateMatrixWorld();
  const camPos = camera.position;
  const things: DebugThing[] = [];
  const box = new Box3();
  const add = (key: string, id: string, root: Object3D, age: number, ruleY: number): void => {
    if (!root.visible) return;
    drawnBox(root, box);
    if (box.isEmpty()) return;
    const min = [box.min.x, box.min.y, box.min.z] as const, max = [box.max.x, box.max.y, box.max.z] as const;
    const kind = kindOf(id);
    const t: DebugThing = { key, id, kind, min, max, ruleY, screen: projectBox(camera, w, h, min, max), depth: camPos.distanceTo(tmpV.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2)), age };
    if (kind === "character") { t.head = project(camera, w, h, tmpV.set((min[0] + max[0]) / 2, max[1], (min[2] + max[2]) / 2)); t.feet = project(camera, w, h, tmpV.set((min[0] + max[0]) / 2, min[1], (min[2] + max[2]) / 2)); }
    things.push(t);
  };
  for (const p of i.placed) add(p.key, p.id, p.root, p.age, p.ruleY);
  // rigged characters: bounds from their posed vertices; the head is the top of the box, over its centre
  for (const c of i.characters) {
    const r = c.root;
    if (!r.visible) continue;
    skinnedBox(r, box);
    if (box.isEmpty()) { add(c.key, c.id, r, c.age, 0); continue; }
    const p = box.getCenter(new Vector3());
    const min = [box.min.x, box.min.y, box.min.z] as const, max = [box.max.x, box.max.y, box.max.z] as const;
    things.push({ key: c.key, id: c.id, kind: "character", min, max, ruleY: 0, screen: projectBox(camera, w, h, min, max), depth: camPos.distanceTo(p), head: project(camera, w, h, tmpV.set(p.x, box.max.y, p.z)), feet: project(camera, w, h, tmpV.set(p.x, box.min.y, p.z)), age: c.age });
  }
  for (const c of i.crowd) {
    const half = c.height * 0.12;
    const min = [c.x - half, c.y, c.z - half] as const, max = [c.x + half, c.y + c.height, c.z + half] as const;
    things.push({ key: c.key, id: c.id, kind: "character", min, max, ruleY: 0, screen: projectBox(camera, w, h, min, max), depth: camPos.distanceTo(tmpV.set(c.x, c.y + c.height / 2, c.z)), head: project(camera, w, h, tmpV.set(c.x, c.y + c.height, c.z)), feet: project(camera, w, h, tmpV.set(c.x, c.y, c.z)), age: Infinity });
  }

  // sprite size on screen: its world size laid along the camera's right and up
  const right = new Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const labels: DebugLabel[] = [];
  const corner = new Vector3();
  i.scene.traverseVisible((o) => {
    const s = o as Sprite;
    if (!s.isSprite || !s.material.map) return;
    const key = (s.userData["label"] as string | undefined) ?? "";
    if (!key) return;
    const at = s.getWorldPosition(new Vector3());
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    // the sprite's anchor (center) is where its position sits within it: 0.5, 0.5 unless the renderer slides it
    for (const [fx, fy] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      corner.copy(at).addScaledVector(right, (fx - s.center.x) * s.scale.x).addScaledVector(up, (fy - s.center.y) * s.scale.y);
      const q = project(camera, w, h, corner);
      if (q.x < x0) x0 = q.x;
      if (q.x > x1) x1 = q.x;
      if (q.y < y0) y0 = q.y;
      if (q.y > y1) y1 = q.y;
    }
    labels.push({ key, screen: { x0, y0, x1, y1 }, depth: camPos.distanceTo(at), world: { x: at.x, y: at.y, z: at.z } });
  });
  const dir = camera.getWorldDirection(new Vector3()), len = Math.hypot(dir.x, dir.z) || 1;
  return { w, h, things, labels, lighting: i.lighting, camera: { x: camPos.x, y: camPos.y, z: camPos.z }, forward: { x: dir.x / len, z: dir.z / len } };
}
