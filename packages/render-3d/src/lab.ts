import { content as defaultContent, type Content } from "@fo/content";
import { nameOf, type Skin } from "@fo/skins";
import {
  AxesHelper,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  Sprite,
} from "three";
import { createBuildCtx, disposeBuildCtx } from "./assets/context.js";
import { buildModel } from "./assets/registry.js";
import { objectTriangles } from "./geom.js";
import { TRI_BUDGET, modelIds, type AssetClass } from "./ids.js";
import { Labels, type CanvasMaker } from "./scene/labels.js";
import { ART_M } from "./units.js";

// Asset lab (docs/SPEC.md "Performance tiers and asset lab"): every canonical id's model on
// a grid in the active skin, with its name, class and triangle count, and an anchor overlay.
// Dev only; the harness in dev/ mounts it next to the game view.

export interface LabEntry { id: string; cls: AssetClass; tris: number; budget: number; fallback: boolean }

export interface AssetLab {
  scene: Scene;
  camera: PerspectiveCamera;
  entries: LabEntry[];
  setAnchors(on: boolean): void;
  /** Spin every model (turntable) by `dt` seconds. */
  update(dt: number): void;
  dispose(): void;
}

export function buildAssetLab(skin: Skin, make: CanvasMaker | null, aspect: number, c: Content = defaultContent): AssetLab {
  const ctx = createBuildCtx(skin);
  const t = ctx.t;
  const scene = new Scene();
  scene.background = new Color(t.fog);
  scene.add(new HemisphereLight(new Color(t.sky), new Color(t.groundDark), 1.8));
  const sun = new DirectionalLight(new Color(t.sun), 2.2);
  sun.position.set(-300, 600, 400);
  scene.add(sun);
  const labels = new Labels(make, t.ink);
  const ids = modelIds(c);
  const cols = 8;
  const cell = ART_M * 4.2;
  const rows = Math.ceil(ids.length / cols);
  const ground = new Mesh(new PlaneGeometry(cols * cell + cell, rows * cell + cell), new MeshBasicMaterial({ color: new Color(t.ground) }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(((cols - 1) * cell) / 2, -0.5, ((rows - 1) * cell) / 2);
  scene.add(ground);
  const spinners: Group[] = [];
  const anchors = new Group();
  const dot = new SphereGeometry(1.6, 8, 6);
  const dotMat = new MeshBasicMaterial({ color: new Color(t.interactive), depthTest: false });
  const entries: LabEntry[] = [];
  ids.forEach((id, i) => {
    const m = buildModel(id, ctx);
    const tris = objectTriangles(m.root);
    entries.push({ id, cls: m.cls, tris, budget: TRI_BUDGET[m.cls], fallback: !!m.root.userData["fallback"] });
    const x = (i % cols) * cell, z = Math.floor(i / cols) * cell;
    const holder = new Group();
    holder.position.set(x, 0, z);
    // big models shrink to fit their cell; small ones grow so they read
    const big = m.cls === "hero" ? 0.7 : m.cls === "prop" ? 3 : m.cls === "character" ? 1.6 : 1;
    const k = ART_M * big;
    if (id === "struct.barrier" || id === "struct.barrier.reinforced" || id === "barrier.line") m.root.scale.set(k * 2.5, k, k);
    else if (id.startsWith("zone.")) m.root.scale.set(cell * 0.7, k, cell * 0.7);
    else m.root.scale.setScalar(k);
    holder.add(m.root);
    scene.add(holder);
    spinners.push(m.root as unknown as Group);
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      if (!o.userData["anchor"]) return;
      const d = new Mesh(dot, dotMat);
      d.renderOrder = 30;
      d.userData["follow"] = o;
      anchors.add(d);
      const ax = new AxesHelper(6);
      ax.userData["follow"] = o;
      anchors.add(ax);
    });
    const label = new Sprite();
    const over = tris > TRI_BUDGET[m.cls];
    const txt = `${nameOf(skin, id)} · ${m.cls} · ${tris}△`;
    if (labels.apply(label, `lab|${txt}|${over}`, () => labels.text(txt, over ? t.danger : t.paper.panel, 30), 7)) {
      label.position.set(x, 3, z + cell * 0.42);
      scene.add(label);
    }
  });
  anchors.visible = false;
  scene.add(anchors);
  const camera = new PerspectiveCamera(40, aspect, 10, 20000);
  const cx = ((cols - 1) * cell) / 2, cz = ((rows - 1) * cell) / 2;
  const d = Math.max(cols, rows) * cell * 1.15;
  camera.position.set(cx, Math.sin(0.87) * d, cz + Math.cos(0.87) * d);
  camera.lookAt(cx, 0, cz);
  return {
    scene, camera, entries,
    setAnchors(on: boolean): void { anchors.visible = on; },
    update(dt: number): void {
      for (const s of spinners) s.rotation.y += dt * 0.5;
      if (!anchors.visible) return;
      for (const a of anchors.children) {
        const f = a.userData["follow"] as Group | undefined;
        if (f) { f.updateMatrixWorld(true); f.getWorldPosition(a.position); }
      }
    },
    dispose(): void {
      labels.dispose();
      dot.dispose();
      dotMat.dispose();
      disposeBuildCtx(ctx);
    },
  };
}
