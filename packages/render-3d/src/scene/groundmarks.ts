import {
  BufferGeometry, Color, ConeGeometry, Float32BufferAttribute, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, RingGeometry, type Scene,
} from "three";

// Flat and floating marks the renderer adds on top of the scene: the guide trail of chevrons on
// the ground from the hero to the next step with a bouncing marker over its target, the green ring that marks the hero, and
// the frost ring that drains around the reactor while it is out of fuel. Pure visuals; nothing here is pickable or blocks input.

const mat = (color: string, opacity: number): MeshBasicMaterial =>
  new MeshBasicMaterial({ color: new Color(color), transparent: true, opacity, depthWrite: false, depthTest: false, toneMapped: false, side: 2 });

/** Guide trail: chevrons this far apart (world units), starting past the hero ring and stopping short of the marker. */
const STEP = 15, START = 20, END_GAP = 10, MAX_CHEVRONS = 160;
/** The bright band: its spacing along the trail (world units) and how many times a second it passes a point. */
const PULSE_LEN = 110, PULSE_SPEED = 1.1;

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
  private readonly trail: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly tint = new Color();
  private readonly dim: Color;
  private readonly bright: Color;
  private readonly marker: Mesh;
  private readonly track: Mesh;
  private readonly heroRing: Mesh;
  private arc: Mesh;
  private arcQ = -1;
  private arcR = 0;

  constructor(private readonly scene: Scene, private readonly c: MarkColors) {
    this.bright = new Color(c.interactive);
    this.dim = new Color(c.interactive).lerp(new Color(c.ink), 0.45);
    this.trail = new InstancedMesh(arrowGeometry(), mat("#ffffff", 0.9), MAX_CHEVRONS);
    this.trail.setColorAt(0, this.bright);
    this.trail.count = 0;
    this.marker = new Mesh(new ConeGeometry(7, 15, 4).rotateX(Math.PI), mat(c.interactive, 0.95));
    this.track = new Mesh(new RingGeometry(1, 1, 8), mat(c.frost, 0.22));
    this.arc = new Mesh(new RingGeometry(1, 1, 8), mat(c.frost, 0.9));
    // depth-tested, unlike the other marks, so walls and buildings in front still hide it
    const heroMat = mat(c.hero, 0.9);
    heroMat.depthTest = true;
    this.heroRing = new Mesh(new RingGeometry(11, 14, 40).rotateX(-Math.PI / 2), heroMat);
    for (const m of [this.trail, this.marker, this.track, this.arc, this.heroRing]) {
      m.visible = false;
      m.frustumCulled = false;
      m.renderOrder = 9;
      scene.add(m);
    }
  }

  /**
   * Bouncing marker over the target (tx,tz) and a trail of chevrons on the ground along the whole
   * walk there (`path`, corner points; a straight line when absent), with a pulse running from the
   * hero toward the end. `on` false hides both.
   */
  guide(hx: number, hz: number, tx: number, tz: number, t: number, on: boolean, markerY: number, path?: readonly { x: number; y: number }[]): void {
    this.marker.visible = on;
    if (on) {
      this.marker.position.set(tx, markerY + 8 + Math.abs(Math.sin(t * 4.2)) * 9, tz);
      this.marker.rotation.y = t * 1.6;
    }
    // the route was planned up to half a second ago: drop corners the hero has already passed
    const pts = path && path.length ? [...path] : [{ x: tx, y: tz }];
    while (pts.length > 1) {
      const a = pts[0]!, b = pts[1]!;
      if (Math.hypot(b.x - hx, b.y - hz) >= Math.hypot(b.x - a.x, b.y - a.y)) break;
      pts.shift();
    }
    let n = 0;
    if (on) {
      // walk the polyline from just past the hero ring to just short of the end, one chevron per STEP
      let px = hx, pz = hz, along = 0, next = START;
      for (const q of pts) {
        const dx = q.x - px, dz = q.y - pz, L = Math.hypot(dx, dz);
        if (L < 1e-3) continue;
        const yaw = -Math.atan2(dz, dx);
        while (next <= along + L && n < MAX_CHEVRONS) {
          const k = (next - along) / L;
          this.dummy.position.set(px + dx * k, 1.3, pz + dz * k);
          this.dummy.rotation.set(0, yaw, 0);
          // a bright band travels outward along the trail; the rest stays dim
          const w = Math.max(0, Math.cos(((next / PULSE_LEN) - t * PULSE_SPEED) * Math.PI * 2));
          const pulse = w * w * w;
          this.dummy.scale.setScalar(0.5 + 0.2 * pulse);
          this.dummy.updateMatrix();
          this.trail.setMatrixAt(n, this.dummy.matrix);
          this.trail.setColorAt(n, this.tint.copy(this.dim).lerp(this.bright, 0.35 + 0.65 * pulse));
          n++;
          next += STEP;
        }
        along += L;
        px = q.x;
        pz = q.y;
      }
      // the last chevron would sit under the marker: leave a gap there
      while (n > 0 && along - (START + (n - 1) * STEP) < END_GAP) n--;
    }
    this.trail.count = n;
    this.trail.visible = n > 0;
    this.trail.instanceMatrix.needsUpdate = true;
    if (this.trail.instanceColor) this.trail.instanceColor.needsUpdate = true;
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
    for (const m of [this.trail, this.marker, this.track, this.arc, this.heroRing]) {
      m.geometry.dispose();
      (m.material as MeshBasicMaterial).dispose();
      this.scene.remove(m);
    }
  }
}
