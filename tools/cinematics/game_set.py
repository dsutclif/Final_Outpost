# crash_open rework, stage 1: the crash site built from level 1's own placements (levels/story/story-L001.json),
# with a stand-in commander, rendered as fast Workbench stills from each planned camera, so Doug can approve the
# set and framing before any animation or full render. Origin = the commander's pod; metres; x east, y north.
# blender -b --factory-startup -P tools/cinematics/game_set.py -- [--out out/game_set]
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import lib

M = 28.0  # world units per metre (ART_M)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.join(lib.HERE, args[args.index("--out") + 1] if "--out" in args else "out/game_set")
LEVEL = os.path.join(lib.ROOT, "levels", "story", "story-L001.json")

# sizes in metres (docs/SCALE.md, render-3d/src/sizes.ts)
SCRAP_DX = -100 / M  # the held level edit (#48): the tube scrap moves 100 units west, off the commander's end spot
POD_BURY = float(os.environ.get("POD_BURY", 0.30))  # metres of the pod's base below the sand (docs/SCALE.md: 0.80; Doug 2026-11-08: too deep)
WRECK_M, POD_M, TUBE_M_PER_SCALE, CORE_H, ORE_M, CMD_H = 27.0, 2.66, 2.8, 1.70, 0.95, 1.98


def load():
    lv = json.load(open(LEVEL, encoding="utf-8"))
    by = {e.get("id"): e for e in lv["entities"] if e.get("id")}
    o = by["pod0"]["at"]
    to_m = lambda at: Vector(((at[0] - o[0]) / M, -(at[1] - o[1]) / M, 0))
    return lv, by, to_m


def build(scenery=True):
    lv, by, to_m = load()
    S = {}
    S["wreck"] = lib.place("decor.halcyon_wreck", at=tuple(to_m(by["wreck"]["at"])), yaw=by["wreck"].get("yaw", 0), size=WRECK_M, name="wreck")
    # pods: the game sinks each 0.80 m (lift); the glass shares the pod's scale and sits at its own lift/roll
    pods = []
    for i in range(3):
        p, g = by[f"pod{i}"], by[f"lid{i}"]
        pod = lib.place("decor.stasis_pod", at=tuple(to_m(p["at"])), yaw=p.get("yaw", 0), size=POD_M, name=f"pod{i}")
        pod.location.z = -POD_BURY
        k = pod.scale.x
        lid = lib.place("decor.stasis_glass", at=tuple(to_m(g["at"])), yaw=g.get("yaw", 0), name=f"lid{i}")
        lid.scale = (k, k, k)
        lid.location.z = g.get("lift", 0) / M + (0.80 - POD_BURY)
        if g.get("roll"):
            lid.rotation_euler = (0, math.radians(g["roll"]), math.radians(g.get("yaw", 0)))
        pods.append(pod)
    S["pods"] = pods
    for sid in ("scrap", "scrap2"):
        e = by.get(sid)
        if e: lib.place(e["type"], at=tuple(to_m(e["at"]) + Vector((SCRAP_DX, 0, 0))), yaw=e.get("yaw", 0), size=TUBE_M_PER_SCALE * e.get("scale", 1), name=sid)
    core = next(e for e in lv["entities"] if e["type"] == "sink.core")
    S["core_at"] = to_m(core["at"])  # where the light is; the film keeps the reactor and ore out of shot (level 1 lets you find them)
    if scenery:
        S["core"] = lib.place("sink.core.l1", at=tuple(to_m(core["at"])), height=CORE_H, name="reactor")
        for e in [e for e in lv["entities"] if e["type"] == "node.fuel_scrap"][:6]:
            lib.place("node.fuel_scrap", at=tuple(to_m(e["at"])), size=ORE_M)
    terrain = [e for e in lv["entities"] if e["type"] == "zone.terrain" and e.get("rect")]
    if os.environ.get("RIDGE_ONLY"):  # a shot can keep just some ridges (id prefixes, comma separated)
        keep = tuple(os.environ["RIDGE_ONLY"].split(","))
        terrain = [e for e in terrain if e["id"].startswith(keep)]
    if os.environ.get("RIDGE_ROCKS", "1") == "1":
        S["rocks"] = ridge_rocks(terrain, to_m)
    else:  # the old stand-in: level 1's terrain rects as low raised blocks (1.5 m)
        for e in terrain:
            x, y, w, h = e["rect"]
            c = to_m([x + w / 2, y + h / 2])
            bpy.ops.mesh.primitive_cube_add(size=1, location=(c.x, c.y, 0.75))
            b = bpy.context.object
            b.scale = (w / M, h / M, 1.5)
            b.data.materials.append(lib.mat("ridge", "#5a4a3c"))
    return S


def _hash01(n):  # render-3d/src/assets/scatter.ts hash01
    v = math.sin(n * 127.1 + 311.7) * 43758.5453
    return v - math.floor(v)


def ridge_rocks(terrain, to_m):
    """The game's ridges exactly as renderer.ts draws them once the Rockslide model has loaded: tiles of zone.blocked along
    each rect's long axis, overlapping, each turned and sized from the same seeded hash (game units / M = film metres)."""
    src = lib.place("zone.blocked", name="rockslide_src", exact=True)
    if src is None: return []
    meshes = [bpy.data.objects[n] for n in src["meshes"]]
    bpy.context.view_layer.update()
    # the model in its own units (art metres), its footprint centred: renderer.ts scales x and depth to 1, keeps the height
    pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    bx, by_ = hi.x - lo.x, hi.y - lo.y
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    base = [(o, o.matrix_world.copy()) for o in meshes]
    made = []
    for e in terrain:
        kind = e.get("kind", "ridge")
        if kind == "chasm": continue
        x, y, w, h = e["rect"]
        seed = 3 + len(e["id"]) * 5 + round(x + y)
        along_x = w >= h
        long_, short = max(w, h), min(w, h)
        n = max(1, round(long_ / (M * 1.2)))
        seg = long_ / n
        for i in range(n):
            r = _hash01(seed + i * 7.3); q = _hash01(seed * 3 + i * 1.9)
            yaw = (0 if along_x else math.pi / 2) + (math.pi if i % 2 else 0) + (r - 0.5) * 0.3
            a = -long_ / 2 + (i + 0.5) * seg + (q - 0.5) * seg * 0.2
            gx, gy = x + w / 2 + (a if along_x else 0), y + h / 2 + (0 if along_x else a)
            c = to_m([gx, gy])
            sx = seg * (1.2 + r * 0.25) / M / bx
            sy = short * (1.05 + q * 0.2) / M / by_
            sz = 1.8 * (0.85 + q * 0.35)
            # three's rotation about up by yaw is a turn about the film's Z by +yaw (the film's Y is the game's -y)
            T = Matrix.Translation((c.x, c.y, -0.04)) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Translation((-cx, -cy, -lo.z))
            for o, mw in base:
                t = bpy.data.objects.new(f"rock_{e['id']}_{i}", o.data)
                bpy.context.scene.collection.objects.link(t)
                t.matrix_world = T @ mw
                made.append(t)
    for o in meshes: o.hide_render = True; o.hide_viewport = True
    print(f"RIDGE ROCKS {len(made)} pieces from {sum(1 for e in terrain if e.get('kind', 'ridge') != 'chasm')} ridge rects")
    return made


def stand_in(at, yaw=0.0, name="commander"):
    cmd = lib.place("unit.player", at=tuple(at), yaw=yaw, height=CMD_H, name=name, rigged=True)
    lib.still(cmd)
    for o in cmd.children_recursive:
        if o.type != "MESH": o.hide_render = True
    return cmd


def main():
    sc = lib.reset(540, 960)
    sc.render.engine = "BLENDER_WORKBENCH"
    if sc.world is None: sc.world = bpy.data.worlds.new("sky")
    sc.world.color = (0.30, 0.27, 0.27)  # dim dusk-grey sky, never black
    sh = sc.display.shading
    sh.light, sh.color_type = "STUDIO", "TEXTURE"
    sh.show_shadows = True
    lib.ground()
    S = build()
    pod0 = S["pods"][0].location.copy(); pod0.z = 0
    # where the commander ends up: just out of the pod on its camera side (the game's start), facing the light
    end = pod0 + Vector((0.9, -0.9, 0))
    stand_in(end, yaw=-60)  # facing south-west, toward the reactor's light
    wreck = S["wreck"].location.copy()
    shots = {
        "1_impact_wide": lib.camera(wreck + Vector((-60, -85, 14)), wreck + Vector((0, 0, 3)), lens=30),
        "2_wreck_dawn": lib.camera(pod0 + Vector((-20, -26, 6)), (wreck + pod0) / 2 + Vector((0, 0, 2.5)), lens=30),
        "3_pod_close": lib.camera(pod0 + Vector((3.0, -2.2, 1.7)), pod0 + Vector((0, 0, 0.5)), lens=32),
        "4_step_out": lib.camera(pod0 + Vector((3.6, -3.4, 0.8)), end + Vector((0, 0, 1.0)), lens=30),
        "5_look_light": lib.camera(end + Vector((-3.2, -2.6, 1.5)), end + Vector((0, 0, 1.3)), lens=30),
    }
    for name, cam in shots.items():
        sc.camera = cam
        lib.render_still(os.path.join(OUT, name + ".png"))
    # the hand-off: level 1's openZoom.film framing, 170.3 x 302.8 world units across at the look point
    sc.camera = lib.game_camera(tuple(end + Vector((0, 0, 0.9))), view_w=170.3 / M)
    lib.render_still(os.path.join(OUT, "6_game_handoff.png"))


if __name__ == "__main__":
    main()
