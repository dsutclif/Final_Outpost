# crash_open rework, stage 1: the crash site built from level 1's own placements (levels/story/story-L001.json),
# with a stand-in commander, rendered as fast Workbench stills from each planned camera, so Doug can approve the
# set and framing before any animation or full render. Origin = the commander's pod; metres; x east, y north.
# blender -b --factory-startup -P tools/cinematics/game_set.py -- [--out out/game_set]
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib

M = 28.0  # world units per metre (ART_M)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.join(lib.HERE, args[args.index("--out") + 1] if "--out" in args else "out/game_set")
LEVEL = os.path.join(lib.ROOT, "levels", "story", "story-L001.json")

# sizes in metres (docs/SCALE.md, render-3d/src/sizes.ts)
WRECK_M, POD_M, TUBE_M_PER_SCALE, CORE_H, ORE_M, CMD_H = 27.0, 2.66, 2.8, 1.70, 0.95, 1.98


def load():
    lv = json.load(open(LEVEL, encoding="utf-8"))
    by = {e.get("id"): e for e in lv["entities"] if e.get("id")}
    o = by["pod0"]["at"]
    to_m = lambda at: Vector(((at[0] - o[0]) / M, -(at[1] - o[1]) / M, 0))
    return lv, by, to_m


def build():
    lv, by, to_m = load()
    S = {}
    S["wreck"] = lib.place("decor.halcyon_wreck", at=tuple(to_m(by["wreck"]["at"])), yaw=by["wreck"].get("yaw", 0), size=WRECK_M, name="wreck")
    # pods: the game sinks each 0.80 m (lift); the glass shares the pod's scale and sits at its own lift/roll
    pods = []
    for i in range(3):
        p, g = by[f"pod{i}"], by[f"lid{i}"]
        pod = lib.place("decor.stasis_pod", at=tuple(to_m(p["at"])), yaw=p.get("yaw", 0), size=POD_M, name=f"pod{i}")
        pod.location.z = p.get("lift", 0) / M
        k = pod.scale.x
        lid = lib.place("decor.stasis_glass", at=tuple(to_m(g["at"])), yaw=g.get("yaw", 0), name=f"lid{i}")
        lid.scale = (k, k, k)
        lid.location.z = g.get("lift", 0) / M - 0.0
        if g.get("roll"):
            lid.rotation_euler = (0, math.radians(g["roll"]), math.radians(g.get("yaw", 0)))
        pods.append(pod)
    S["pods"] = pods
    for sid in ("scrap", "scrap2"):
        e = by.get(sid)
        if e: lib.place(e["type"], at=tuple(to_m(e["at"])), yaw=e.get("yaw", 0), size=TUBE_M_PER_SCALE * e.get("scale", 1), name=sid)
    core = next(e for e in lv["entities"] if e["type"] == "sink.core")
    S["core"] = lib.place("sink.core.l1", at=tuple(to_m(core["at"])), height=CORE_H, name="reactor")
    S["core_at"] = to_m(core["at"])
    for e in [e for e in lv["entities"] if e["type"] == "node.fuel_scrap"][:6]:
        lib.place("node.fuel_scrap", at=tuple(to_m(e["at"])), size=ORE_M)
    # the ridge: level 1's terrain rects as low raised blocks (1.5 m)
    for e in [e for e in lv["entities"] if e["type"] == "zone.terrain" and e.get("rect")]:
        x, y, w, h = e["rect"]
        c = to_m([x + w / 2, y + h / 2])
        bpy.ops.mesh.primitive_cube_add(size=1, location=(c.x, c.y, 0.75))
        b = bpy.context.object
        b.scale = (w / M, h / M, 1.5)
        b.data.materials.append(lib.mat("ridge", "#5a4a3c"))
    return S


def stand_in(at, yaw=0.0, name="commander"):
    cmd = lib.place("unit.player", at=tuple(at), yaw=yaw, height=CMD_H, name=name, rigged=True)
    lib.still(cmd)
    for o in cmd.children_recursive:
        if o.type != "MESH": o.hide_render = True
    return cmd


def main():
    sc = lib.reset(360, 640)
    sc.render.engine = "BLENDER_WORKBENCH"
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
