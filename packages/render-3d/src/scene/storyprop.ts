import { Group, Mesh, MeshBasicMaterial, SphereGeometry, SpotLight, type Object3D } from "three";
import RIG from "../assets/buggy.json";
import { loadMeshy, meshyScene } from "../assets/meshy.js";
import { SIZES } from "../sizes.js";
import { ART_M } from "../units.js";
import type { StoryVehicleSpec } from "../contract.js";
import { SelaRide, type RideExit } from "./selaride.js";

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

interface Run { spec: StoryVehicleSpec; len: number; segs: { x: number; z: number; d: number; yaw: number }[]; t0: number | null; group: Group | null; wheels: Object3D[]; lamps: SpotLight[]; yaw: number; driven: number;
  /** The rider (see riding()): her seated figure, the customer facts the renderer last gave, when the buggy first stood ready, and the exit's progress. */
  ride: SelaRide | null; info: { model: string; height: number; out: RideExit } | null; w0: number | null; exit: number;
  /** Where she stepped out (the door) and, once she is walking back to it to leave, the boarding: asked, and its start time on the renderer clock. */
  door: { x: number; z: number } | null; boardReq: boolean; boardT0: number | null }

/** After the buggy parks: a beat sitting with the lights on, then the climb out. */
const SIT = 0.5, EXIT = 1.3;
/** Leaving: she climbs back in over this long, once she is back at the door. */
const BOARD = 1.3;
/** If her model has not come in by then, the drive goes ahead without her figure. */
const WAIT = 4;

export class StoryProps {
  private readonly runs = new Map<string, Run>();
  private asked = false;

  constructor(private readonly attach: (o: Object3D) => void, private readonly detach: (o: Object3D) => void) {}

  /** Place (or with null remove) the vehicle `id`; a spec with the same `seq` as the one shown is ignored. */
  vehicle(id: string, spec: StoryVehicleSpec | null): void {
    const cur = this.runs.get(id);
    if (!spec) { this.drop(cur); this.runs.delete(id); return; }
    if (cur && cur.spec.seq === spec.seq) return;
    this.drop(cur);
    const pts = spec.path;
    const segs: Run["segs"] = [];
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!, b = pts[i]!, dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      if (d > 0) { segs.push({ x: a.x, z: a.z, d: len, yaw: Math.atan2(dz, -dx) }); len += d; }
    }
    this.runs.set(id, { spec, len, segs, t0: null, group: null, wheels: [], lamps: [], yaw: segs[0]?.yaw ?? 0, driven: 0, ride: null, info: null, w0: null, exit: 0, door: null, boardReq: false, boardT0: null });
    if (!this.asked) { this.asked = true; void loadMeshy(undefined, new Set(MODELS), undefined, true); }
  }

  private drop(r: Run | undefined): void {
    if (!r) return;
    if (r.group) this.detach(r.group);
    if (r.ride) { this.detach(r.ride.root); this.detach(r.ride.lamp); r.ride.dispose(); }
  }

  /**
   * True while customer `id` is still in (or climbing out of) a vehicle: the renderer does not draw her figure; this class
   * draws her seated, then stepping out to `out`, where the customer figure carries on. `model` is her character id and
   * `height` her height in world units; both and `out` are what the customer figure will have, so the hand-over is seamless.
   */
  riding(id: number, model: string | undefined, height: number, out: RideExit, leaving = false): boolean {
    for (const r of this.runs.values()) {
      if (r.spec.rider !== id) continue;
      if (r.boardReq) return true;
      if (model) r.info = { model, height, out };
      if (r.t0 === null || r.exit < 1) { if (r.exit < 1) r.door = { x: out.x, z: out.z }; return true; }
      // walking back to leave: at the door she climbs into the buggy again instead of vanishing there
      if (leaving && r.door && Math.hypot(out.x - r.door.x, out.z - r.door.z) < 0.7 * ART_M) { r.boardReq = true; return true; }
    }
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
      if (r.spec.rider !== undefined && !r.ride) {
        // her figure is built as soon as the renderer has said who she is and her model is in; the drive waits for her
        r.w0 ??= t;
        if (r.info) { r.ride = SelaRide.make(r.info.model, r.info.height); if (r.ride) { r.ride.root.visible = false; this.attach(r.ride.root); this.attach(r.ride.lamp); } }
        if (!r.ride && t - r.w0 < WAIT) continue;
      }
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
      if (r.ride && r.boardReq) {
        r.boardT0 ??= t;
        r.exit = 1 - ease((t - r.boardT0) / BOARD);
        r.ride.root.visible = r.ride.lamp.visible = true;
        r.ride.pose(g.position.x, g.position.z, g.rotation.y, ease(r.exit), r.info?.out ?? null);
      } else if (r.ride) {
        const since = u * r.spec.seconds - r.spec.seconds - SIT;
        r.exit = since <= 0 ? 0 : Math.min(1, since / EXIT);
        // after the climb out the customer figure is drawn (riding() is false), so hers is put away
        r.ride.root.visible = r.ride.lamp.visible = r.exit < 1;
        r.ride.pose(g.position.x, g.position.z, g.rotation.y, ease(r.exit), r.info?.out ?? null);
      } else r.exit = u < 1 ? 0 : 1;
    }
  }
}
