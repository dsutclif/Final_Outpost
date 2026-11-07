# crash_open rework, stage 2: the pod sequence as a fast animation test on the game's crash site (game_set.py).
# The commander's capture (pod_exit.py, no deck: get up, step over the rim, drop to the sand, look round) is set on
# the game's own pod0, the glass swings open as they sit up, three cameras cut through it and the last cranes up
# into level 1's opening view (openZoom.film). Workbench, 360x640: timing and framing only.
# NO_STAGGER=1 blender -b --factory-startup -P tools/cinematics/game_film.py -- [--frames a b] [--stills]
import math, os, sys
os.environ["NO_STAGGER"] = "1"
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import lib, pod_exit, game_set

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.join(lib.HERE, "out", "game_film")
PRE = 45                       # frames lying still while the seal blows
POD_K = 2.66 / 3.9847          # render-3d sizes.ts
FLOOR = 0.20                  # the commander's floor inside the pod above the sand (lies inside it, still clears the rim)
HAND_W = 170.3 / 28            # metres across at the hand-off (level 1 openZoom.film)


def key(obj, path, fv, interp="BEZIER"):
    for f, v in fv:
        setattr(obj, path, v)
        obj.keyframe_insert(path, frame=f)
    for fc in lib.fcurves(obj):
        if fc.data_path == path:
            for kp in fc.keyframe_points: kp.interpolation = interp


def crane_path(start, target, f0, f1, view_w, dist_end=95.0):
    """crash.py's dolly-zoom crane into the game camera (30° pitch, from +x -y at 45°, near-orthographic)."""
    o = start - target
    d0 = o.length
    az0, el0 = math.atan2(o.y, o.x), math.asin(o.z / d0)
    az1, el1 = math.radians(-45), math.radians(30)
    daz = (az1 - az0 + math.pi) % (2 * math.pi) - math.pi
    h0, h1 = 36 * d0 / 30, view_w * 16 / 9
    out = []
    for f in range(f0, f1 + 1):
        t = (f - f0) / max(1, f1 - f0)
        e = t * t * (3 - 2 * t)
        dist = d0 * (dist_end / d0) ** e
        h = h0 * (h1 / h0) ** e
        el = el0 + (el1 - el0) * min(1.0, e * 1.6)
        az = az0 + daz * e * e
        out.append((f, target + dist * Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))), 36 * dist / h))
    return out


def main():
    sc = lib.reset(360, 640)
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light, sh.color_type, sh.show_shadows = "STUDIO", "TEXTURE", True
    lib.ground()
    S = game_set.build()
    pod = S["pods"][0]
    pod_c = pod.location.copy(); pod_c.z = 0

    cmd = lib.place("unit.player", at=(0, 0, 0), height=game_set.CMD_H, name="commander", rigged=True)
    lib.still(cmd)
    for o in cmd.children_recursive:
        if o.type != "MESH": o.hide_render = True
    pod_exit.STEP_TURN = 90  # the pod's end caps are tall: stand, turn, step out over its long side
    P = pod_exit.perform(cmd, pre=PRE)
    for o in P["walls"] + [P["deck"], P["sand"]]:
        bpy.data.objects.remove(o)
    TL, N, st, ax, lat = P["TL"], P["N"], P["starts"], P["ax"], P["lat"]
    centre = ax * ((P["front"] + P["back"]) / 2) + lat * ((P["lat0"] + P["lat1"]) / 2)
    # the stage: the game pod lies north-south with its glass opening east, so the capture steps out west (ax),
    # away from the glass and toward the reactor's light; its pod centre on pod0;
    # its deck (the commander's standing floor inside the pod) at the game pod's cavity floor
    yaw = math.atan2(0, -1) - math.atan2(ax.y, ax.x)
    stage = bpy.data.objects.new("stage", None)
    sc.collection.objects.link(stage)
    stage.rotation_euler = (0, 0, yaw)
    c_w = Matrix.Rotation(yaw, 3, "Z") @ Vector((centre.x, centre.y, 0))
    stage.location = (pod_c.x - c_w.x, pod_c.y - c_w.y, FLOOR)
    cmd.parent = stage
    # the capture's jump is DROP_H; the game pod's floor stands FLOOR above the sand: leave from the pod floor,
    # land on the sand, and take up the difference while airborne
    lo = min(FLOOR, P["DROP_H"])
    key(stage, "location", [(1 + PRE + P["r_takeoff"], Vector((stage.location.x, stage.location.y, FLOOR))),
                            (1 + PRE + P["r_land"], Vector((stage.location.x, stage.location.y, P["DROP_H"])))], "LINEAR")
    print("FLAGGED", len(P["report"]), P["report"][:4])
    bpy.context.view_layer.update()
    W = lambda v: stage.matrix_world @ Vector(v)
    pel = []
    for f in range(1, N + PRE + 1):
        sc.frame_set(f)
        pel.append(W(TL[max(0, f - 1 - PRE)][3]))
    end = Vector((pel[-1].x, pel[-1].y, 0))
    print(f"END commander at {end.x:.2f}, {end.y:.2f} m from pod0 (game units {end.x * 28:.1f}, {-end.y * 28:.1f})")
    F = lambda row: row + 1 + PRE

    # the glass: closed, a jolt as the seal blows, then open (game lid0) by the time the head is up
    lid = bpy.data.objects["lid0"]
    open_loc, open_rot = lid.location.copy(), lid.rotation_euler.copy()
    k, yw = POD_K, math.radians(-90)
    closed_off = Vector((-0.034, 0.258)) * k
    cx = pod_c + Vector((closed_off.x * math.cos(yw) + closed_off.y * math.sin(yw), -(-closed_off.x * math.sin(yw) + closed_off.y * math.cos(yw)), 0))
    closed_loc = Vector((cx.x, cx.y, -0.8 + 1.909 * k))
    closed_rot = (0, 0, yw)
    f_open0, f_open1 = 12, F(st[1]) - 30
    key(lid, "location", [(1, closed_loc), (f_open0, closed_loc), (f_open1, open_loc)])
    key(lid, "rotation_euler", [(1, Vector(closed_rot)), (f_open0, Vector(closed_rot)), (f_open1, open_rot)])

    follow = bpy.data.objects.new("follow", None)
    sc.collection.objects.link(follow)
    for f in range(len(pel)):
        ps = pel[max(0, f - 12):f + 13]
        follow.location = sum(ps, Vector()) / len(ps)
        follow.keyframe_insert("location", frame=f + 1)

    def tracked(name, at, lens):
        cam = lib.camera(at, pel[0], lens=lens, name=name)
        tt = cam.constraints.new("TRACK_TO")
        tt.target, tt.track_axis, tt.up_axis = follow, "TRACK_NEGATIVE_Z", "UP_Y"
        return cam
    # north-west of the pod: the tube scrap lies to the south-west
    c1 = tracked("podcam", pod_c + Vector((-2.6, 1.4, 1.7)), 32)
    c2 = tracked("standcam", pod_c + Vector((-4.4, 1.8, 0.7)), 30)
    start = end + Vector((-2.6, 2.2, 0.9))
    c3 = tracked("lookcam", start, 30)
    f_crane0 = F(st[3]) + 15
    hand = end + Vector((0, 0, 0.9))
    crane = crane_path(start, hand, f_crane0, N + PRE, HAND_W)
    key(c3, "location", [(F(st[2]), start), (f_crane0, start)] + [(f, p) for f, p, _ in crane], "LINEAR")
    key(c3.data, "lens", [(F(st[2]), 30), (f_crane0, 30)] + [(f, l) for f, _, l in crane], "LINEAR")
    aim = bpy.data.objects.new("aim", None)
    sc.collection.objects.link(aim)
    c3.constraints["Track To"].target = aim
    for f in range(F(st[2]), N + PRE + 1):  # the aim follows the commander, then eases onto the hand-off point
        t = max(0.0, (f - f_crane0) / max(1, N + PRE - f_crane0))
        e = t * t * (3 - 2 * t)
        aim.location = pel[min(f - 1, len(pel) - 1)].lerp(hand, e)
        aim.keyframe_insert("location", frame=f)
    edit = [(c1, 1), (c2, F(st[1]) + 10), (c3, F(st[2]) + 4)]
    for cam, f0 in edit:
        sc.timeline_markers.new(cam.name, frame=f0).camera = cam
    sc.frame_start, sc.frame_end = 1, N + PRE
    print(f"FILM {N + PRE} frames; cuts at {[f for _, f in edit]}; crane from {f_crane0}")

    if "--top" in args:  # debug: straight down on the pod, lying and stepping out
        sc.timeline_markers.clear()
        top = lib.camera(pod_c + Vector((0, 0.01, 7)), pod_c, lens=50, name="top")
        sc.camera = top
        for f in (1, F(st[1]) + 20):
            sc.frame_set(f)
            lib.render_still(os.path.join(OUT, f"top_{f:04d}.png"))
        bb = [o.matrix_world @ Vector(c) for o in pod.children_recursive if o.type == "MESH" for c in o.bound_box]
        print("POD bbox x", round(min(v.x for v in bb), 2), round(max(v.x for v in bb), 2), "y", round(min(v.y for v in bb), 2), round(max(v.y for v in bb), 2), "z", round(min(v.z for v in bb), 2), round(max(v.z for v in bb), 2))
        print("PELVIS f1", [round(v, 2) for v in pel[0]], "lid closed", [round(v, 2) for v in closed_loc])
        return
    if "--stills" in args:
        for f in (1, f_open1, F(st[1]) + 20, F(st[2]) + 20, F(st[3]) + 10, f_crane0 + (N + PRE - f_crane0) // 2, N + PRE):
            sc.frame_set(f)
            cam = max((m for m in sc.timeline_markers if m.frame <= f), key=lambda m: m.frame).camera
            sc.camera = cam
            lib.render_still(os.path.join(OUT, f"still_{f:04d}.png"))
        return
    a, b = (int(args[args.index("--frames") + 1]), int(args[args.index("--frames") + 2])) if "--frames" in args else (1, N + PRE)
    lib.render_frames(OUT + "_frames", a, b)


main()
