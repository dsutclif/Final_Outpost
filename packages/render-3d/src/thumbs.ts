import type { Skin } from "@fo/skins";
import { Box3, Color, DirectionalLight, HemisphereLight, Mesh, Object3D, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import { createBuildCtx, disposeBuildCtx } from "./assets/context.js";
import { disposeGeo } from "./assets/common.js";
import { buildModel } from "./assets/registry.js";
import { clone as cloneRig } from "three/examples/jsm/utils/SkeletonUtils.js";
import { loadMeshy, meshyEntries, meshyRig } from "./assets/meshy.js";

// Field-guide thumbnails: each canonical id's model rendered once, three-quarter view, on a
// transparent square. One short-lived WebGL context for the whole batch.

/** The game draws characters and props from their own GLBs rather than through buildModel, so the guide must too. */
const kindScene = (id: string): Object3D | null => {
  const e = meshyEntries().find((x) => x.id === id && x.kind && !x.slot);
  const rig = e && meshyRig(e.file);
  return rig ? cloneRig(rig.scene) : null;
};

const box = new Box3(), size = new Vector3(), centre = new Vector3();

/** Data URLs (PNG) keyed by id; ids that fail to build are skipped. Empty without WebGL. Waits for the GLBs so thumbnails match the game. */
export async function renderThumbnails(ids: readonly string[], skin: Skin, px = 96, doc: Document = document): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!ids.length) return out;
  await loadMeshy();
  const canvas = doc.createElement("canvas");
  const dpr = 2;
  canvas.width = canvas.height = px * dpr;
  let gl: WebGLRenderer;
  try { gl = new WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch { return out; }
  gl.outputColorSpace = SRGBColorSpace;
  gl.setClearColor(0x000000, 0);
  const ctx = createBuildCtx(skin);
  const t = ctx.t;
  const scene = new Scene();
  scene.add(new HemisphereLight(new Color(t.sky), new Color(t.groundDark), 1.9));
  const sun = new DirectionalLight(new Color(t.sun), 2.4);
  sun.position.set(-3, 6, 4);
  scene.add(sun);
  const cam = new PerspectiveCamera(30, 1, 0.01, 100);
  try {
    for (const id of ids) {
      let root = kindScene(id);
      if (!root) {
        try { root = buildModel(id, ctx).root; } catch { continue; }
        if (root.userData["fallback"]) continue;
      }
      scene.add(root);
      root.rotation.y = -0.45;
      root.updateMatrixWorld(true);
      box.setFromObject(root);
      if (box.isEmpty()) { scene.remove(root); continue; }
      box.getSize(size);
      box.getCenter(centre);
      const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.02;
      const d = r / Math.tan((cam.fov * Math.PI) / 360);
      cam.position.set(centre.x, centre.y + d * Math.sin(0.55), centre.z + d * Math.cos(0.55));
      cam.lookAt(centre);
      cam.updateMatrixWorld();
      gl.render(scene, cam);
      try { out.set(id, canvas.toDataURL("image/png")); } catch { /* tainted or lost context */ }
      scene.remove(root);
      root.traverse((o) => { if ((o as Mesh).isMesh) disposeGeo(o as Mesh); });
    }
  } finally {
    disposeBuildCtx(ctx);
    gl.dispose();
    gl.forceContextLoss();
  }
  return out;
}
