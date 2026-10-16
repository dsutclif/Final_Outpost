import {
  BufferGeometry, Color, ConeGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, RingGeometry, type Scene,
} from "three";

// Flat and floating marks the renderer adds on top of the scene: the guide arrow on the ground
// beside the hero with a bouncing marker over its target, the green ring that marks the hero, and
// the frost ring that drains around the reactor while it is out of fuel. Pure visuals; nothing here is pickable or blocks input.

const mat = (color: string, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false, depthTest: false, toneMapped: false, side: 2 });

/** A flat arrow pointing along +x on the ground plane (y up), about 32 units long. */
function arrowGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  // head (tip, two wings) and shaft (two triangles); x forward, z sideways
  const v = [
    18, 0, 0, 4, 0, -10, 4, 0, 10,
    4, 0, -4.5, 4, 0, 4.5, -14, 0, 4.5,
    4, 0, -4.5, -14, 0, 4.5, -14, 0, -4.5,
  ];
  g.setAttribute("position", new Float32BufferAttribute(v, 3));
  return g;
}

export interface MarkColors { interactive: string; accent: string; frost: string; ink: string; hero: string }

export class GroundMarks {
  private readonly arrow: Mesh;
  private readonly arrowEdge: Mesh;
  private readonly marker: Mesh;
  private readonly track: Mesh;
  private readonly heroRing: Mesh;
  private arc: Mesh;
  private arcQ = -1;
  private arcR = 0;

  constructor(private readonly scene: Scene, private readonly c: MarkColors) {
    const ag = arrowGeometry();
    this.arrowEdge = new Mesh(ag, mat(c.ink, 0.55));
    this.arrow = new Mesh(ag, mat(c.interactive, 0.95));
    this.marker = new Mesh(new ConeGeometry(7, 15, 4).rotateX(Math.PI), mat(c.interactive, 0.95));
    this.track = new Mesh(new RingGeometry(1, 1, 8), mat(c.frost, 0.22));
    this.arc = new Mesh(new RingGeometry(1, 1, 8), mat(c.frost, 0.9));
    // depth-tested, unlike the other marks, so walls and buildings in front still hide it
    const heroMat = mat(c.hero, 0.9);
    heroMat.depthTest = true;
    this.heroRing = new Mesh(new RingGeometry(11, 14, 40).rotateX(-Math.PI / 2), heroMat);
    for (const m of [this.arrowEdge, this.arrow, this.marker, this.track, this.arc, this.heroRing]) {
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 9;
      scene.add(m);
    }
    this.arrowEdge.renderOrder = 8;
    this.arrowEdge.scale.setScalar(1.28);
  }

  /** Arrow beside the hero toward (tx,tz), bouncing marker over the target; `on` false hides both. */
  guide(hx: number, hz: number, tx: number, tz: number, t: number, on: boolean, markerY: number): void {
    const dx = tx - hx, dz = tz - hz, d = Math.hypot(dx, dz);
    const show = on && d > 1;
    this.marker.visible = on;
    if (on) {
      this.marker.position.set(tx, markerY + 8 + Math.abs(Math.sin(t * 4.2)) * 9, tz);
      this.marker.rotation.y = t * 1.6;
    }
    // the ground arrow leads the way only while the target is a walk away
    const far = show && d > 46;
    this.arrow.visible = this.arrowEdge.visible = far;
    if (far) {
      const yaw = -Math.atan2(dz, dx), off = 34 + Math.sin(t * 5) * 3.5;
      for (const m of [this.arrow, this.arrowEdge]) {
        m.position.set(hx + (dx / d) * off, 1.4, hz + (dz / d) * off);
        m.rotation.y = yaw;
      }
      this.arrow.scale.setScalar(1);
    }
  }

  /** Green ring on the ground under the hero, so the player always finds their character. */
  hero(x: number, z: number, t: number, on: boolean): void {
    this.heroRing.visible = on;
    if (!on) return;
    this.heroRing.position.set(x, 2.6, z);
    (this.heroRing.material as MeshBasicMaterial).opacity = 0.8 + 0.15 * Math.sin(t * 3);
  }

  /** Frost ring around the reactor: `k` 1 = full circle (all the time left), draining to 0. */
  frost(cx: number, cz: number, radius: number, k: number, t: number, on: boolean): void {
    this.track.visible = this.arc.visible = on;
    if (!on) return;
    const q = Math.round(Math.max(0, Math.min(1, k)) * 96);
    if (q !== this.arcQ || radius !== this.arcR) {
      this.arcQ = q;
      this.arcR = radius;
      this.track.geometry.dispose();
      this.track.geometry = new RingGeometry(radius - 2.2, radius + 2.2, 72, 1, 0, Math.PI * 2);
      this.arc.geometry.dispose();
      // starts at the top and drains clockwise as seen from above
      this.arc.geometry = q > 0 ? new RingGeometry(radius - 4, radius + 4, 72, Math.max(1, 1), Math.PI / 2 - (q / 96) * Math.PI * 2, (q / 96) * Math.PI * 2) : new RingGeometry(1, 1, 3);
    }
    for (const m of [this.track, this.arc]) {
      m.rotation.set(-Math.PI / 2, 0, 0);
      m.position.set(cx, 1.2, cz);
    }
    (this.arc.material as MeshBasicMaterial).opacity = 0.7 + 0.25 * Math.sin(t * (k < 0.3 ? 9 : 4));
  }

  dispose(): void {
    for (const m of [this.arrow, this.marker, this.track, this.arc, this.heroRing]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
    }
    (this.arrowEdge.material as MeshBasicMaterial).dispose();
    for (const m of [this.arrowEdge, this.arrow, this.marker, this.track, this.arc, this.heroRing]) this.scene.remove(m);
  }
}
