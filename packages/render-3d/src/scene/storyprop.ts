import { Group, Mesh, MeshBasicMaterial, SphereGeometry, SpotLight, type Object3D } from "three";
import RIG from "../assets/buggy.json";
import { loadMeshy, meshyScene } from "../assets/meshy.js";
import { SIZES } from "../sizes.js";
import { ART_M } from "../units.js";
import type { StoryVehicleSpec } from "../contract.js";

// Story vehicles: Sela's buggy (docs/BACKLOG.md #5), drawn in the game world by the story director's `vehicle`
// action. Built like the sela_arrival film's buggy (same parts, 2.64 m, wheels on the rig hubs, two headlights),
// scaled to world units. It drives its path by an eased distance, then stays parked with its lights on.
// Pure presentation: nothing here reaches the sim.

const ease = (k: number): number => { const c = Math.max(0, Math.min(1, k)); return c * c * (3 - 2 * c); };
const K = (SIZES.buggy.length / SIZES.buggy.buildLength) * ART_M;
const MODELS = ["decor.buggy", "decor.buggy_wheel", "decor.buggy_wheel_l"];
/** Headlight strength: half the film's 60 at metre scale (the game camera sits close to the beam), in world units. */
const LAMP = 30 * ART_M ** 1.4;
const bulbGeo = new SphereGeometry(0.12, 10, 8);
const bulbMat = new MeshBasicMaterial({ color: "#fff6e0" });

interface Run { spec: StoryVehicleSpec; len: number; segs: { x: number; z: number; d: number; yaw: number }[]; t0: number | null; group: Group | null; wheels: Object3D[]; lamps: SpotLight[]; yaw: number; driven: number }

export class StoryProps {
  private readonly runs = new Map<string, Run>();
  private asked = false;

  constructor(private readonly attach: (o: Object3D) => void, private readonly detach: (o: Object3D) => void) {}

  /** Place (or with null remove) the vehicle `id`; a spec with the same `seq` as the one shown is ignored. */
  vehicle(id: string, spec: StoryVehicleSpec | null): void {
    const cur = this.runs.get(id);
    if (!spec) { if (cur?.group) this.detach(cur.group); this.runs.delete(id); return; }
    if (cur && cur.spec.seq === spec.seq) return;
    if (cur?.group) this.detach(cur.group);
    const pts = spec.path;
    const segs: Run["segs"] = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0) { segs.push({ x: a.x, z: a.z, d: len, yaw: Math.atan2(dz, -dx) }); len += d; }
    }
    this.runs.set(id, { spec, len, segs, t0: null, group: null, wheels: [], lamps: [], yaw: segs[0]?.yaw ?? 0, driven: 0 });
    if (!this.asked) { this.asked = true; void loadMeshy(undefined, new Set(MODELS), undefined, true); }
  }

  /** A rider is hidden until the vehicle has parked (and for as long as its models are still loading). */
  riding(id: number): boolean {
    for (const r of this.runs.values()) if (r.spec.rider === id && (r.t0 === null || r.driven < 1)) return true;
    return false;
  }

  private build(r: Run): Group | null {
    const body = meshyScene("decor.buggy");
    if (!body || !meshyScene("decor.buggy_wheel") || !meshyScene("decor.buggy_wheel_l")) return null;
    // forward -x, body frame as in the rig; the whole thing scaled to Doug's 2.64 m
    const g = new Group();
    body.position.y = RIG.groundBelowBody;
    g.add(body);
    for (const h of RIG.hubs) {
      const w = meshyScene(h.side);
      if (!w) continue;
      const hub = new Group();
      hub.position.set(h.pos[0]!, RIG.groundBelowBody + h.pos[1]!, h.pos[2]!);
      w.position.y = -RIG.radius;
      hub.add(w);
      g.add(hub);
      r.wheels.push(hub);
    }
    for (const z of [-0.55, 0.55]) {
      const spot = new SpotLight("#fff2d6", 0, 40 * ART_M, 0.42, 0.5, 1.4);
      spot.position.set(-2.1, 1.0, z);
      spot.target.position.set(-12, 0, z * 2);
      g.add(spot, spot.target);
      r.lamps.push(spot);
      const bulb = new Mesh(bulbGeo, bulbMat);
      bulb.position.copy(spot.position);
      g.add(bulb);
    }
    g.scale.setScalar(K);
    g.visible = false;
    this.attach(g);
    return g;
  }

  /** Per frame, `t` seconds on the renderer clock. The drive's clock starts once the models are in, so a slow load never skips it. */
  update(t: number, dt: number): void {
    for (const r of this.runs.values()) {
      r.group ??= this.build(r);
      const g = r.group;
      if (!g || !r.segs.length) continue;
      r.t0 ??= t;
      const u = (t - r.t0) / Math.max(0.1, r.spec.seconds);
      r.driven = u;
      const s = r.len * Math.min(1, ease(u) ** 0.6);
      let seg = r.segs[0]!;
      for (const c of r.segs) if (c.d <= s) seg = c;
      const dir = r.segs.indexOf(seg);
      const next = r.segs[dir + 1];
      const end = next ? next.d : r.len;
      const f = (s - seg.d) / Math.max(1e-6, end - seg.d);
      const tx = next ? next.x : r.spec.path[r.spec.path.length - 1]!.x, tz = next ? next.z : r.spec.path[r.spec.path.length - 1]!.z;
      g.position.set(seg.x + (tx - seg.x) * f, 0, seg.z + (tz - seg.z) * f);
      // turn toward the segment's heading by the shortest way, softly
      let dy = seg.yaw - r.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      r.yaw += dy * Math.min(1, dt * 4);
      g.rotation.y = r.yaw;
      for (const w of r.wheels) w.rotation.z = s / (RIG.radius * K);
      const on = r.spec.lights === false ? 0 : Math.min(1, u * 8);
      for (const l of r.lamps) l.intensity = LAMP * on;
      g.visible = true;
    }
  }
}
