import { CustomBlending, GreaterDepth, Mesh, MeshBasicMaterial, SkinnedMesh, type Object3D } from "three";

// The hero seen through whatever stands in front (backlog R6 N9). Walls are instanced and can't fade
// per tile, so instead every mesh of the hero is drawn a second time in one flat colour where it is
// hidden: GreaterDepth passes only behind something already drawn, so nothing shows in the open.
// Order in the opaque pass: the world (0), then the silhouette (1), then the hero (2). Drawing the
// hero last keeps its own limbs from showing through its body. The material stays in the opaque list
// (transparent false, so no sorting) but blends through CustomBlending. One shared material, always on:
// nothing toggles, so no shader ever recompiles mid-game.

const SIL = "silhouette";

/** The shared see-through material, in a skin colour. */
export function silhouetteMaterial(color: string): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, opacity: 0.45, blending: CustomBlending, depthFunc: GreaterDepth, depthWrite: false, fog: false });
}

/** Give a character's meshes their silhouette copies, once per root (a rebuilt copy is a new root); true when it added them. */
export function addSilhouette(root: Object3D, mat: MeshBasicMaterial): boolean {
  if (root.userData[SIL]) return false;
  root.userData[SIL] = true;
  const meshes: Mesh[] = [];
  root.traverse((o) => { if ((o as Mesh).isMesh && !o.userData[SIL]) meshes.push(o as Mesh); });
  for (const m of meshes) {
    m.renderOrder = 2;
    let s: Mesh;
    if ((m as SkinnedMesh).isSkinnedMesh) {
      const sk = m as SkinnedMesh, c = new SkinnedMesh(sk.geometry, mat);
      c.bindMode = sk.bindMode;
      c.bind(sk.skeleton, sk.bindMatrix);
      s = c;
    } else s = new Mesh(m.geometry, mat);
    // a child at no offset: follows the mesh's pose and visibility (props only show in their clips)
    s.renderOrder = 1;
    s.frustumCulled = false;
    s.userData[SIL] = true;
    s.raycast = () => undefined;
    m.add(s);
  }
  return true;
}
