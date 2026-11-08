# crash_open rework, stage 2: the pod sequence as a fast animation test on the game's crash site (game_set.py).
# The commander's capture (pod_exit.py, no deck: get up, step over the rim, drop to the sand, look round) is set on
# the game's own pod0, the glass swings open as they sit up, three cameras cut through it and the last cranes up
# into level 1's opening view (openZoom.film). Workbench, 360x640: timing and framing only.
# NO_STAGGER=1 blender -b --factory-startup -P tools/cinematics/game_film.py -- [--frames a b] [--stills]
import math, os, sys
os.environ["NO_STAGGER"] = "1"
os.environ.setdefault("WALL_T", "0.10")
os.environ.setdefault("RIM_FROM_CENTRE", "0.38")  # the pod interior's half-width: wall at -0.55, interior centre at -0.17
os.environ.setdefault("RIM_FORCE", "0.54")
os.environ.setdefault("STEP_LIFT", "95")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import lib, pod_exit, game_set


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.join(lib.HERE, "out", "game_film")
PRE = 45                       # frames lying still while the seal blows
POD_K = 2.66 / 3.9847          # render-3d sizes.ts
FLOOR = 0.0                    # Doug 2026-11-08: his back touches sand level while he lies in the pod
END_GUESS = Vector((-3.83, -0.49, 0))  # the commander's end spot from the last run (only aims the look-round)
POD_IN = Vector((-0.172, 0.023, 0))  # the pod's interior centre from its origin (the closed glass's centre)
WALL_X = -0.55                 # the pod's west wall centreline from the pod's origin (ray probe)
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
    if sc.world is None: sc.world = bpy.data.worlds.new("sky")
    sc.world.color = (0.30, 0.27, 0.27)  # dim dusk-grey sky, never black
    S = game_set.build()
    core = S["core_at"]
    # the look-round ends facing the reactor's light (END is where the previous run left the commander)
    pod_exit.LOOK_FACE = lambda yaw: math.atan2(core.y - END_GUESS.y, core.x - END_GUESS.x)
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
    # the capture's step line (its front rim wall) lands on the middle of the pod's west wall (probe: wall top x -0.55,
    # 0.1 m thick), so the planted foot crosses the wall's centre; its lateral centre on the pod's
    wall_pt = ax * (P["front"] + P["WALL_T"] / 2) + lat * ((P["lat0"] + P["lat1"]) / 2)
    c_w = Matrix.Rotation(yaw, 3, "Z") @ Vector((wall_pt.x, wall_pt.y, 0))
    stage.location = (pod_c.x + WALL_X - c_w.x, pod_c.y - c_w.y, FLOOR)
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
    fwd_w = stage.matrix_world.to_3x3() @ TL[-1][2][0].cross(TL[-1][2][1])  # up x right = forward
    face = math.degrees(math.atan2(fwd_w.y, fwd_w.x)); want = math.degrees(pod_exit.LOOK_FACE(0))
    print(f"FACING {face:.0f} deg, light at {want:.0f} deg (off by {((face - want + 180) % 360) - 180:.0f})")

    # the glass: closed, a jolt as the seal blows, then hinged open on its edge (the swing is the rotation that takes
    # the closed pose to the game's open pose, about the hinge line that rotation implies), done before the head rises
    lid = bpy.data.objects["lid0"]
    open_m = lid.matrix_world.copy()
    k, yw = POD_K, math.radians(-90)
    closed_off = Vector((-0.034, 0.258)) * k
    cx = pod_c + Vector((closed_off.x * math.cos(yw) + closed_off.y * math.sin(yw), -(-closed_off.x * math.sin(yw) + closed_off.y * math.cos(yw)), 0))
    closed_loc = Vector((cx.x, cx.y, -game_set.POD_BURY + 1.909 * k))
    closed_rot = Matrix.Rotation(yw, 3, "Z")
    # Doug (2026-11-08): the glass opens widthwise, hinged on a LONG side. The commander steps out over the west long
    # side, so it hinges on the east one and swings up and over to the east. Hinge line: along the pod (world y),
    # at the closed glass's east edge and its underside.
    lid.location, lid.rotation_euler = closed_loc, (0, 0, yw)
    bpy.context.view_layer.update()
    lb = [lid.matrix_world @ Vector(c) for m in [lid] + list(lid.children_recursive) if m.type == "MESH" for c in m.bound_box]
    hinge = Vector((max(v.x for v in lb), closed_loc.y, min(v.z for v in lb)))
    q_axis, q_ang = Vector((0, 1, 0)), math.radians(105)
    slide = Vector((0, 0, 0))
    print(f"GLASS closed x {min(v.x for v in lb):.2f}..{max(v.x for v in lb):.2f} y {min(v.y for v in lb):.2f}..{max(v.y for v in lb):.2f} z {min(v.z for v in lb):.2f}..{max(v.z for v in lb):.2f}; hinge at {tuple(round(v, 2) for v in hinge)}")
    lid.rotation_mode = "QUATERNION"
    f_open0, f_open1 = 14, 66
    for f in range(1, f_open1 + 1):
        t = smooth(max(0.0, (f - f_open0) / (f_open1 - f_open0)))
        Qt = Matrix.Rotation(q_ang * t, 3, q_axis)
        lid.location = hinge + Qt @ (closed_loc - hinge) + slide * t
        lid.rotation_quaternion = (Qt @ closed_rot).to_quaternion()
        lid.keyframe_insert("location", frame=f); lid.keyframe_insert("rotation_quaternion", frame=f)

    fq = (Matrix.Rotation(q_ang, 3, q_axis) @ closed_rot)
    fl = hinge + Matrix.Rotation(q_ang, 3, q_axis) @ (closed_loc - hinge)
    print(f"LID OPEN pose: {tuple(round(v, 3) for v in fl)} m from pod0 (game units dx {fl.x * 28:.1f} dy {-fl.y * 28:.1f} lift {fl.z * 28:.1f}); euler deg {tuple(round(math.degrees(a), 1) for a in fq.to_euler())}")
    sc.frame_set(46)
    ev = P["body"].evaluated_get(bpy.context.evaluated_depsgraph_get())
    bp = [ev.matrix_world @ v.co for v in ev.to_mesh().vertices]
    print("BODY lying extents x %.2f y %.2f z %.2f..%.2f (pod rims 0.43)" % (max(p.x for p in bp) - min(p.x for p in bp), max(p.y for p in bp) - min(p.y for p in bp), min(p.z for p in bp), max(p.z for p in bp)))

    import retarget
    wx = pod_c.x + WALL_X
    # Doug: he starts lying centred in the pod. Centre his lying body on the pod's interior centre (the glass's closed centre),
    # then report where the step line falls against the real west wall
    sc.frame_set(46)
    ev = P["body"].evaluated_get(bpy.context.evaluated_depsgraph_get())
    bp = [ev.matrix_world @ v.co for v in ev.to_mesh().vertices]
    bc = Vector(((max(p.x for p in bp) + min(p.x for p in bp)) / 2, (max(p.y for p in bp) + min(p.y for p in bp)) / 2, 0))
    tgt = Vector((cx.x, cx.y, 0)) if False else None
    sh = (POD_IN.x + pod_c.x - bc.x, POD_IN.y + pod_c.y - bc.y)
    for fc in lib.fcurves(stage):  # the stage's location is keyed (the jump's height): move every key
        if fc.data_path == "location" and fc.array_index in (0, 1):
            for kp in fc.keyframe_points:
                kp.co.y += sh[fc.array_index]; kp.handle_left.y += sh[fc.array_index]; kp.handle_right.y += sh[fc.array_index]
    stage.location.x += sh[0]; stage.location.y += sh[1]
    bpy.context.view_layer.update()
    sc.frame_set(46)
    ev = P["body"].evaluated_get(bpy.context.evaluated_depsgraph_get())
    bp = [ev.matrix_world @ v.co for v in ev.to_mesh().vertices]
    print("LYING centre now x %.2f y %.2f (pod interior centre %.2f, %.2f); body x %.2f..%.2f y %.2f..%.2f" % ((max(p.x for p in bp) + min(p.x for p in bp)) / 2, (max(p.y for p in bp) + min(p.y for p in bp)) / 2, POD_IN.x, POD_IN.y, min(p.x for p in bp), max(p.x for p in bp), min(p.y for p in bp), max(p.y for p in bp)))
    print("STEP LINE (capture rim wall) at world x %.2f, real west wall at %.2f" % ((stage.matrix_world @ Vector((wall_pt.x, wall_pt.y, 0))).x - pod_c.x, WALL_X))
    wx = pod_c.x + WALL_X
    for side in ("Left", "Right"):
        best = None
        for f in range(F(st[1]), F(st[2])):
            sc.frame_set(f)
            arm = P["arm"]
            for bn in ("ToeBase", "Foot"):
                pb = arm.pose.bones[retarget.P + side + bn]
                tl = arm.matrix_world @ pb.tail
                if tl.z < 0.9 and (best is None or abs(tl.x - wx) < best[0]): best = (abs(tl.x - wx), f, bn, tl.x - wx, tl.z)
        print(f"STEPFOOT {side}: nearest the wall centre at frame {best[1]} ({best[2]}): {best[3] * 100:+.0f} cm off the wall centre, {best[4] * 100:.0f} cm above the sand (wall top 54 cm)")
    print("FLAGGED beyond lying:", [r[:60] for r in P["report"] if int(r[1:5]) > 50][:8])
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
    # the glass opens west, where he steps out: cameras stay east/south of it. podcam: south-east, high, sees the glass
    # swing away and him sit up; standcam: south of the step-out, then through the whole drop (cut after he lands);
    # lookcam: in front of him toward the light, looking down a little so the ground, not the sky, fills the frame
    c1 = tracked("podcam", pod_c + Vector((-3.2, -2.4, 2.2)), 30)
    c2 = tracked("standcam", pod_c + Vector((-0.8, -4.8, 1.3)), 26)
    to_core = Vector((core.x - end.x, core.y - end.y, 0)).normalized()
    side = Vector((-to_core.y, to_core.x, 0))
    start = end + to_core * 3.2 + side * 1.2 + Vector((0, 0, 1.7))
    c3 = tracked("lookcam", start, 30)
    f_crane0 = F(st[3]) + 15
    hand = end + Vector((0, 0, 0.9))
    crane = crane_path(start, hand, f_crane0, N + PRE, HAND_W)
    key(c3, "location", [(F(P["r_land"]) + 14, start), (f_crane0, start)] + [(f, p) for f, p, _ in crane], "LINEAR")
    key(c3.data, "lens", [(F(P["r_land"]) + 14, 30), (f_crane0, 30)] + [(f, l) for f, _, l in crane], "LINEAR")
    aim = bpy.data.objects.new("aim", None)
    sc.collection.objects.link(aim)
    c3.constraints["Track To"].target = aim
    for f in range(F(st[2]) - 40, N + PRE + 1):  # the aim follows the commander, then eases onto the hand-off point
        t = max(0.0, (f - f_crane0) / max(1, N + PRE - f_crane0))
        e = t * t * (3 - 2 * t)
        aim.location = pel[min(f - 1, len(pel) - 1)].lerp(hand, e)
        aim.keyframe_insert("location", frame=f)
    edit = [(c1, 1), (c2, F(st[1]) + 10), (c3, F(P["r_land"]) + 14)]
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
    if "--pod" in args:  # debug: the pod alone (no glass, no commander) from the game camera, the east and the south
        for o in [lid, cmd] + list(cmd.children_recursive): o.hide_render = True
        bpy.context.view_layer.update()
        sc.timeline_markers.clear()
        for nm, cam in (("game", lib.game_camera(tuple(pod_c + Vector((0, 0, 0.3))), view_w=5.0)), ("east", lib.camera(pod_c + Vector((7, 0, 0.5)), pod_c + Vector((0, 0, 0.5)), lens=60, name="e")), ("south", lib.camera(pod_c + Vector((0, -7, 0.5)), pod_c + Vector((0, 0, 0.5)), lens=60, name="s"))):
            sc.camera = cam
            lib.render_still(os.path.join(OUT, f"pod_{nm}.png"))
        return
    if "--iso" in args:  # debug: the lying frames from the game camera and a low side view
        sc.timeline_markers.clear()
        for nm, cam in (("game", lib.game_camera(tuple(pod_c + Vector((0, 0, 0.3))), view_w=4.0)), ("east", lib.camera(pod_c + Vector((7, 0, 0.9)), pod_c + Vector((0, 0, 0.3)), lens=60, name="e"))):
            sc.camera = cam
            for f in (1, 120, 190):
                sc.frame_set(f)
                lib.render_still(os.path.join(OUT, f"iso_{nm}_{f:04d}.png"))
        return
    if "--probe" in args:  # debug: the pod model's surface heights (glass and commander hidden)
        for o in [lid, cmd] + list(cmd.children_recursive): o.hide_viewport = True
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        xs = [i / 20 for i in range(-20, 21)]
        print("PROBE x   ", " ".join(f"{x:5.2f}" for x in xs))
        for dy in (-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2):
            row = []
            for dx in xs:
                hit, loc, *_ = sc.ray_cast(dg, Vector((pod_c.x + dx, pod_c.y + dy, 5)), Vector((0, 0, -1)), distance=9)
                row.append(f"{loc.z:5.2f}" if hit and loc.z > 0.01 else "  .  ")
            print("PROBE y%+.1f" % dy, " ".join(row))
        return
    if "--step" in args:
        sc.timeline_markers.clear()
        cam = lib.camera(pod_c + Vector((-4.2, -2.6, 0.8)), pod_c + Vector((-0.6, 0, 0.6)), lens=36, name="stepcam")
        sc.camera = cam
        for f in (224, 232, 240, 248, 256, 264, 272, 280):
            sc.frame_set(f)
            lib.render_still(os.path.join(OUT, f"step_{f:04d}.png"))
        return
    if "--side" in args:  # debug: level, orthographic-ish views from the south and the east at pod height
        sc.timeline_markers.clear()
        for nm, off in (("south", Vector((0, -9, 0.3))), ("east", Vector((9, 0, 0.3)))):
            cam = lib.camera(pod_c + off, pod_c + Vector((0, 0, 0.3)), lens=90, name=nm)
            sc.camera = cam
            for f in (1, 46, F(st[1]) - 30):
                sc.frame_set(f)
                lib.render_still(os.path.join(OUT, f"side_{nm}_{f:04d}.png"))
        return
    if "--stills" in args:
        for f in ([int(x) for x in args[args.index("--at") + 1].split(",")] if "--at" in args else (1, f_open1, F(st[1]) + 20, F(st[1]) + 60, F(P["r_takeoff"]) + 8, F(P["r_land"]) + 4, F(st[3]) + 10, f_crane0 + (N + PRE - f_crane0) // 2, N + PRE)):
            sc.frame_set(f)
            cam = max((m for m in sc.timeline_markers if m.frame <= f), key=lambda m: m.frame).camera
            sc.camera = cam
            lib.render_still(os.path.join(OUT, f"still_{f:04d}.png"))
        return
    a, b = (int(args[args.index("--frames") + 1]), int(args[args.index("--frames") + 2])) if "--frames" in args else (1, N + PRE)
    lib.render_frames(OUT + "_frames", a, b)


main()
