# crash_open rework, stage 2: the pod sequence as a fast animation test on the game's crash site (game_set.py).
# The commander's capture (pod_exit.py, no deck: get up, step over the rim, drop to the sand, look round) is set on
# the game's own pod0, the glass swings open as they sit up, three cameras cut through it and the last cranes up
# into level 1's opening view (openZoom.film). Workbench, 360x640: timing and framing only.
# NO_STAGGER=1 blender -b --factory-startup -P tools/cinematics/game_film.py -- [--frames a b] [--stills]
import math, os, sys
os.environ["NO_STAGGER"] = "1"
os.environ.setdefault("WALL_T", "0.10")
os.environ.setdefault("DROP_EXTRA", "0")  # Doug 2026-11-09: no stretch (it slid his feet); level 1 starts where the drop ends
os.environ.setdefault("ARM_SWAY", "1")  # the arms trail the turn on the spot and swing a little (they looked pinned)
os.environ.setdefault("NO_DROP", "395,435")  # the pod floor is at sand level: no fall; he steps over the wall onto the sand and walks on (01_07)
#os.environ.setdefault("WALK_AFTER_DROP", "395,435")  # 01_07: a straight level walk (1.4 m, a foot just down at its start: no skate into it), after the drop
os.environ.setdefault("WALK_UNTURN", "21")  # the actor turns 21 deg through it: unwind that so he walks on the way he dropped
os.environ.setdefault("DROP_END", "329")  # the drop clip: half a second after the landing (frame 314), before its crouched run
os.environ.setdefault("DROP_ARM_CAP", "30")  # upper arms at most 30 deg out from the body through the drop (it flew to a T)
os.environ.setdefault("HAND_FOLLOW", "1")  # hands follow the forearms (the capture spun them)

os.environ.setdefault("STEP_SCALE", "0.05")
os.environ.setdefault("PIVOT_FRAMES", "34")
os.environ.setdefault("STEP_LEAD", "4")
os.environ.setdefault("SLIDE_TO_WALL", "0.38")
os.environ.setdefault("SLIDE_LAT_ADJ", "0")  # measured: puts the standing pelvis at the pod's mid-length (PEL print)
os.environ.setdefault("RIM_FROM_CENTRE", "0.38")  # the pod interior's half-width: wall at -0.55, interior centre at -0.17
os.environ.setdefault("RIM_FORCE", "0.54")
os.environ.setdefault("STEP_LIFT", "130")  # 2026-11-10 (was 95): a higher knee over the wall, clear of the hull bulging below the rim
os.environ.setdefault("STEP_SCALE_UNTIL", "0.55")  # the shortened step reaches full length sooner: the foot lands clear of the hull (--clip sweep)
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
END_GUESS = Vector((-2.82, -0.37, 0))  # the commander's end spot from the last run (only aims the look-round)
POD_IN = Vector((float(os.environ.get("POD_IN_X", -0.14)), 0.023, 0))  # where his lying body is centred (was -0.172, the glass centre; the flat floor runs -0.35..0.25: 2026-11-10 moved 3 cm east: fewest frames deeper than 2 cm in the pod (--clip sweep))
FLOOR_BOX = (-0.45, 0.35, 1.0, 0.15, 0.62)  # x lo, x hi, |y| max, z lo, z hi from the pod origin: the interior floor plate
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
    EEVEE = "--eevee" in args  # the lit night render (720x1280); without it the fast Workbench preview (360x640)
    sc = lib.reset(*((720, 1280) if EEVEE else (360, 640)))
    if EEVEE:
        if "--quick" in args: sc.eevee.taa_render_samples = 12
        lib.bloom(threshold=1.0, size=7)
        # a night dust storm (Doug): the first film's brown-red haze with the day taken out
        lib.sky(horizon="#5a3b2a", zenith="#1a1210", haze=0.006, haze_color="#5a3b2a")
        sun_ob = lib.sun(elevation=25, azimuth=-150, strength=3.0, color="#d9a67e")
        lib.ground()
        lib.ridge(at=(0, 260, -1), length=1500, depth=170, height=48, seed=4, color="#241812")
        lib.ridge(at=(-120, 480, -3), length=1800, depth=240, height=95, seed=9, color="#2b1d16")
        sc.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 4.0
        sh = sc.display.shading
    else:
        sc.render.engine = "BLENDER_WORKBENCH"
        sh = sc.display.shading
        sh.light, sh.color_type, sh.show_shadows = "STUDIO", os.environ.get("WB_COLOR", "TEXTURE"), True  # WB_COLOR=VERTEX shows the game sand's colours
        lib.ground()
        if sc.world is None: sc.world = bpy.data.worlds.new("sky")
        sc.world.color = (0.30, 0.27, 0.27)  # dim dusk-grey sky, never black
    if EEVEE: os.environ.setdefault("GAME_LOOK", "1")  # the final render: the game's sand and the original Meshy wreck (game_set.py)
    S = game_set.build(scenery=not EEVEE)
    core = S["core_at"]
    # the look-round ends facing the reactor's light (END is where the previous run left the commander)
    pod_exit.LOOK_FACE = lambda yaw: math.atan2(core.y - END_GUESS.y, core.x - END_GUESS.x)
    pod = S["pods"][0]
    if EEVEE or os.environ.get("NO_RIDGES", "1") == "1":  # the level's ridge stand-in boxes: off in the night film, and in previews (a camera sat inside one)
        for o in bpy.data.objects:
            if o.type == "MESH" and any(m and m.name.startswith("ridge") for m in o.data.materials): o.hide_render = True
    pod_c = pod.location.copy(); pod_c.z = 0
    # the pod model has an interior floor plate about 0.45 m above the sand (at BURY 0.30); his back lies at sand level,
    # so the plate is cut out of this pod (the game's pod needs the same)
    import bmesh
    me = [o for o in pod.children_recursive if o.type == "MESH"][0]
    bm = bmesh.new(); bm.from_mesh(me.data)
    mw = me.matrix_world
    kill = [f for f in bm.faces if FLOOR_BOX[0] < (mw @ f.calc_center_median()).x - pod_c.x < FLOOR_BOX[1] and abs((mw @ f.calc_center_median()).y - pod_c.y) < FLOOR_BOX[2] and FLOOR_BOX[3] < (mw @ f.calc_center_median()).z < FLOOR_BOX[4]]
    print("FLOOR plate faces cut:", len(kill), "of", len(bm.faces))
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(me.data); bm.free()

    cmd = lib.place("unit.player", at=(0, 0, 0), height=game_set.CMD_H, name="commander", rigged=True)
    lib.still(cmd)
    for o in cmd.children_recursive:
        if o.type != "MESH": o.hide_render = True
    pod_exit.STEP_TURN = int(os.environ.get("GF_STEP_TURN", 90))  # the pod's end caps are tall: stand, turn, step out over its long side
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
    if os.environ.get("FOOT_LOCK", "1") == "1":
        # foot lock on the sand (2026-11-10): the takes' crossfades blend the legs but not the pelvis, so a planted foot
        # skates (up to 6 cm a frame as he stops before the look-round). From the landing to the crane, move the whole
        # figure (the stage) against the drift of the lowest joint that is planted in both frames; through the crane the
        # shift eases back to nothing, so the last frame still ends on level 1's start
        import retarget
        arm = P["arm"]
        js = [retarget.P + s + b for s in ("Left", "Right") for b in ("ToeBase", "Foot")]
        f_l, f_c, f_e = 1 + PRE + P["r_land"], 1 + PRE + P["starts"][-1] + 15, N + PRE
        f_land = f_l; f_gap = 1 + PRE + len(P["takes"][0].frames())  # the stepping turn pins its own foot (pod_exit.step_turn), and the step over the wall (to f_land) has its travel shortened on purpose: both left alone
        if os.environ.get("FOOT_LOCK_TURN", "0") == "1": f_l = 1 + PRE + len(P["takes"][0].frames()) - 40  # 2026-11-10: also the end of the get-up, as he finishes standing
        pos = []
        for f in range(f_l, f_e + 1):  # planted = near the joint's lowest over the same stretch --feet measures
            sc.frame_set(f)
            pos.append({j: (arm.matrix_world @ arm.pose.bones[j].head).copy() for j in js})
        lo_z = {j: min(p[j].z for p in pos) for j in js}
        off, offs = Vector((0, 0, 0)), [Vector((0, 0, 0))]
        for i in range(1, len(pos)):
            both = [j for j in js if pos[i][j].z < lo_z[j] + 0.02 and pos[i - 1][j].z < lo_z[j] + 0.02]
            # a planted ball with the ankle swinging round it is a pivot on the ball, not a skate: then the ankle does not count
            both = [j for j in both if not (j.endswith("Foot") and j[:-4] + "ToeBase" in both)]
            ds = [Vector(((pos[i][j] - pos[i - 1][j]).x, (pos[i][j] - pos[i - 1][j]).y)) for j in both]
            # before the stop only where a planted joint skates (small natural shifts stay); once he stands (the crane), every drift
            if ds and not (f_gap < f_l + i < f_land) and max(d.length for d in ds) > (0.008 if f_l + i <= f_c else 0.0):
                # the shift that keeps every planted joint as still as it can: the centre of the two drifts furthest apart
                a, b = max(((x, y) for x in ds for y in ds), key=lambda q: (q[0] - q[1]).length)
                c = (a + b) / 2
                off = off - Vector((c.x, c.y, 0))
            offs.append(off.copy())
        base = stage.location.copy()
        keys = [(f_l + i, base + o) for i, o in enumerate(offs)]  # no ease-back (it glided him while he stood): he ends where the lock leaves him
        key(stage, "location", keys, "LINEAR")
        bpy.context.view_layer.update()
        print(f"FOOT LOCK frames {f_l}-{f_e} (every drift from {f_c}): largest shift {max(o.length for o in offs) * 100:.0f} cm, at the end {off.length * 100:.0f} cm")
    W = lambda v: stage.matrix_world @ Vector(v)
    pel = []
    for f in range(1, N + PRE + 1):
        sc.frame_set(f)
        pel.append(W(TL[max(0, f - 1 - PRE)][3]))
    print("PEL", [(f, round(pel[f - 1].x - pod_c.x, 2), round(pel[f - 1].y - pod_c.y, 2)) for f in (46, 100, 150, 200, 235, 255, 275, 295, 330)])
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
    # the end spot and the pelvis path (the cameras and level 1's start follow them) were measured before this shift
    end = end + Vector((sh[0], sh[1], 0)); pel = [q + Vector((sh[0], sh[1], 0)) for q in pel]
    print(f"END after the lying shift ({sh[0] * 100:+.1f}, {sh[1] * 100:+.1f} cm): {end.x:.3f}, {end.y:.3f} m from pod0 = game units {559 + end.x * 28:.1f}, {125 - end.y * 28:.1f}")
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
    if os.environ.get("BODY_CLEAR", "1") == "1":
        # clear of the pod (Doug 2026-11-10: a hand through the wall, knees and head through the rims): for every frame before
        # the drop, ease each limb group away from the pod only as far as that frame needs for its surface to stop crossing
        # it (the arms tuck in across the body, the legs draw in toward the pod's middle, the head leans back in); crossings
        # under 15 cm (the feet on the floor) are contact, not pass-through; the amounts are smoothed over time (no pops)
        from mathutils.bvhtree import BVHTree
        arm, body, place, sm = P["arm"], P["body"], P["place"], P["sm"]
        dg = bpy.context.evaluated_depsgraph_get()
        pv, pp = [], []
        for o in [pod] + list(pod.children_recursive):
            if o.type != "MESH": continue
            ev = o.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles(); b0 = len(pv)
            pv += [ev.matrix_world @ v.co for v in me.vertices]; pp += [tuple(b0 + i for i in t.vertices) for t in me.loop_triangles]
            ev.to_mesh_clear()
        pod_bvh = BVHTree.FromPolygons(pv, pp)
        Rs = stage.matrix_world.to_3x3().normalized().inverted()
        mid_w = Vector((pod_c.x + POD_IN.x, pod_c.y + POD_IN.y, 0))
        def grp(test):
            gi = {g.index for g in body.vertex_groups if test(g.name)}
            return {v.index for v in body.data.vertices if v.groups and max(v.groups, key=lambda g: g.weight).group in gi}
        is_arm = lambda n: ("Arm" in n or "Hand" in n) and "Shoulder" not in n
        is_leg = lambda n: any(k in n for k in ("UpLeg", "Leg", "Foot", "Toe"))
        is_head = lambda n: "Head" in n or "Neck" in n
        is_toe = lambda n: "Toe" in n
        is_chest = lambda n: "Shoulder" in n or n.endswith("Spine2")
        is_back = lambda n: n.endswith(("Spine1", "Spine"))  # the backpack: it grazed the east rim through the stepping turn
        side_leg = lambda sd: (lambda n: n.replace("mixamorig:", "").startswith(sd) and any(k in n for k in ("Leg", "Foot", "Toe")))
        groups = {"arms": grp(is_arm), "legs": grp(is_leg), "head": grp(is_head), "toes": grp(is_toe), "chest": grp(is_chest), "back": grp(is_back),
                  "liftL": grp(side_leg("Left")), "liftR": grp(side_leg("Right")),
                  "armL": grp(lambda n: is_arm(n) and n.replace("mixamorig:", "").startswith("Left")), "armR": grp(lambda n: is_arm(n) and n.replace("mixamorig:", "").startswith("Right"))}
        ARMS_SIDE = os.environ.get("ARMS_SIDE", "1") == "1"  # standing: each arm on its own, its hand in toward the pod's middle (never both tucked forward)
        DEPTH_G = ("legs", "toes", "chest", "back", "liftL", "liftR")  # judged by depth (over 2 cm fails): resting contact is fine
        mid_c = pod_c + POD_IN
        def odd_depth(q, d, reach):
            n_, first, o_ = 0, None, q.copy()
            for _ in range(8):
                loc, _nrm, _i, dist = pod_bvh.ray_cast(o_, d, reach)
                if loc is None: break
                n_ += 1; reach -= dist
                if first is None: first = (loc - q).length
                o_ = loc + d * 1e-4
                if reach <= 0: break
            return first if n_ % 2 == 1 else None
        def depth(gname):
            ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
            worst = 0.0
            for i in list(groups[gname])[::2]:
                q = ev.matrix_world @ me.vertices[i].co
                if abs(q.x - mid_c.x) > 0.85 or abs(q.y - mid_c.y) > 1.4 or q.z > 1.2: continue
                cands = []
                if abs(q.x - mid_c.x) > 1e-3: cands.append(odd_depth(q, Vector((1 if mid_c.x > q.x else -1, 0, 0)), abs(mid_c.x - q.x)))
                if abs(q.y - mid_c.y) > 0.6: cands.append(odd_depth(q, Vector((0, 1 if mid_c.y > q.y else -1, 0)), abs(mid_c.y - q.y)))
                cands.append(odd_depth(q, Vector((0, 0, 1)), 0.5))
                ds = [c for c in cands if c is not None]
                if len(ds) == len(cands) and ds: worst = max(worst, min(ds))
            ev.to_mesh_clear()
            return worst
        def bad(g): return depth(g) > 0.02 if g in DEPTH_G else hits(g) > 0
        tri_cache = {}
        def hits(gname):
            ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh(); me.calc_loop_triangles()
            if gname not in tri_cache: tri_cache[gname] = [tuple(t.vertices) for t in me.loop_triangles if all(i in groups[gname] for i in t.vertices)]
            vs = [ev.matrix_world @ v.co for v in me.vertices]; ev.to_mesh_clear()
            tr = tri_cache[gname]
            return sum(1 for _, b_ in pod_bvh.overlap(BVHTree.FromPolygons(vs, tr)) if sum((vs[i] for i in tr[b_]), Vector()).z / 3 > 0.15)
        def inward(name, ends=False):  # capture-space unit vector from the bone's world head toward the pod's middle line
            h = arm.matrix_world @ arm.pose.bones["mixamorig:" + name].head  # (and, with ends, back from the end caps)
            dy = mid_w.y - h.y
            d = Vector((mid_w.x - h.x, dy if ends and abs(dy) > 0.55 else 0, 0))
            return (Rs @ d).normalized() if d.length > 1e-4 else Vector((0, 0, 0))
        def edit(dirs, fr, ws):
            if os.environ.get("SHOULDER_DEBUG") and ws.get("row", -1) % 6 == 0 and all(ws.get(g, 0) == 0 for g in groups):
                print("SHD film %d" % (ws["row"] + 1 + PRE + 165), {k: tuple(round(x) for x in v) for k, v in pod_exit.shoulder_angles(dirs).items()})
            if fr[0].z > 0.6:  # upright: arms out a little for balance (never tucked flat to the torso), as far as they need
                if os.environ.get("ARMS_GRAVITY", "1") == "1":  # Doug 2026-11-11: they hang from gravity, not from the pelvis tilt (it swung them 23-36 deg back as he rose)
                    rh_ = Vector((fr[1].x, fr[1].y, 0)); fr_a = (Vector((0, 0, 1)), rh_.normalized()) if rh_.length > 1e-4 else fr
                else: fr_a = fr
                out = pod_exit.arms_balance(dirs, fr_a, max(ws.get("relax", 0.0), min(1.0, ws["arms"] * 4)), ws.get("phase", 0.0), tuck=ws["arms"])
                rw_ = relax_w(ws.get("row", -1))
                if rw_ > 0: out = pod_exit.arms_relaxed(out, fr_a, rw_ * (1 - min(1.0, ws["arms"] * 2)), ws.get("row", 0) / 30.0)  # gives way where the pod needs the arms in
                for sd, gk in (("Left", "armL"), ("Right", "armR")):  # the arm the rim touches: its hand comes in sideways, toward the pod's middle
                    if ws.get(gk, 0) > 0:
                        iv = inward(sd + "Hand")
                        for b, k in (("Arm", 0.35), ("ForeArm", 0.9)):
                            out[sd + b] = pod_exit.slerp_dir(out[sd + b], (out[sd + b].normalized() + iv * k).normalized(), ws[gk])
            else:  # lying and getting up: tucked in across the body, only as far as the pod needs
                out = pod_exit.arms_in(dirs, fr, ws["arms"])
            if ws["arms"] > 0 and os.environ.get("SHOULDER_GIVE", "0") == "1":  # the lowered shoulder gives way where the pod needs the arm in (the hand grazed the east rim as the turn starts)
                for sd in ("Left", "Right"):
                    if "_cap" + sd + "Shoulder" in out: out[sd + "Shoulder"] = pod_exit.slerp_dir(out[sd + "Shoulder"], out["_cap" + sd + "Shoulder"], min(1.0, ws["arms"] * 2))
            for side in ("Left", "Right"):
                if ws["legs"] > 0:
                    iv = (inward(side + "Leg") + inward(side + "Foot", True)).normalized()  # the knee's side and the foot's end
                    for b in ("UpLeg", "Leg"):
                        n = side + b
                        if n in out: out[n] = pod_exit.slerp_dir(out[n], (out[n] + iv * 1.0).normalized(), ws["legs"])
            UPc = Vector((0, 0, 1))  # the stage only turns about the vertical
            for side, gk in (("Left", "liftL"), ("Right", "liftR")):
                if ws.get(gk, 0) > 0:  # standing and stepping out: swing that leg out from the pod and a little up (the hull bulges below the rim)
                    ov = -inward(side + "Foot")
                    for b, k in (("UpLeg", 0.5), ("Leg", 0.8)):
                        n = side + b
                        if n in out: out[n] = pod_exit.slerp_dir(out[n], (out[n] + ov * k + UPc * 0.25).normalized(), ws[gk])
            if ws.get("toes", 0) > 0:  # toes bend up onto the tub's curve
                for side in ("Left", "Right"):
                    for b, k in (("ToeBase", 1.2), ("Foot", 0.4)):
                        n = side + b
                        if n in out: out[n] = pod_exit.slerp_dir(out[n], (out[n] + UPc * k).normalized(), ws["toes"])
            if max(ws.get("chest", 0), ws.get("back", 0)) > 0 and "_chest_up" in out and os.environ.get("CHEST_CLEAR", "1") == "1":  # the chest leans back in, off the rim
                iv = inward("Spine2")
                out["_chest_up"] = pod_exit.slerp_dir(out["_chest_up"], (out["_chest_up"] + iv * 0.5).normalized(), max(ws.get("chest", 0), ws.get("back", 0)))
            if ws["head"] > 0 and os.environ.get("HEAD_CLEAR", "shift") == "shift":  # and he lifts his head (looks up from his feet: a nod, never a sideways roll)
                for n, k in (("Neck", 0.5), ("Head", 0.8)):
                    if n in out: out[n] = pod_exit.slerp_dir(out[n], UPc, ws["head"] * k)
            if ws["head"] > 0 and os.environ.get("HEAD_CLEAR", "shift") == "roll":  # (the old way: it rolled his head up to 126 deg sideways)
                iv = inward("Head")
                for n in ("Neck", "Head"):
                    if n in out: out[n] = pod_exit.slerp_dir(out[n], (out[n] + iv * 0.6).normalized(), ws["head"])
            if out.get("_shw", 0) > 0 and fr[0].z > 0.6 and os.environ.get("SHOULDER_RELEVEL", "1") == "1":  # level again on the edited chest (the backpack lean tipped one shoulder 16 deg down in the turn)
                out = pod_exit.shoulders_down(out, out["_shw"])
            return out
        # Doug 2026-11-10: the head clears the rim by the whole body sitting a little further in (the pelvis slides toward the
        # pod's middle line, up to HEAD_SHIFT m), never by rolling the neck sideways; the direction is fixed per row
        HEAD_SHIFT = float(os.environ.get("HEAD_SHIFT", 0.03)); hdir = {}; cur_r = [0]  # the best clearance (sweep 0-8 cm: more pushes the shoulder into the pod; the nod does most of it)
        def hshift(ws):
            if os.environ.get("HEAD_CLEAR", "shift") != "shift": return Vector((0, 0, 0))
            if "hs" in ws: return hd_fixed * HEAD_SHIFT * ws["hs"]  # the final pass: the eased envelope
            if ws.get("head", 0) <= 0: return Vector((0, 0, 0))
            if cur_r[0] not in hdir: hdir[cur_r[0]] = inward("Head")
            return hdir[cur_r[0]] * HEAD_SHIFT * ws["head"]
        if os.environ.get("SHOULDER_DEBUG"):
            bb = arm.data.bones; hd = lambda n: bb["mixamorig:" + n].head_local
            cu_, cr_ = (hd("Neck") - hd("Spine")).normalized(), (hd("RightArm") - hd("LeftArm")).normalized()
            cf_ = cu_.cross(cr_)
            for sd in ("Left", "Right"):
                v = (hd(sd + "Arm") - hd(sd + "Shoulder")).normalized()
                print("SHD rest", sd, round(math.degrees(math.asin(v.dot(cu_)))), round(math.degrees(math.asin(v.dot(cf_)))))
            for r in range(0, len(TL), 10):
                print("SHD TL film %d" % (r + 1 + PRE + 165), {k: tuple(round(x) for x in v) for k, v in pod_exit.shoulder_angles(TL[r][1]).items()})
        ws_r = lambda r: dict({g: sw[g][r] for g in groups}, relax=rel[r], phase=phase(r), row=r, hs=hs_env[r])
        row_end = st[2]
        # standing in the pod (upright, up to the step over the wall): the arms hang relaxed (Doug 2026-11-10), easing in as he
        # straightens and out into the stepping balance pose as the step starts
        u0 = next((r for r in range(row_end) if TL[r][2][0].z > 0.6), row_end)
        relax_w = lambda r: 0.0 if r < 0 or os.environ.get("RELAX_ARMS", "1") != "1" else smooth((r - u0) / 12) * (1 - smooth((r - st[1] + 2) / 10))
        LAD = (0.0, 0.25, 0.5, 0.75, 1.0)
        # upright frames whose captured arms hang pinned (within 15 deg of the body, or a straight elbow) take the balance pose
        rel = [0.0 if TL[r][2][0].z <= 0.6 else 1.0 - pod_exit.arms_pinned(TL[r][1], TL[r][2]) for r in range(row_end)]
        rel = [max(rel[max(0, i - 8):i + 9]) for i in range(len(rel))]
        rel = [sum(rel[max(0, i - 6):i + 7]) / len(rel[max(0, i - 6):i + 7]) for i in range(len(rel))]
        phase = lambda r: r / 30.0
        print("ARMS BALANCE first upright row", next((r for r in range(row_end) if TL[r][2][0].z > 0.6), None), "first relaxed row", next((r for r in range(row_end) if rel[r] > 0), None), "(film frame = row + %d)" % (1 + PRE + 165))
        need = {g: [] for g in groups}; before = {g: 0 for g in groups}
        for r in range(row_end):
            cur_r[0] = r
            sc.frame_set(r + 1 + PRE)
            row = TL[r]
            cur = {g: 0.0 for g in groups}; cur["relax"] = rel[r]; cur["phase"] = phase(r); cur["row"] = r
            for g in groups:
                if g == "back" and r < len(P["takes"][0].frames()): lad = (0.0,)  # the backpack only through the turn and the step (in the get-up the chest lean moved him into the pod)
                elif g == "legs" and r >= len(P["takes"][0].frames()): lad = (0.0,)  # the knees only while he gets up (not through the stepping turn, whose feet must stay planted, nor the step over the wall)
                elif g in ("liftL", "liftR") and (r < len(P["takes"][0].frames()) or os.environ.get("LIFT_GROUPS", "0") != "1"): lad = (0.0,)  # the leg lift (off: it lifted the standing leg and floated him over the wall)
                elif g == "arms" and ARMS_SIDE and row[2][0].z > 0.6: lad = (0.0,)  # standing: the per-arm groups instead (the tuck swung both hands forward, film 355-445)
                elif g in ("armL", "armR") and not (ARMS_SIDE and row[2][0].z > 0.6): lad = (0.0,)
                else: lad = LAD
                for w in lad:
                    ws = dict(cur); ws[g] = w
                    place((row[0], edit(row[1], row[2], ws), row[2], row[3] + hshift(ws), row[4], row[5], row[6]), sm[r]); bpy.context.view_layer.update()
                    b_ = bad(g)
                    if w == 0.0 and b_: before[g] += 1
                    if not b_: break
                cur[g] = w
                need[g].append(w)
        sw = {}
        for g, ws in need.items():
            held = [max(ws[max(0, i - 8):i + 9]) for i in range(len(ws))]
            sm_ = [sum(held[max(0, i - 6):i + 7]) / len(held[max(0, i - 6):i + 7]) for i in range(len(held))]
            sw[g] = [max(a, b) for a, b in zip(sm_, ws)]
        # the head's slide (parent 2026-11-10: it must not read as a glide): one smooth envelope over the whole sit-up, easing in
        # HEAD_EASE rows before the head first needs it and out as long after, in one fixed direction, as small as clears the rim
        need_h = [i for i, w in enumerate(sw["head"]) if w > 0.05]
        E = int(os.environ.get("HEAD_EASE", 25))
        if need_h:
            h0, h1 = need_h[0], need_h[-1]
            hs_env = [smooth((i - (h0 - E)) / E) * (1 - smooth((i - h1) / E)) for i in range(len(sw["head"]))]
            dirs_ = [v for v in hdir.values() if v.length > 0.5]
            hd_fixed = (sum(dirs_, Vector()) / len(dirs_)).normalized() if dirs_ else Vector((0, 0, 0))
            print("HEAD SLIDE %.0f cm, full from pod %d to %d, easing over %d frames either side" % (HEAD_SHIFT * 100, h0 + 1 + PRE, h1 + 1 + PRE, E))
        else:
            hs_env, hd_fixed = [0.0] * len(sw["head"]), Vector((0, 0, 0))
        names = [b for b in arm.pose.bones if any(t(b.name.replace("mixamorig:", "")) for t in (is_arm, is_leg, is_head, is_chest)) or b.name.endswith(("Spine", "Spine1", "Hips"))]
        after = {g: 0 for g in groups}
        def lowest():
            ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
            z = min((ev.matrix_world @ v.co).z for v in me.vertices); ev.to_mesh_clear(); return z
        regrounded = 0
        for r in range(row_end):
            cur_r[0] = r
            sc.frame_set(r + 1 + PRE)
            row = TL[r]
            dz = 0.0
            if any(sw[g][r] > 0 for g in ("legs", "toes", "liftL", "liftR")) and r >= len(P["takes"][0].frames()) - 40:
                # bending the legs moved his lowest point off where the ground lock put it (standing: feet off the floor or into
                # it): put it back, so a standing foot stays on the floor through the turn and the step
                place(row, sm[r]); bpy.context.view_layer.update(); z0 = lowest()
                place((row[0], edit(row[1], row[2], ws_r(r)), row[2], row[3] + hshift(ws_r(r)), row[4], row[5], row[6]), sm[r]); bpy.context.view_layer.update()
                dz = z0 - lowest(); regrounded += 1
                if os.environ.get("RG_DEBUG") and r + 1 + PRE in (316, 319, 321): print("RGD", r + 1 + PRE, "z0 %.3f dz %.3f" % (z0, dz), {g: round(sw[g][r], 2) for g in groups})
            place((row[0], edit(row[1], row[2], ws_r(r)), row[2], row[3] + hshift(ws_r(r)), row[4], row[5], row[6]), sm[r] + dz)
            if os.environ.get("HEAD_DEBUG") and 110 <= r <= 136: bpy.context.view_layer.update(); print("HEADD row %d pod %d head w %.2f shift %s head at %s" % (r, r + 1 + PRE, sw["head"][r], tuple(round(v, 3) for v in hshift(ws_r(r))), tuple(round(v, 2) for v in (arm.matrix_world @ arm.pose.bones["mixamorig:Head"].head - pod_c))))
            if dz or hs_env[r] > 0: arm.pose.bones["mixamorig:Hips"].keyframe_insert("location", frame=r + 1 + PRE)  # (the head slide moves the hips too)
            for fk in ([r + 1 + PRE] if r else range(1, PRE + 2)):  # row 0 also holds through the lying frames before the motion
                for b in names: b.keyframe_insert("rotation_quaternion", frame=fk)
            bpy.context.view_layer.update()
            for g in groups: after[g] += 1 if bad(g) else 0
            if os.environ.get("BODY_DEBUG") and r + 1 + PRE in (283, 304, 325): print("BODYD", r + 1 + PRE, "row", r, "st", st[:3], {g: round(depth(g) * 100, 1) for g in DEPTH_G}, {g: round(sw[g][r], 2) for g in groups})
        P["sw"] = sw
        for g in ("armL", "armR"):  # where the rim moves one hand in, film frames, and how far at most
            sp = [r for r, w in enumerate(sw[g]) if w > 0.02]
            if sp: print("ARM IN %s film %d-%d (%d frames), at most %.2f; over 0.5 on %d frames" % (g, sp[0] + 1 + PRE + 165, sp[-1] + 1 + PRE + 165, len(sp), max(sw[g]), sum(1 for w in sw[g] if w > 0.5)), "every 6:", " ".join("%d:%.1f" % (r + 1 + PRE + 165, sw[g][r]) for r in range(sp[0], sp[-1] + 1, 6)))
        print("BODY CLEAR regrounded %d standing frames after the leg edits" % regrounded)
        print("BODY CLEAR rows 0-%d: crossing frames above 15 cm %s -> %s; eased frames %s" % (row_end - 1, before, after, {g: sum(1 for w in sw[g] if w > 0) for g in groups}))
    follow = bpy.data.objects.new("follow", None)
    sc.collection.objects.link(follow)
    for f in range(len(pel)):
        ps = pel[max(0, f - 12):f + 13]
        follow.location = sum(ps, Vector()) / len(ps)
        follow.keyframe_insert("location", frame=f + 1)

    def tracked(name, at, lens, dof=False):
        cam = lib.camera(at, pel[0], lens=lens, name=name)
        tt = cam.constraints.new("TRACK_TO")
        tt.target, tt.track_axis, tt.up_axis = follow, "TRACK_NEGATIVE_Z", "UP_Y"
        if dof and EEVEE:
            cam.data.dof.use_dof = True
            cam.data.dof.focus_object = follow
            cam.data.dof.aperture_fstop = 2.8
        return cam
    # the first film's camera plan (crash.py shot4, Doug: "the camera movement and position from the first version is best"),
    # on the 0.8x smaller pod: A = the way he steps out (west), lat_out = away from the hull (south)
    A, lat_out, s_ = Vector((-1, 0, 0)), Vector((0, -1, 0)), 0.8
    # 1 close on the pod from its open side: the seal, the lid, sitting up
    c1 = tracked("podcam", pod_c + A * 3.3 * s_ + lat_out * 1.7 * s_ + Vector((0, 0, 1.75 * s_)), 32, dof=True)
    # 2 low in front: standing, the turn, the step over the wall, the first steps toward camera
    c2 = tracked("standcam", pod_c + A * 4.6 * s_ + lat_out * 1.6 * s_ + Vector((0, 0, 0.75)), 30)
    # 3 alongside the drop and the run, riding with it
    walk = pel[min(len(pel) - 1, F(P["r_land"]) + 20 - 1)] - pel[F(st[2]) - 1]; walk.z = 0
    side = walk.cross(Vector((0, 0, 1))).normalized()
    if side.y > 0: side = -side
    c3 = tracked("limpcam", Vector(), 30)
    c3.parent = follow
    c3.location = side * 3.6 * s_ + walk.normalized() * 1.6 + Vector((0, 0, 0.5))
    # 4 down on the sand, the look toward the light, then the crane out to the game view
    to_core = Vector((core.x - end.x, core.y - end.y, 0)).normalized()
    start = end + to_core * 4.2 * s_ + Vector((-to_core.y, to_core.x, 0)) * 2.0 * s_ + Vector((0, 0, 0.6))
    c4 = tracked("dropcam", start, 30)
    f_crane0 = F(st[-1]) + 15
    # the game camera looks at a ground point 5% of the screen's height up from the hero (renderer.ts: "the hero sits a little below centre"):
    # 0.05 * 10.8 m / sin 30 deg = 1.08 m away from the camera, i.e. toward (-x, +y) at the game's 45 degree yaw
    hand = end + Vector((-0.764, 0.764, 0))
    crane = crane_path(start, hand, f_crane0, N + PRE, HAND_W)
    f_c4 = F(P["r_land"]) + 12  # cut once the landing crouch has bottomed out (slow, the pose reads the same either side); the drop stays in one shot
    key(c4, "location", [(f_c4, start), (f_crane0, start)] + [(f, p) for f, p, _ in crane], "LINEAR")
    key(c4.data, "lens", [(f_c4, 30), (f_crane0, 30)] + [(f, l) for f, _, l in crane], "LINEAR")
    # the aim follows his real hips (the posed rig), not pel: pel's height jumps where takes change floors (the walk, by 60 cm)
    hips_w = []
    for f in range(1, N + PRE + 1):
        sc.frame_set(f)
        hips_w.append((P["arm"].matrix_world @ P["arm"].pose.bones["mixamorig:Hips"].head).copy())
    aim = bpy.data.objects.new("aim", None)
    sc.collection.objects.link(aim)
    c4.constraints["Track To"].target = aim
    for f in range(F(st[2]) - 40, N + PRE + 1):  # the aim follows the commander, then eases onto the hand-off point
        t = max(0.0, (f - f_crane0) / max(1, N + PRE - f_crane0))
        e = t * t * (3 - 2 * t)
        aim.location = hips_w[min(f - 1, len(hips_w) - 1)].lerp(hand, e)
        aim.keyframe_insert("location", frame=f)
    f_stand = F(len(P["takes"][0].frames()) - 1) - 10   # the get-up is done: cut to the low camera in front of him
    # Doug (stage 2): the drop is not cut away. The low front camera holds the step-off, the fall and the landing; the next cut
    # is after he has landed (the riding drop camera c3 is left out)
    edit = [(c1, 1), (c2, f_stand), (c4, f_c4)]
    # with the drop on this camera, it eases back along his way out as he steps off and falls, so he lands whole in frame
    c2_at = c2.location.copy()
    key(c2, "location", [(F(st[2]) - 20, c2_at)] + [(f, c2_at + A * 1.3 * smooth((f - F(st[2]) + 20) / max(1, F(P["r_land"]) - F(st[2]) + 20))) for f in range(F(st[2]) - 19, F(P["r_land"]) + 1)], "LINEAR")
    for cam, f0 in edit:
        sc.timeline_markers.new(cam.name, frame=f0).camera = cam
    if EEVEE:  # the emergency light and the seal's flash (crash.py shot4, on the smaller site)
        red = lib.point(pod_c + Vector((-1.6, 1.4, 1.5)), "#ff3424", 0, radius=0.15, name="emergency")
        # Doug 2026-11-10: the game's opening view has no red glow; it fades out over the crane's last two seconds or so
        f_red0, f_red1 = N + PRE - 70, N + PRE - 20
        for f in range(1, N + PRE + 1, 2):
            red.data.energy = (110 + 80 * math.sin(f / 30 * 6.283)) * (1 - smooth((f - f_red0) / (f_red1 - f_red0)))
            red.data.keyframe_insert("energy", frame=f)
        seal = lib.point(pod_c + Vector((0, 0, 1.1)), "#cfe6ff", 0, radius=0.2, name="seal")
        key(seal.data, "energy", [(4, 0), (6, 600), (30, 60), (90, 0)])
        if os.environ.get("SUN_MATCH", "1") == "1":
            # Doug 2026-11-10: the film ended darker than the game's opening view. Measured on the hand-off frame: open sand
            # matches the game within ~10% (the game a little bluer); the difference is the red glow (faded above), and the
            # low film sun (25 deg) laying the wreck's long shadow over the end spot, with dim shadows. Over the crane's last
            # two seconds or so the sun turns to the game's (environment.ts SUN_OFS: from the west-south-west, 47 deg up),
            # the shadows lift and the light cools a little, so the last frame is lit like the game's first
            f_s0, f_s1 = N + PRE - int(os.environ.get("SUN_MATCH_FRAMES", 70)), N + PRE - 10
            q0 = sun_ob.rotation_euler.to_quaternion()
            game_sun = Vector((-400, -140, 460)).normalized()  # three (x, up, z south) -> Blender (x, y north, z up)
            q1 = (-game_sun).to_track_quat("-Z", "Y")
            bg = sc.world.node_tree.nodes["Background"].inputs["Strength"]
            amb0, amb1 = bg.default_value, bg.default_value * float(os.environ.get("SUN_MATCH_AMB", 1.8))
            c0, c1 = Vector(sun_ob.data.color), Vector(lib.rgb("#e6b98f")[:3])
            sun_ob.rotation_mode = "QUATERNION"
            for f in range(f_s0 - 1, N + PRE + 1):
                t = smooth((f - f_s0) / (f_s1 - f_s0))
                sun_ob.rotation_quaternion = q0.slerp(q1, t); sun_ob.keyframe_insert("rotation_quaternion", frame=f)
                bg.default_value = amb0 + (amb1 - amb0) * t; bg.keyframe_insert("default_value", frame=f)
                sun_ob.data.color = c0.lerp(c1, t); sun_ob.data.keyframe_insert("color", frame=f)
    sc.frame_start, sc.frame_end = 1, N + PRE
    print(f"FILM {N + PRE} frames; cuts at {[f for _, f in edit]}; crane from {f_crane0}")

    if "--cutprobe" in args:  # debug: the active camera's place, aim and lens either side of the last cut
        for f in list(range(f_c4 - 2, f_c4 + 3)) + list(range(376, 384)):
            sc.frame_set(f); cam = sc.camera
            m = cam.matrix_world; fw = -m.to_3x3().col[2]
            print("CUTPROBE", f, cam.name, tuple(round(v, 3) for v in m.translation), "fwd", tuple(round(v, 3) for v in fw), "lens", round(cam.data.lens, 2))
        return
    if "--rockprobe" in args:  # debug: rock heights, and frames where the active camera is inside a rock's box
        rocks = [o for o in sc.objects if o.name.startswith("rock_") and not o.hide_render]
        bb = [[o.matrix_world @ Vector(c) for c in o.bound_box] for o in rocks]
        print("ROCKPROBE", len(rocks), "rocks; tallest %.2f m" % max(max(v.z for v in b) for b in bb))
        inside = []
        for f in range(1, N + PRE + 1, 2):
            sc.frame_set(f); cl = sc.camera.matrix_world.translation
            for o, b in zip(rocks, bb):
                if all(min(v[i] for v in b) <= cl[i] <= max(v[i] for v in b) for i in range(3)): inside.append((f, sc.camera.name, o.name)); break
        print("ROCKPROBE camera inside a rock box on", len(inside), "sampled frames:", inside[:6], "...", inside[-3:])
        return
    if "--camprobe" in args:  # debug: where the active camera is, and which objects' boxes hold it
        for f in (340, 364, 380, 420, 450):
            sc.frame_set(f)
            cam = sc.camera; cl = cam.matrix_world.translation
            inside = []
            for o in sc.objects:
                if o.type != "MESH" or o.hide_render: continue
                bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
                if all(min(v[i] for v in bb) - 0.05 <= cl[i] <= max(v[i] for v in bb) + 0.05 for i in range(3)): inside.append(o.name)
            if f == 340: print("CUBES", [(o.name, tuple(round(v, 2) for v in (o.matrix_world.translation - pod_c)), tuple(round(v, 2) for v in o.dimensions), o.data.name, [m.name for m in o.data.materials][:2]) for o in sc.objects if o.name.startswith("Cube")])
            print("CAMPROBE", f, cam.name, tuple(round(v - pod_c[i], 2) if i < 2 else round(v, 2) for i, v in enumerate(cl)), "commander", tuple(round(v, 2) for v in (pel[min(f - 1, len(pel) - 1)] - pod_c)), inside[:6])
        return
    if "--top" in args:  # debug: straight down on the pod, lying and stepping out
        sc.timeline_markers.clear()
        top = lib.camera(pod_c + Vector((0, 0.01, 5.5)), pod_c, lens=40, name="top")
        sc.camera = top
        for f in (120, 166, 178, 190, 223, 262, 290, 310):
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
    if "--clip" in args:  # numeric check: where the suit's surface actually crosses the pod's, every 3rd frame
        from mathutils.bvhtree import BVHTree
        dg = bpy.context.evaluated_depsgraph_get()
        def tris(objs):
            vs, ps = [], []
            for o in objs:
                ev = o.evaluated_get(dg); me = ev.to_mesh(); me.calc_loop_triangles()
                base = len(vs); vs += [ev.matrix_world @ v.co for v in me.vertices]
                ps += [tuple(base + i for i in t.vertices) for t in me.loop_triangles]
                ev.to_mesh_clear()
            return vs, ps
        pv, pp = tris([o for o in [pod] + list(pod.children_recursive) if o.type == "MESH"])
        pbvh = BVHTree.FromPolygons(pv, pp)
        rows = []
        for f in range(1, N + PRE + 1, 3):
            sc.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            bv, bp_ = tris([P["body"]])
            bb_ = BVHTree.FromPolygons(bv, bp_)
            hits = pbvh.overlap(bb_)
            lv_, lp_ = tris([o for o in [lid] + list(lid.children_recursive) if o.type == "MESH"])
            lid_hits = len(BVHTree.FromPolygons(lv_, lp_).overlap(bb_))
            if hits:
                cs = [sum((bv[i] for i in bp_[b_]), Vector()) / 3 for _, b_ in hits]
                if os.environ.get("CLIP_PARTS"):
                    arm_ = P["arm"]; hb = {b.name.replace("mixamorig:", ""): arm_.matrix_world @ ((b.head + b.tail) / 2) for b in arm_.pose.bones}
                    cnt = {}
                    for c in cs:
                        n = min(hb, key=lambda k: (hb[k] - c).length); cnt[n] = cnt.get(n, 0) + 1
                    where = {}
                    for c in cs:
                        n = min(hb, key=lambda k: (hb[k] - c).length); d = c - pod_c
                        where.setdefault(n, []).append(d)
                    print("CLIPPART", f, [(n, len(v), "z%.2f x%.2f y%.2f" % (sum(q.z for q in v) / len(v), sum(q.x for q in v) / len(v), sum(q.y for q in v) / len(v))) for n, v in sorted(where.items(), key=lambda kv: -len(kv[1]))[:3]])
                rows.append((f, lid_hits, len(hits), sum(1 for c in cs if c.z > 0.8), round(max(c.z for c in cs), 2), round(sum(c.x for c in cs) / len(cs) - pod_c.x, 2), round(sum(c.y for c in cs) / len(cs) - pod_c.y, 2)))
        print("CLIP frames with suit/pod crossings (frame, glass pairs, pod pairs, pairs above 0.8 m, max z, mean x, mean y from pod origin):")
        for r in rows: print("CLIP", r)
        print("CLIP total frames", len(rows))
        # depth, normal-free: from a suit point, cast toward the pod's middle line (across and along) and straight up; an odd
        # number of pod surfaces before the middle means the point is inside the pod's solid (a wall, an end, the floor),
        # and the first hit is how deep. Up to 2 cm is resting contact (back on the wall, feet on the floor); deeper is
        # sinking or a limb through the pod
        arm_ = P["arm"]
        mid = pod_c + POD_IN
        def odd_depth(q, d, reach):
            n_, first, o_ = 0, None, q.copy()
            for _ in range(8):
                loc, _nrm, _i, dist = pbvh.ray_cast(o_, d, reach)
                if loc is None: break
                n_ += 1; reach -= dist
                if first is None: first = (loc - q).length
                o_ = loc + d * 1e-4
                if reach <= 0: break
            return first if n_ % 2 == 1 else None
        rest_f, deep = 0, []
        for f in [r[0] for r in rows]:
            sc.frame_set(f)
            ev = P["body"].evaluated_get(bpy.context.evaluated_depsgraph_get()); me = ev.to_mesh()
            worst, wp = 0.0, None
            camp = sc.camera.matrix_world.translation.copy(); vworst = 0.0
            for v in list(me.vertices)[::2]:
                q = ev.matrix_world @ v.co
                if abs(q.x - mid.x) > 0.85 or abs(q.y - mid.y) > 1.4 or q.z > 1.2: continue
                cands = []
                if abs(q.x - mid.x) > 1e-3: cands.append(odd_depth(q, Vector((1 if mid.x > q.x else -1, 0, 0)), abs(mid.x - q.x)))
                if abs(q.y - mid.y) > 0.6: cands.append(odd_depth(q, Vector((0, 1 if mid.y > q.y else -1, 0)), abs(mid.y - q.y)))
                cands.append(odd_depth(q, Vector((0, 0, 1)), 0.5))
                ds = [c for c in cands if c is not None]
                if len(ds) == len(cands) and ds:  # inside on every test: truly in the solid
                    if min(ds) > worst: worst, wp = min(ds), q
                    if min(ds) > 0.02 and min(ds) > vworst:  # seen by the film's camera? (no pod surface in front of the point's way in)
                        dv = q - camp; L = dv.length; dv.normalize()
                        loc, _n, _i, dist = pbvh.ray_cast(camp, dv, L)
                        if loc is None or dist > L - min(ds) - 0.03: vworst = min(ds)
            ev.to_mesh_clear()
            if worst <= 0.02: rest_f += 1
            else:
                hb = {b.name.replace("mixamorig:", ""): arm_.matrix_world @ ((b.head + b.tail) / 2) for b in arm_.pose.bones}
                deep.append((f, round(worst * 100, 1), min(hb, key=lambda k: (hb[k] - wp).length), "seen %.1f" % (vworst * 100) if vworst > 0.02 else "hidden"))
        print(f"CLIP DEPTH: resting contact (2 cm deep or less) on {rest_f} of {len(rows)} touching frames; deeper (sinking or pass-through) on {len(deep)}: {deep}")
        seen = [d for d in deep if d[3] != "hidden"]
        print(f"CLIP SEEN: deeper than 2 cm where the film's camera sees it on {len(seen)} frames: {[(d[0], d[3]) for d in seen]}; hidden from the camera on {len(deep) - len(seen)}")
        return
    if "--height" in args:  # supporting foot off the sand: the lower foot's sole more than 3 cm above the sand under it (ray down), landing to the end
        body = P["body"]; bad = []; lows = []
        fg = {g.index: ("L" if "Left" in g.name else "R") for g in body.vertex_groups if ("Foot" in g.name or "Toe" in g.name)}
        fv = {v.index: fg[max(v.groups, key=lambda g: g.weight).group] for v in body.data.vertices if v.groups and max(v.groups, key=lambda g: g.weight).group in fg}
        hide = [cmd] + list(cmd.children_recursive) + [pod] + list(pod.children_recursive)  # the pod floor is at sand level: measure against the sand
        h_a, h_b = (int(x) for x in os.environ.get("HEIGHT_RANGE", f"{F(P['r_land'])},{N + PRE}").split(","))
        for f in range(h_a, h_b + 1):
            sc.frame_set(f)
            dg = bpy.context.evaluated_depsgraph_get()
            ev = body.evaluated_get(dg); me = ev.to_mesh()
            low = {}
            for i_, sd in fv.items():
                p_ = ev.matrix_world @ me.vertices[i_].co
                if sd not in low or p_.z < low[sd].z: low[sd] = p_
            ev.to_mesh_clear()
            gap = {}
            for sd, p_ in low.items():
                o_ = p_ + Vector((0, 0, 0.6)); g_ = None
                for _ in range(6):  # step past the suit's own surface
                    hit, loc, _n, _i, ob, _m = sc.ray_cast(dg, o_, Vector((0, 0, -1)))
                    if not hit: break
                    if ob in hide or ob.name.startswith("commander"): o_ = loc + Vector((0, 0, -0.001)); continue
                    g_ = loc.z; gob = ob.name; break
                gap[sd] = p_.z if os.environ.get("HEIGHT_FLAT") else p_.z - (g_ if g_ is not None else 0.0)  # flat: the sand is at 0 here (the pod floor too)
                if os.environ.get("HEIGHT_DEBUG") and 378 <= f <= 390: print("HEIGHTD", f, sd, "foot z %.3f ground %s on %s xy %.2f %.2f" % (p_.z, None if g_ is None else round(g_, 3), gob if g_ is not None else "-", p_.x - pod_c.x, p_.y - pod_c.y))
            sup = min(gap.values())
            lows.append((f, sup))
            if os.environ.get("HEIGHT_RANGE"): print("HEIGHTF film %d pod %d: lowest foot %.1f cm above what is under it (L %.1f R %.1f); hips %.2f m" % (f + 165, f, sup * 100, gap.get("L", 0) * 100, gap.get("R", 0) * 100, (P["arm"].matrix_world @ P["arm"].pose.bones["mixamorig:Hips"].head).z))
            if sup > 0.03: bad.append((f, round(sup * 100, 1)))
        runs, cur = [], []
        for f, z in bad:
            if cur and f != cur[-1][0] + 1: runs.append(cur); cur = []
            cur.append((f, z))
        if cur: runs.append(cur)
        print(f"HEIGHT frames {F(P['r_land'])}-{N + PRE}: supporting foot above the sand max {max(z for _, z in lows) * 100:.1f} cm, into it {min(z for _, z in lows) * 100:.1f} cm; frames over 3 cm: {len(bad)} in runs {[(r[0][0], r[-1][0], max(z for _, z in r)) for r in runs]}")
        return
    if "--sitslide" in args:  # while he sits up: how far the hips and feet that rest on the pod floor move sideways per frame
        arm = P["arm"]; js = ["Hips", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]; prev = None; rows = []
        a_, b_ = (int(x) for x in os.environ.get("SIT_RANGE", "100,270").split(","))
        for f in range(a_, b_ + 1):
            sc.frame_set(f)
            pos = {j: arm.matrix_world @ arm.pose.bones["mixamorig:" + j].head for j in js}
            if prev:
                low = [j for j in js if pos[j].z < (0.35 if j == "Hips" else 0.12)]  # resting on the floor
                rows.append((f, max([(pos[j].xy - prev[j].xy).length for j in low] or [0.0]), low))
                if os.environ.get("SIT_DEBUG") and f % 5 == 0: print("SITD", f, {j: (round(pos[j].x, 3), round(pos[j].y, 3), round(pos[j].z, 2)) for j in ("Hips", "LeftFoot")})
            prev = pos
        big = [(f, round(d * 100, 1)) for f, d, _ in rows if d > 0.01]
        print("SITSLIDE pod %d-%d: worst resting hips/foot move %.2f cm/frame, mean %.2f; frames over 1 cm: %d %s" % (a_, b_, max(d for _, d, _ in rows) * 100, sum(d for _, d, _ in rows) / len(rows) * 100, len(big), big[:12]))
        return
    if "--headroll" in args:  # head roll: the head's sideways tilt against the chest (about the facing axis) and against the world vertical
        arm = P["arm"]; sw_ = P.get("sw", {}).get("head", []); swc = P.get("sw", {}).get("chest", [])
        a_, b_ = (int(x) for x in os.environ.get("HEADROLL_RANGE", f"{1 + PRE},{N + PRE}").split(","))
        prev, worst = None, []
        for f in range(a_, b_ + 1):
            sc.frame_set(f)
            M = lambda n: (arm.matrix_world @ arm.pose.bones["mixamorig:" + n].matrix).to_3x3()
            ch, hd = M("Spine2"), M("Head")
            hl = (arm.matrix_world @ arm.pose.bones["mixamorig:RightUpLeg"].head) - (arm.matrix_world @ arm.pose.bones["mixamorig:LeftUpLeg"].head)
            rh = Vector((hl.x, hl.y, 0)).normalized()  # sideways: the hip line, level
            # sideways lean: the angle out of the plane of the vertical and his facing (as pod_exit.head_level limits it)
            rw = math.degrees(math.asin(max(-1, min(1, hd.col[1].normalized().dot(rh)))))
            cw = math.degrees(math.asin(max(-1, min(1, ch.col[1].normalized().dot(rh)))))
            rc = rw - cw
            yaw = math.degrees(math.atan2(hd.col[2].y, hd.col[2].x))
            r_ = f - 1 - PRE
            w_ = sw_[r_] if 0 <= r_ < len(sw_) else 0.0
            d = abs(rw - prev) if prev is not None else 0.0; prev = rw
            worst.append((f, d))
            if (f - a_) % int(os.environ.get("HEADROLL_STEP", 3)) == 0:
                print("HEADROLL film %d pod %d row %d: roll vs chest %+.1f, vs vertical %+.1f, chest vs vertical %+.1f, head yaw %.0f, head-clear %.2f chest-clear %.2f" % (f + 165, f, r_, rc, rw, cw, yaw, w_, swc[r_] if 0 <= r_ < len(swc) else 0.0))
        print("HEADROLL worst change %.1f deg/frame at pod %d" % max((d, f) for f, d in worst))
        return
    if "--hands" in args:  # hand spin: how far each hand turns about its forearm per frame (the get-up to the drop)
        arm = P["arm"]; worst = []
        prev = {}
        for f in range(1 + PRE, F(st[2]) + 1):
            sc.frame_set(f)
            for side in ("Left", "Right"):
                fa = arm.matrix_world @ arm.pose.bones["mixamorig:" + side + "ForeArm"].matrix
                hd = arm.matrix_world @ arm.pose.bones["mixamorig:" + side + "Hand"].matrix
                ax_ = fa.to_3x3().col[1].normalized()
                ref = fa.to_3x3().col[0]; v = hd.to_3x3().col[0]
                ref = (ref - ax_ * ref.dot(ax_)).normalized(); v = (v - ax_ * v.dot(ax_)).normalized()
                a = math.degrees(math.atan2(ax_.dot(ref.cross(v)), ref.dot(v)))
                if side in prev: worst.append((f, side, abs((a - prev[side] + 180) % 360 - 180)))
                prev[side] = a
        big = [(f, s_, round(d, 1)) for f, s_, d in worst if d > 3]
        print(f"HANDS frames {1 + PRE}-{F(st[2])}: worst hand twist about the forearm {max(d for _, _, d in worst):.1f} deg/frame; frames over 3 deg: {len(big)} {big[:10]}")
        return
    if "--frontcrop" in args:  # review: the film's own camera at high resolution, cropped each frame to his body (FRONT_RANGE, pod frames)
        from bpy_extras.object_utils import world_to_camera_view
        arm = P["arm"]; Fd = os.path.join(lib.HERE, "out", "frontcrop"); os.makedirs(Fd, exist_ok=True)
        sc.render.resolution_x, sc.render.resolution_y = 1080, 1920
        sc.render.use_border, sc.render.use_crop_to_border = True, True
        a_, b_ = (int(x) for x in os.environ.get("FRONT_RANGE", "300,347").split(","))
        for f in range(a_, b_ + 1, int(os.environ.get("FRONT_STEP", 2))):
            sc.frame_set(f)
            cam = max((m for m in sc.timeline_markers if m.frame <= f), key=lambda m: m.frame).camera
            sc.camera = cam
            upper = ("Spine2", "Neck", "Head", "Shoulder", "LeftArm", "RightArm", "ForeArm") if os.environ.get("FRONT_PART") == "upper" else None  # shoulders and upper arms
            pts = [world_to_camera_view(sc, cam, arm.matrix_world @ b.head) for b in arm.pose.bones if upper is None or (any(k in b.name for k in upper) and "Hand" not in b.name and "HeadTop" not in b.name)]
            xs, ys = [p.x for p in pts], [p.y for p in pts]
            cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2; hh = (max(ys) - min(ys)) * (1.3 if upper else 0.65) + (0.05 if upper else 0.02)
            hw = hh * 1920 / 1080 * 0.75
            sc.render.border_min_x, sc.render.border_max_x = max(0, cx - hw), min(1, cx + hw)
            sc.render.border_min_y, sc.render.border_max_y = max(0, cy - hh), min(1, cy + hh)
            lib.render_still(os.path.join(Fd, f"front_{f + 165:04d}.png"))
        return
    if "--closecam" in args:  # review crops: a close camera on one body part (CLOSE_PART head|arms|feet), every CLOSE_STEP frames over CLOSE_RANGE (pod frames)
        sc.timeline_markers.clear()
        part = os.environ.get("CLOSE_PART", "arms")
        bone, (d_f, d_r, d_z), lens = {"head": ("Head", (1.0, 0.35, 0.2), 70), "arms": ("Spine1", (1.6, 0.6, 0.55), 45), "shoulders": ("Spine2", (-0.35, float(os.environ.get("SHOULDER_SIDE", 1.5)), 0.12), 45),  # (shoulders: from the side, a little behind, at shoulder height)
                                       "feet": ("Hips", (1.3, 0.5, 1.4), 40)}[part]  # (forward, right, up) from the body: in front of him
        cc = lib.camera(pod_c + Vector((2, -2, 1)), pod_c, lens=lens, name="closecam")
        sc.camera = cc
        sc.render.resolution_x = sc.render.resolution_y = int(os.environ.get("CLOSE_RES", 300))
        arm = P["arm"]; Cd = os.path.join(lib.HERE, "out", "close_" + part); os.makedirs(Cd, exist_ok=True)
        if os.environ.get("CLOSE_NOGLASS", "1") == "1":
            for o in [lid] + list(lid.children_recursive): o.hide_render = True
        a_, b_ = (int(x) for x in os.environ.get("CLOSE_RANGE", f"1,{N + PRE}").split(","))
        for f in range(a_, b_ + 1, int(os.environ.get("CLOSE_STEP", 2))):
            sc.frame_set(f)
            c = arm.matrix_world @ arm.pose.bones["mixamorig:" + bone].head
            if part == "feet": c = Vector((c.x, c.y, 0.25))
            hm = (arm.matrix_world @ arm.pose.bones["mixamorig:Hips"].matrix).to_3x3()
            fw = Vector((hm.col[2].x, hm.col[2].y, 0)).normalized(); rt = Vector((-fw.y, fw.x, 0)) * -1
            if part == "feet": c = Vector((c.x, c.y, 0.1))
            sm_f = fw if f == a_ else (sm_f * 0.85 + fw * 0.15).normalized()  # the camera follows his turn smoothly
            rt = Vector((sm_f.y, -sm_f.x, 0))
            cc.location = c + sm_f * d_f + rt * d_r + Vector((0, 0, d_z))
            cc.rotation_euler = (c - cc.location).to_track_quat("-Z", "Y").to_euler()
            lib.render_still(os.path.join(Cd, f"{part}_{f + 165:04d}.png"))
        return
    if "--handcam" in args:  # debug: a close camera on his chest and hands, every 3rd frame from the start to the drop
        sc.timeline_markers.clear()
        hc = lib.camera(pod_c + Vector((1.4, -1.3, 1.3)), pod_c, lens=55, name="handcam")
        sc.camera = hc
        arm = P["arm"]; Hd = os.path.join(lib.HERE, "out", "handcam"); os.makedirs(Hd, exist_ok=True)
        for o in [lid] + list(lid.children_recursive): o.hide_render = True  # the glass would hide his hands
        for f in range(1, F(st[2]) + 1, 3):
            sc.frame_set(f)
            c = arm.matrix_world @ arm.pose.bones["mixamorig:Spine1"].head
            hc.location = c + Vector((-1.0, -0.8, 0.75))  # in front of him (he steps out west), above the low west wall
            hc.rotation_euler = (c - hc.location).to_track_quat("-Z", "Y").to_euler()
            lib.render_still(os.path.join(Hd, f"h_{f:04d}.png"))
        return
    if "--shoulders" in args:  # per frame (SHOULDERS_RANGE, film frames): each clavicle's lift above the shoulder line (chest frame) and
        # each upper arm's pitch forward of vertical (+ forward, - back, in his facing plane) and its lean out to the side; then the
        # same for the first standing frames of the 01_07 walk capture, the natural reference
        import retarget
        arm = P["arm"]; pb = lambda n: arm.matrix_world @ arm.pose.bones["mixamorig:" + n].head
        Z = Vector((0, 0, 1))
        def angs(sh, ar, fa, cu, fwd):
            cr_ = None
            out_ = {}
            for sd in ("Left", "Right"):
                c = (ar[sd] - sh[sd]).normalized(); u = (fa[sd] - ar[sd]).normalized()
                lift = math.degrees(math.asin(max(-1, min(1, c.dot(cu)))))
                pitch = math.degrees(math.atan2(u.dot(fwd), -u.dot(Z)))
                side = math.degrees(math.atan2(abs(u.dot(fwd.cross(Z))), -u.dot(Z)))
                out_[sd] = (round(lift), round(pitch), round(side))
            return out_
        a_, b_ = (int(x) for x in os.environ.get("SHOULDERS_RANGE", "395,470").split(","))
        sw_ = P.get("sw", {})
        for film in range(a_, b_ + 1):
            f = film - 165; sc.frame_set(f)
            cu = (pb("Neck") - pb("Spine")).normalized()
            hm = (arm.matrix_world @ arm.pose.bones["mixamorig:Hips"].matrix).to_3x3()
            fwd = Vector((hm.col[2].x, hm.col[2].y, 0)).normalized()
            g = lambda n: {sd: pb(sd + n) for sd in ("Left", "Right")}
            r = f - 1 - PRE
            print("SHOULDERS film %d" % film, angs(g("Shoulder"), g("Arm"), g("ForeArm"), cu, fwd),
                  "spine pitch %d" % round(math.degrees(math.atan2(cu.dot(fwd), cu.z))),
                  "arms-in weight %.2f" % (sw_["arms"][r] if "arms" in sw_ and 0 <= r < len(sw_["arms"]) else -1))
        clip = pod_exit.mocap.Clip("01_07", src_fps=120, fps=30)
        acc = []
        for i in range(0, 15):
            seg, _, _ = clip.pose(i); d = retarget.mocap_dirs(seg)
            _, up_, right_ = retarget.pelvis(seg)
            cu = d["_chest_up"].normalized(); fwd = up_.cross(right_); fwd = Vector((fwd.x, fwd.y, 0)).normalized()
            sh = {sd: Vector() for sd in ("Left", "Right")}
            ar = {sd: d[sd + "Shoulder"] for sd in sh}; fa = {sd: d[sd + "Shoulder"] + d[sd + "Arm"] for sd in sh}
            acc.append(angs(sh, ar, fa, cu, fwd))
        print("SHOULDERS reference 01_07 frames 0-14:", acc[0], acc[7], acc[14])
        return
    if "--arms" in args:  # pinned arms: each arm's angle out from the torso and its elbow bend per frame; runs of more than 10
        # frames with the upper arm within 8 deg of the torso and a straight elbow (under 15 deg) while he is up (not lying)
        arm = P["arm"]; pb = lambda n: arm.matrix_world @ arm.pose.bones["mixamorig:" + n].head
        runs, cur_ = {"Left": [], "Right": []}, {"Left": [], "Right": []}
        worst = {"Left": 180.0, "Right": 180.0}
        for f in range(1, N + PRE + 1):
            sc.frame_set(f)
            down = (pb("Hips") - pb("Neck")).normalized()
            for sd in ("Left", "Right"):
                sh_, el, wr = pb(sd + "Arm"), pb(sd + "ForeArm"), pb(sd + "Hand")
                a = math.degrees((el - sh_).angle(down)); b = math.degrees((el - sh_).angle(wr - el))
                lying = down.z > -0.6
                if not lying: worst[sd] = min(worst[sd], max(a, 0))
                if not lying and a < 8 and b < 15: cur_[sd].append((f, round(a, 1), round(b, 1)))
                else:
                    if len(cur_[sd]) > 10: runs[sd].append((cur_[sd][0][0], cur_[sd][-1][0]))
                    cur_[sd] = []
        for sd in ("Left", "Right"):
            if len(cur_[sd]) > 10: runs[sd].append((cur_[sd][0][0], cur_[sd][-1][0]))
        if os.environ.get("ARMS_RANGE"):
            a_, b_ = (int(x) for x in os.environ["ARMS_RANGE"].split(","))
            for f in range(a_, b_ + 1, 4):
                sc.frame_set(f); down = (pb("Hips") - pb("Neck")).normalized()
                print("ARMSF film %d pod %d" % (f + 165, f), " ".join("%s out %.0f bend %.0f" % (sd[0], math.degrees((pb(sd + "ForeArm") - pb(sd + "Arm")).angle(down)), math.degrees((pb(sd + "ForeArm") - pb(sd + "Arm")).angle(pb(sd + "Hand") - pb(sd + "ForeArm")))) for sd in ("Left", "Right")))
        print(f"ARMS pinned runs (over 10 frames, upper arm under 8 deg from the torso and elbow under 15 deg, not lying): left {runs['Left']} right {runs['Right']}; least angle out while up: left {worst['Left']:.0f} right {worst['Right']:.0f} deg")
        return
    if "--feet" in args:  # foot slide, landing to the end: a joint (ball or ankle) counts as planted within 2 cm of its own lowest
        # point in this stretch (a fixed height misreads: the joints sit 5-6 cm up inside the boot); report how far planted joints
        # move sideways per frame. Limit: under 1 cm a frame (about a third of what the eye picks up at phone size)
        import retarget
        arm, pos = P["arm"], {}
        fr = list(range(int(os.environ.get("FEET_FROM", F(P["r_land"]))), N + PRE + 1))
        keys = [(s, b) for s in ("Left", "Right") for b in ("ToeBase", "Foot")]
        for f in fr:
            sc.frame_set(f)
            for s, b in keys: pos.setdefault(s + b, []).append((arm.matrix_world @ arm.pose.bones[retarget.P + s + b].head).copy())
        lo = {k: min(p.z for p in v) for k, v in pos.items()}
        per = []
        for i in range(1, len(fr)):
            w = 0.0
            pl = [k for k, v in pos.items() if v[i].z < lo[k] + 0.02 and v[i - 1].z < lo[k] + 0.02]
            # a heel pivot (the stepping turn: the ball sweeps round a planted, still ankle) is no skate either
            heel = {k[:-4] for k in pl if k.endswith("Foot") and (pos[k][i].xy - pos[k][i - 1].xy).length < 0.003}
            pl = [k for k in pl if not (k.endswith("ToeBase") and k[:-7] in heel)]
            pl = [k for k in pl if not (k.endswith("Foot") and k[:-4] + "ToeBase" in pl)]  # an ankle pivoting round a planted ball is no skate
            for k in pl: w = max(w, (pos[k][i].xy - pos[k][i - 1].xy).length)
            per.append((fr[i], w))
            if os.environ.get("FEET_DEBUG") and w > 0.01: print("FEETD", fr[i], [(k, round((pos[k][i].xy - pos[k][i - 1].xy).length * 100, 1), round((pos[k][i].z - lo[k]) * 100, 1)) for k in pos])
        bad = [(f, round(w * 100, 1)) for f, w in per if w > 0.01]
        f_s = int(os.environ.get("FEET_STAND", 1 + PRE + P["starts"][-1] + 15))  # standing: from the crane's start (he has stopped) to the end
        st_ = [w for f, w in per if f > f_s]
        run = best = 0
        for w in st_:
            run = run + 1 if w > 0.002 else 0; best = max(best, run)
        print(f"FEET standing from {f_s}: planted drift total {sum(st_) * 100:.1f} cm over {len(st_)} frames, worst {max(st_) * 100:.2f} cm, longest run over 0.2 cm a frame {best} frames")
        print(f"FEET frames {fr[0]}-{fr[-1]}: worst planted-foot slide {max(w for _, w in per) * 100:.1f} cm/frame, "
              f"mean {sum(w for _, w in per) / len(per) * 100:.2f}, total {sum(w for _, w in per) * 100:.0f} cm; frames over 1 cm: {len(bad)} {bad[:14]}")
        return
    if "--approval" in args:  # game-camera stills for approval: the film's first frame, its last, and the held level-1 start spot
        import game_set as gs
        sc.timeline_markers.clear()
        A = os.path.join(lib.HERE, "out", "approval"); os.makedirs(A, exist_ok=True)
        sc.render.resolution_x, sc.render.resolution_y = 540, 960
        sc.frame_set(1)
        sc.camera = lib.game_camera(tuple(pod_c + Vector((0, 0, 0.3))), view_w=HAND_W)
        lib.render_still(os.path.join(A, "c2_game_camera_first_film_frame.png"))
        sc.frame_set(N + PRE)
        sc.camera = lib.game_camera(tuple(end + Vector((0, 0, 0.9))), view_w=HAND_W)
        lib.render_still(os.path.join(A, "c3_game_camera_film_end_new_start.png"))
        held = pod_c + Vector(((451.7 - 559.0) / 28, -(138.9 - 125.0) / 28, 0))
        for o in [cmd] + list(cmd.children_recursive): o.hide_render = True
        gs.stand_in(held, yaw=-60)
        sc.camera = lib.game_camera(tuple(held + Vector((0, 0, 0.9))), view_w=HAND_W)
        lib.render_still(os.path.join(A, "c1_game_camera_held_start_451.7_138.9.png"))
        print("HELD start from pod0 (m)", round(held.x - pod_c.x, 2), round(held.y - pod_c.y, 2), "film end", round(end.x, 2), round(end.y, 2), "= game units", round(559 + end.x * 28, 1), round(125 - end.y * 28, 1))
        return
    if "--iso" in args:  # debug: the lying frames from the game camera and a low side view
        sc.timeline_markers.clear()
        for nm, cam in (("game", lib.game_camera(tuple(pod_c + Vector((0, 0, 0.3))), view_w=4.0)), ("east", lib.camera(pod_c + Vector((0.2, -7, 1.0)), pod_c + Vector((0, 0, 0.6)), lens=70, name="e"))):
            sc.camera = cam
            for f in (172, 184, 223):
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
        for f in (284, 292, 300, 308, 316, 324, 332, 340):
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
        for f in ([int(x) for x in args[args.index("--at") + 1].split(",")] if "--at" in args else (1, f_open1, F(st[1]) + 20, F(st[1]) + 60, F(P["r_takeoff"]) + 8, F(P["r_land"]) + 4, F(st[-1]) + 10, f_crane0 + (N + PRE - f_crane0) // 2, N + PRE)):
            sc.frame_set(f)
            cam = max((m for m in sc.timeline_markers if m.frame <= f), key=lambda m: m.frame).camera
            sc.camera = cam
            lib.render_still(os.path.join(OUT, f"still_{f:04d}.png"))
        return
    if "--list" in args:  # re-render single frames (Workbench now and then writes a glitched yellow frame)
        for f in (int(x) for x in args[args.index("--list") + 1].split(",") if x):
            lib.render_frames(OUT + "_frames", f, f)
        return
    if "--flat" in args:  # motion-only: no lighting, no textures, one flat colour per thing, with outlines
        shd = sc.display.shading
        shd.light, shd.color_type, shd.show_shadows, shd.show_object_outline = "FLAT", "OBJECT", False, True
        shd.object_outline_color = (0, 0, 0)
        sc.world.color = (0.82, 0.82, 0.82)
        for o in bpy.data.objects:
            if o.type == "MESH": o.color = (0.45, 0.45, 0.47, 1)
        for o in cmd.children_recursive:
            if o.type == "MESH": o.color = (1.0, 0.55, 0.15, 1)
        for o in lid.children_recursive:
            if o.type == "MESH": o.color = (0.35, 0.6, 0.8, 1)
        lib.render_frames(OUT + "_flat_frames", 1, N + PRE)
        return
    a, b = (int(args[args.index("--frames") + 1]), int(args[args.index("--frames") + 2])) if "--frames" in args else (1, N + PRE)
    lib.render_frames(OUT + "_frames", a, b)


main()
