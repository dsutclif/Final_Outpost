# crash_open: the cinematic before level 1 (docs/STORY-LEVELS.md), 30 fps:
#   1 descent    f1-75     the Halcyon dives through the storm; the pulse flashes, the engines cut out
#   2 impact     f76-105   wide: it hits the plain; flash, dust plume, camera shake
#   3 the wreck  f106-165  dawn: the broken Halcyon on the plain, red light glowing in the break
#   4 the pod    f166-     a torn deck plate by the break, five pods sunk in it (four still sealed:
#                          bays five to eight). The commander's pod vents and the lid swings back; the
#                          commander gets up, steps out over the rim, limps to the plate's edge, jumps
#                          down to the sand and looks round, and the camera cranes out to the game
#                          camera over the dark reactor. Motion capture (pod_exit.py), cut across
#                          four cameras.
# blender -b --factory-startup -P tools/cinematics/crash.py -- [--shot N] [--quick] [--check]
import math, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import cryo_pod, lib, pod_exit
from retarget import P as retarget_P

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
quick = "--quick" in args
only = int(args[args.index("--shot") + 1]) if "--shot" in args else None
SHOTS = {1: (1, 75), 2: (76, 105), 3: (106, 165), 4: None}
FOLDER = os.path.join(lib.OUT, "crash_open")
SIZE = (360, 640) if quick else (720, 1280)


def key(obj, path, frames_values, interp="BEZIER"):
    """Key obj.<path> at several frames: [(frame, value), ...]."""
    for f, v in frames_values:
        setattr(obj, path, v)
        obj.keyframe_insert(path, frame=f)
    if obj.animation_data and obj.animation_data.action:
        for fc in lib.fcurves(obj):
            if fc.data_path == path:
                for kp in fc.keyframe_points:
                    kp.interpolation = interp


def shake(cam, f0, f1, amp, seed=1):
    import random
    rng = random.Random(seed)
    sc = bpy.context.scene
    # jitter around wherever the camera already is on each frame (it may be moving)
    bases = []
    for f in list(range(f0, f1 + 1, 2)) + [f1 + 2]:
        sc.frame_set(f)
        bases.append((f, cam.location.copy()))
    for f, base in bases:
        k = 0 if f > f1 else amp * (1 - (f - f0) / max(1, f1 - f0))
        cam.location = base + Vector((rng.uniform(-k, k), rng.uniform(-k, k) * 0.3, rng.uniform(-k, k)))
        cam.keyframe_insert("location", frame=f)


def blob(at, radius, color, density, name):
    """A soft volume sphere (dust or steam)."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=at, segments=24, ring_count=12)
    o = bpy.context.object
    o.name = name
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    v = nt.nodes.new("ShaderNodeVolumePrincipled")
    v.inputs["Color"].default_value = lib.rgb(color)
    v.inputs["Density"].default_value = density
    nt.links.new(v.outputs["Volume"], nt.nodes["Material Output"].inputs["Volume"])
    o.data.materials.append(m)
    return o, v.inputs["Density"]


def glow(parent, at, radius, color, power, name):
    """Engine glow: an emissive ball plus a light, parented to the ship so they fly with it."""
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=at)
    b = bpy.context.object
    b.name = name
    m = lib.mat(name, color, emit=color, strength=40)
    b.data.materials.append(m)
    lt = lib.point(at, color, power, radius=radius, name=name + "_light")
    for o in (b, lt):
        o.parent = parent
        o.matrix_parent_inverse = parent.matrix_world.inverted()
    return lt, m.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]


def storm_world():
    lib.sky(horizon="#9c7c58", zenith="#4a3b30", haze=0.007, haze_color="#a68862")
    lib.sun(elevation=18, azimuth=-120, strength=1.4, color="#ffcf9a")
    lib.ground()
    lib.ridge(at=(0, 420, -1), length=1600, depth=170, height=60, seed=4, color="#3c322b")


# ---------------------------------------------------------------- 1 descent
def shot1():
    storm_world()
    ship = lib.place("halcyon_flying", size=90, name="halcyon")
    sc = bpy.context.scene
    # nose is -X: the ship dives toward screen left and down, tipping further nose-down
    key(ship, "location", [(1, Vector((110, 90, 120))), (75, Vector((-60, 40, 12)))], "LINEAR")
    key(ship, "rotation_euler", [(1, (math.radians(6), math.radians(-10), math.radians(-12))),
                                 (40, (math.radians(-4), math.radians(-18), math.radians(-12))),
                                 (75, (math.radians(9), math.radians(-30), math.radians(-12)))])
    sc.frame_set(1)
    bpy.context.view_layer.update()
    # engine end: +X, half the hull's height up (the root sits at the model's base)
    tail = ship.matrix_world @ Vector((44 / ship.scale.x, 0, 19 / ship.scale.x))
    lt, em = glow(ship, tail, 3, "#ff8a3a", 400_000, "engines")
    # the pulse at f35; engines cut out in time with it, then sputter back
    pulse = lib.point((-120, 400, 70), "#bfe8ff", 100, radius=6, name="pulse")
    for f in range(1, 76):
        beat = math.exp(-((f - 35) / 3.5) ** 2)
        pulse.data.energy = 200 + 9_000_000 * beat
        pulse.data.keyframe_insert("energy", frame=f)
        on = 0.05 if 36 <= f <= 47 else (0.5 + 0.5 * (f % 3 == 0) if 48 <= f <= 56 else 1.0)
        lt.data.energy = 400_000 * on
        lt.data.keyframe_insert("energy", frame=f)
        em.default_value = 40 * on
        em.keyframe_insert("default_value", frame=f)
    lib.dust(n=500, x=(-30, 30), y=(-70, -20), z=(0, 30), loop=75, wind=(-40, 6, -8), seed=21, color="#b89b74")
    cam = lib.camera((10, -95, 4), (0, 0, 50), lens=24)
    track = cam.constraints.new("TRACK_TO")
    track.target, track.track_axis, track.up_axis = ship, "TRACK_NEGATIVE_Z", "UP_Y"
    track.influence = 0.85
    shake(cam, 1, 75, 0.25, seed=3)


# ---------------------------------------------------------------- 2 impact
def shot2():
    storm_world()
    sc = bpy.context.scene
    hit = Vector((-30, 130, 0))
    ship = lib.place("halcyon_flying", size=90, name="halcyon")
    key(ship, "location", [(76, hit + Vector((70, 40, 75))), (86, hit + Vector((0, 0, 14)))], "LINEAR")
    key(ship, "rotation_euler", [(76, (math.radians(9), math.radians(-30), math.radians(-12))),
                                 (86, (math.radians(4), math.radians(-14), math.radians(-12)))], "LINEAR")
    wreck = lib.place("halcyon_wreck", at=hit, yaw=-12, size=95, name="wreck")
    for o, show in ((ship, (True, False)), (wreck, (False, True))):
        for ob in [o] + list(o.children_recursive):
            for f, vis in ((85, show[0]), (86, show[1])):
                ob.hide_render = not vis
                ob.keyframe_insert("hide_render", frame=f)
    flash = lib.point(hit + Vector((0, -10, 12)), "#ffd2a0", 0, radius=10, name="flash")
    key(flash.data, "energy", [(85, 0), (86, 4e7), (90, 4e6), (105, 0)])
    plume, dens = blob(hit + Vector((0, 0, 5)), 1, "#a68862", 0.08, "plume")
    key(plume, "scale", [(85, Vector((1, 1, 1))), (86, Vector((20, 20, 8))), (105, Vector((95, 95, 45)))])
    for f, d in ((86, 0.12), (105, 0.03)):
        dens.default_value = d
        dens.keyframe_insert("default_value", frame=f)
    cam = lib.camera((40, -90, 10), hit + Vector((0, 0, 22)), lens=30)
    shake(cam, 86, 100, 2.5, seed=5)


# ---------------------------------------------------------------- the crash site (shots 3-4)
# Doug's wreck at 60 m, nose -X, lying across the plain; the hull broke in two at x = 12. A torn
# deck plate lies on the sand by the break with five cryo pods sunk into it (the commander's open,
# four sealed: bays five to eight). The deck, the pods and the drop to the sand are fitted to the
# commander's motion capture (pod_exit.perform), which is built in its own frame (deck top at z 0,
# the commander lying along -X at the origin) and turned onto the plain by the `stage` empty.
PRE = 45              # frames the commander lies still while the seal blows and the lid swings open
POD_ON = 166          # crash_open frame where the pod shot starts
POD_SINK = 0.07       # metres the pod's side walls sit below the rim height the step-over clears
POD_BACK = 0.0        # metres the pod sits back from the fitted rim (any further and the boots meet the inner wall)
# The first render's set and path (crash_v1_set.json, from the 5cbc1b7 version): the stage is
# placed so everything from the limp on lands exactly where it did then, on the same deck plate, so
# frames with no pod in view keep their first render.
FIRST = os.path.join(lib.HERE, "crash_v1_set.json")


def crash_site():
    """The wreck, the deck plate, the pods and the commander keyed with the pod exit. Returns the
    pieces the shots need (all positions in the world)."""
    import json
    sc = bpy.context.scene
    lib.place("halcyon_wreck_site", exact=True, name="wreck")
    cmd = lib.place("unit.player", at=(0, 0, 0), height=1.8, name="commander")
    lib.still(cmd)
    pod_exit.STEP_TURN = 90  # stand, turn to the pod's long side, step out over it (the end caps are tall)
    P = pod_exit.perform(cmd, pre=PRE)
    for o in P["walls"] + [P["deck"], P["sand"]]:
        bpy.data.objects.remove(o)
    TL, N, starts = P["TL"], P["N"], P["starts"]
    ax, lat, RIM = P["ax"], P["lat"], P["RIM_H"]
    v1 = json.load(open(FIRST))
    # turn the motion's frame onto the plain: fit the limp, drop and look onto the first render's path
    rows = range(starts[2], starts[3])  # the limp: the jump now lands a little further out than it did
    src = [Vector((TL[r][3].x, TL[r][3].y)) for r in rows]
    dst = [Vector(v1["pelvis"][r + PRE][:2]) for r in rows]
    cs, cd = sum(src, Vector((0, 0))) / len(src), sum(dst, Vector((0, 0))) / len(dst)
    yaw = math.atan2(sum((s - cs).x * (d - cd).y - (s - cs).y * (d - cd).x for s, d in zip(src, dst)),
                     sum((s - cs).dot(d - cd) for s, d in zip(src, dst)))
    stage = bpy.data.objects.new("stage", None)
    sc.collection.objects.link(stage)
    stage.rotation_euler = (0, 0, yaw)
    c_w = Matrix.Rotation(yaw, 2) @ cs
    stage.location = (cd.x - c_w.x, cd.y - c_w.y, P["DROP_H"])
    cmd.parent = stage
    bpy.context.view_layer.update()
    W = lambda v: stage.matrix_world @ Vector(v)
    Wd = lambda v: (stage.matrix_world.to_3x3() @ Vector(v)).normalized()
    err = max((W(TL[r][3]) - Vector(v1["pelvis"][r + PRE])).length for r in rows)
    print(f"STAGE fit to the first render: worst pelvis offset {err * 100:.1f} cm")

    # Doug's stasis pod (cryo_pod.py), scaled to fit the commander lying down and sunk to its cradle;
    # its open (+y) side faces the step-out, its cavity's front wall stands where the capture's step
    # clears the rim, and its glass hinges along the back long edge. Four sealed copies sit behind it.
    width, length = P["front"] - P["back"], P["lat1"] - P["lat0"]
    long_axis = lat if length >= width else ax
    across = ax if long_axis is lat else lat
    # the step clears the capture's 8 cm test wall; the real side wall is thicker, so it sits lower still
    pod, hinge, glass, dims = cryo_pod.build("pod", max(width, length), min(width, length), RIM - POD_SINK)
    x_dir = long_axis if long_axis.cross(across).z > 0 else -long_axis
    mid_long = (P["lat0"] + P["lat1"]) / 2 if long_axis is lat else (P["back"] + P["front"]) / 2
    pod_centre = long_axis * mid_long + across * (P["front"] - dims["half_wid"] - POD_BACK)
    pod.parent = stage
    pod.location = pod_centre
    pod.rotation_euler = (0, 0, math.atan2(x_dir.y, x_dir.x))
    lid_at = lambda deg: (math.radians(deg), 0, 0)
    hinge.rotation_euler = lid_at(10)  # cracked open from the first frame
    plo, phi = Vector(map(min, *[v.co for v in pod.data.vertices])), Vector(map(max, *[v.co for v in pod.data.vertices]))
    s_long = 1 if Wd(long_axis).x > 0 else -1  # the second column of pods toward the hull break (+x)
    step_a, step_l = (phi.y - plo.y) + 0.4, (phi.x - plo.x) + 0.45
    sealed_at = [pod_centre - across * (step_a * i) + long_axis * (s_long * step_l * j) for i, j in ((0, 1), (1, 0), (1, 1), (1, -1))]
    pods = [pod, glass]
    for i, c in enumerate(sealed_at):
        p2 = pod.copy()
        sc.collection.objects.link(p2)
        p2.name = f"bay{5 + i}"
        p2.parent, p2.location = stage, c
        for ch in pod.children:
            c2 = ch.copy()
            sc.collection.objects.link(c2)
            c2.parent = p2
            if ch is hinge:
                c2.rotation_euler = lid_at(0)
                g2 = glass.copy()
                sc.collection.objects.link(g2)
                g2.parent = c2
                pods.append(g2)
        pods.append(p2)

    # the deck plate, its hazard stripe and the debris below its edge, as in the first render
    M = lambda name: Matrix(v1["objs"][name])
    bpy.ops.mesh.primitive_cube_add(size=1)
    deck = bpy.context.object
    deck.name = "deck"
    deck.matrix_world = M("deck")
    deck.data.materials.append(panel_steel())
    bpy.ops.mesh.primitive_cube_add(size=1)
    stripe = bpy.context.object
    stripe.matrix_world = M("Cube.001")
    stripe.data.materials.append(lib.mat("hazard", "#c8a23a", rough=0.6))
    for name in ("decor.ship_scrap.glb", "decor.ship_scrap.glb.001"):
        lib.place("decor.ship_scrap", size=1.6).matrix_world = M(name)
    bpy.context.view_layer.update()
    inv = deck.matrix_world.inverted()
    corners = [inv @ W(c + x_dir * sx + x_dir.cross(Vector((0, 0, -1))) * sy)
               for c in [pod_centre] + sealed_at for sx in (plo.x, phi.x) for sy in (plo.y, phi.y)]
    over = [q for q in corners if abs(q.x) > 0.5 or abs(q.y) > 0.5]
    print(f"DECK pod corners off the plate: {len(over)}")
    if over:  # a second plate under all the pods, its top a hair lower, where they overhang the first
        s = deck.matrix_world.to_scale()
        mx, my = 0.4 / s.x, 0.4 / s.y
        x0, x1 = min(q.x for q in corners) - mx, min(max(q.x for q in corners) + mx, 0.5 - 1.5 / s.x)
        y0, y1 = min(q.y for q in corners) - my, max(q.y for q in corners) + my
        bpy.ops.mesh.primitive_cube_add(size=1)
        ext = bpy.context.object
        ext.name = "deck_ext"
        ext.matrix_world = deck.matrix_world @ Matrix.Translation(((x0 + x1) / 2, (y0 + y1) / 2, -0.002 / s.z)) @ Matrix.Diagonal((x1 - x0, y1 - y0, 1, 1))
        ext.data.materials.append(deck.data.materials[0])
        pods.append(ext)
    end, U = W(TL[-1][3]), Vector(v1["U"])
    end.z = 0
    lib.rocks(n=160, x=(-6, 26), y=(-21, -9), size=(0.04, 0.22), seed=17)
    for o in bpy.data.objects:  # no stone under the landing or the look-around
        if o.name.startswith("rock") and (Vector((o.location.x, o.location.y, 0)) - end).length < 1.6:
            o.hide_render = True
    pelvis = [W(TL[min(N - 1, max(0, f - 1 - PRE))][3]) for f in range(1, N + PRE + 1)]
    return dict(P=P, cmd=cmd, stage=stage, W=W, Wd=Wd, hinge=hinge, lid_at=lid_at, rim=RIM, pod=W(pod_centre), pods=pods,
                end=end, U=U, ax=Wd(across), lat=Wd(long_axis), pelvis=pelvis, starts=starts, N=N)


def follower(pelvis, k=12, name="follow"):
    """An empty on the commander's pelvis, smoothed over 2k+1 frames, for cameras to track."""
    e = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(e)
    n = len(pelvis)
    for f in range(n):
        ps = pelvis[max(0, f - k):min(n, f + k + 1)]
        e.location = sum(ps, Vector()) / len(ps)
        e.keyframe_insert("location", frame=f + 1)
    return e


# ---------------------------------------------------------------- 3 establishing
def shot3():
    dawn()
    S = crash_site()
    for n in S["cmd"]["meshes"]:  # still sealed in the pod
        bpy.data.objects[n].hide_render = True
    S["hinge"].rotation_euler = S["lid_at"](0)  # still sealed
    lib.point((12, -1.5, 3.2), "#ff3424", 4000, radius=0.6, name="emergency")
    lib.dust(n=260, x=(-20, 40), y=(-45, -10), z=(0, 6), loop=60, wind=(6, 1, 0.2), seed=41, color="#c9b393")
    cam = lib.camera((48, -52, 9), (12, -2, 3), lens=30)
    key(cam, "location", [(106, Vector((48, -52, 9))), (165, Vector((33, -33, 6.5)))])


# ---------------------------------------------------------------- 4 the pod, the walk, the drop
def shot4():
    """The pod sequence in its own frame numbers (1 .. PRE + N); EDIT says which camera holds which
    frames. Returns the edit: [(camera, first frame, last frame)]."""
    sc = bpy.context.scene
    dawn()
    S = crash_site()
    N, st, pel = S["N"], S["starts"], S["pelvis"]
    F = lambda row: row + 1 + PRE  # scene frame of a motion row
    pod, rim = S["pod"], S["rim"]
    red = lib.point((10.5, -1.2, 3.6), "#ff3424", 0, radius=0.3, name="emergency")
    for f in range(1, N + PRE + 1, 2):
        red.data.energy = 900 + 700 * math.sin(f / 30 * 6.283)
        red.data.keyframe_insert("energy", frame=f)
    # the seal blows: a cold flash, steam, the lid swings back on its hinge
    seal = lib.point((pod.x, pod.y, pod.z + rim + 0.4), "#cfe6ff", 0, radius=0.5, name="seal")
    key(seal.data, "energy", [(4, 0), (6, 2600), (30, 250), (90, 0)])
    # the glass: cracked from the first frame, a jolt as the seal blows, then it swings fully open
    # while the commander sits up, finishing before their head reaches its old closed height
    arm, head_z = S["P"]["arm"], []
    head = arm.pose.bones[retarget_P + "Head"]
    for r in range(st[1]):
        sc.frame_set(F(r))
        head_z.append((arm.matrix_world @ head.head).z - pod.z)
    r_up = next((r for r, z in enumerate(head_z) if z > 0.5), st[1] - 1)
    f_open = max(16, F(r_up) - 40)
    key(S["hinge"], "rotation_euler", [(1, S["lid_at"](10)), (6, S["lid_at"](10)), (8, S["lid_at"](16)), (f_open, S["lid_at"](16)),
                                        (F(r_up) - 6, S["lid_at"](118))])
    print(f"LID opens frames {f_open}..{F(r_up) - 6} (head up at {F(r_up)})")
    for i, (dx, dy, r) in enumerate(((0, 0.3, 0.6), (-0.3, -0.5, 0.5), (0.25, 0.8, 0.55), (0, -0.2, 0.75))):
        s, d = blob(pod + S["lat"] * dy + S["ax"] * dx + Vector((0, 0, rim + 0.25)), 1, "#e8eef2", 0.0, f"steam{i}")
        key(s, "scale", [(6 + i * 2, Vector((r, r, r * 0.7))), (50, Vector((r * 2.6, r * 2.6, r * 2.8)))])
        for f, val in ((5 + i * 2, 0.0), (8 + i * 2, 1.9), (35, 0.4), (70, 0.0)):
            d.default_value = val
            d.keyframe_insert("default_value", frame=f)
    # the landing: a puff of dust where the feet hit the sand
    drop_rows = range(st[3], st[4])
    r_land = min(drop_rows, key=lambda r: pel[F(r) - 1].z)
    end = S["end"]
    land, dd = blob(end + Vector((0, 0, 0.15)), 1, "#c9b089", 0.0, "landing")
    key(land, "scale", [(F(r_land) - 4, Vector((0.4, 0.4, 0.15))), (F(r_land) + 16, Vector((2.4, 2.4, 0.6)))])
    for f, val in ((F(r_land) - 5, 0.0), (F(r_land) - 3, 0.8), (F(r_land) + 16, 0.0)):
        dd.default_value = val
        dd.keyframe_insert("default_value", frame=f)
    # a trail of ore off to the commander's left, leading out of shot toward the dark reactor (level 1
    # has them walk to it, so it isn't in the film); out of the earlier cuts, where the limp camera stands
    props = []
    for i, off in enumerate(((-0.9, -0.6), (-1.6, -1.1), (-2.2, -1.6))):
        props.append(lib.place("node.material_source", at=tuple(end + Vector((off[0], off[1], 0))), yaw=30 * i, size=0.9))
    for o in [o for p in props for o in p.children_recursive]:
        for f, hide in ((1, True), (F(st[3]), False)):
            o.hide_render = hide
            o.keyframe_insert("hide_render", frame=f)

    follow = follower(pel)
    A, L = S["ax"], S["lat"]
    lat_out = L if L.y < 0 else -L  # the side of the pod away from the hull
    deck_z = pod.z

    def tracked(name, at, lens, target=follow, dof=False):
        cam = lib.camera(at, pel[0], lens=lens, name=name)
        tt = cam.constraints.new("TRACK_TO")
        tt.target, tt.track_axis, tt.up_axis = target, "TRACK_NEGATIVE_Z", "UP_Y"
        if dof:
            cam.data.dof.use_dof = True
            cam.data.dof.focus_object = target
            cam.data.dof.aperture_fstop = 2.8
        return cam
    # 1 close on the pod, from its open side: the seal, the lid, sitting up
    c1 = tracked("podcam", pod + A * 3.3 + lat_out * 1.7 + Vector((0, 0, 1.75)), 32, dof=True)
    # 2 low in front: standing, the step over the rim, the first limping steps toward camera
    c2 = tracked("standcam", pod + A * 4.6 + lat_out * 1.6 + Vector((0, 0, 0.75)), 30)
    # 3 alongside the limp, riding with it
    walk = pel[F(st[3]) - 1] - pel[F(st[2]) - 1]; walk.z = 0
    side = walk.cross(Vector((0, 0, 1))).normalized()
    if side.y > 0: side = -side
    c3 = tracked("limpcam", Vector(), 30)
    c3.parent = follow
    c3.location = side * 3.6 + walk.normalized() * 1.6 + Vector((0, 0, 0.5))
    # 4 down on the sand, the drop toward camera, then the crane out to the game view
    U = S["U"]
    start = end + U * 4.2 + Vector((-U.y, U.x, 0)) * 2.0 + Vector((0, 0, 0.6))
    c4 = tracked("dropcam", start, 30)
    f_crane0 = F(st[4]) + 10
    crane = crane_path(start, end + Vector((0, 0, 0.9)), f_crane0, N + PRE)
    key(c4, "location", [(F(st[3]), start), (f_crane0, start)] + [(f, p) for f, p, _ in crane], "LINEAR")
    key(c4.data, "lens", [(F(st[3]), 30), (f_crane0, 30)] + [(f, l) for f, _, l in crane], "LINEAR")
    # the crane ends on a fixed point (the hand-off), so the last frames track a still target
    aim = bpy.data.objects.new("aim", None)
    sc.collection.objects.link(aim)
    aim.parent = follow
    key(aim, "location", [(f_crane0, Vector((0, 0, 0)))])
    tt = c4.constraints["Track To"]
    tt.target = aim
    hand = end + Vector((0, 0, 0.9))
    for f in range(f_crane0, N + PRE + 1):  # ease the aim from the commander onto the hand-off point
        t = (f - f_crane0) / max(1, N + PRE - f_crane0)
        sc.frame_set(f)
        aim.location = (hand - follow.location) * (t * t * (3 - 2 * t))
        aim.keyframe_insert("location", frame=f)
    shake(c4, F(r_land), F(r_land) + 8, 0.04, seed=9)
    sc.render.motion_blur_shutter = 0.3
    edit = [(c1, 1, F(130)), (c2, F(130) + 1, F(st[2]) + 34), (c3, F(st[2]) + 35, F(st[3]) - 1), (c4, F(st[3]), N + PRE)]
    for cam, f0, _ in edit:
        m = sc.timeline_markers.new(cam.name, frame=f0)
        m.camera = cam
    S["edit"] = edit
    return S


def dawn():
    lib.sky(horizon="#e6c9a3", zenith="#6f7891", haze=0.0016, haze_color="#cdbfa8")
    lib.sun(elevation=16, azimuth=-150, strength=3.4, color="#ffdcb4")
    lib.ground()
    lib.ridge(at=(0, 260, -1), length=1500, depth=170, height=48, seed=4, color="#4a3f36")
    lib.ridge(at=(-120, 480, -3), length=1800, depth=240, height=95, seed=9, color="#665547")


def panel_steel(name="deckplate"):
    """Ship deck: dark steel with a panel-seam grid and a little wear."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    brick = nt.nodes.new("ShaderNodeTexBrick")
    brick.offset, brick.squash_frequency = 0.0, 1
    brick.inputs["Scale"].default_value = 0.8
    brick.inputs["Mortar Size"].default_value = 0.012
    brick.inputs["Color1"].default_value = lib.rgb("#4a4a4c")
    brick.inputs["Color2"].default_value = lib.rgb("#525254")
    brick.inputs["Mortar"].default_value = lib.rgb("#1d1d1f")
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 1.5
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["Factor"].default_value = 0.35
    nt.links.new(tc.outputs["Object"], brick.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    nt.links.new(brick.outputs["Color"], mix.inputs["A"])
    nt.links.new(noise.outputs["Fac"], mix.inputs["B"])  # greyscale wear, no colour noise
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    b.inputs["Metallic"].default_value = 0.7
    b.inputs["Roughness"].default_value = 0.55
    return m



# ---------------------------------------------------------------- the crane to the game view
def crane_path(start, target, f0, f1, view_w=7.3, dist_end=95.0):
    """Per-frame (frame, position, lens) for a dolly-zoom crane from `start` to the in-game view
    of `target` (render-3d: 30° pitch, camera toward +x -y at 45°, near-orthographic). Distance
    and framing grow geometrically while the lens follows, so the commander stays about the same
    size as perspective flattens into the game's look. The camera rises first and swings round
    late, keeping low, close positions clear of the set. Lens is for the portrait frame's
    vertical 36 mm sensor (AUTO fit), so the last frame is `view_w` metres across."""
    o = start - target
    d0 = o.length
    az0, el0 = math.atan2(o.y, o.x), math.asin(o.z / d0)
    az1, el1 = math.radians(-45), math.radians(30)
    daz = (az1 - az0 + math.pi) % (2 * math.pi) - math.pi
    h0, h1 = 36 * d0 / 30, view_w * 16 / 9  # framed height: lens 30 at the start
    out = []
    for f in range(f0, f1 + 1):
        t = (f - f0) / (f1 - f0)
        e = t * t * (3 - 2 * t)
        dist = d0 * (dist_end / d0) ** e
        h = h0 * (h1 / h0) ** e
        el = el0 + (el1 - el0) * min(1.0, e * 1.6)
        az = az0 + daz * e * e
        pos = target + dist * Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        out.append((f, pos, 36 * dist / h))
    return out



def build(n):
    sc = lib.reset(*SIZE)
    if quick:
        sc.eevee.taa_render_samples = 12
    lib.bloom(threshold=1.0, size=7)
    S = {1: shot1, 2: shot2, 3: shot3, 4: shot4}[n]()
    sc.render.use_motion_blur = not quick
    return sc, S


for n in ([only] if only else SHOTS):
    sc, S = build(n)
    if n == 4:
        edit = S["edit"]
        last = edit[-1][2]
        if "--check" in args:  # first, middle and last frame of each cut, and the body against the pod and glass
            body = S["P"]["body"]
            hits = []
            for f in range(1, S["edit"][2][1], 2):
                sc.frame_set(f)
                spots = []
                k = cryo_pod.collisions(body, S["pods"][:2], S["pod"].z, spots)
                if k:
                    hits.append(f"{f}:{k}")
                    inv = S["pods"][0].matrix_world.inverted()
                    loc = [inv @ c for _, c in spots]
                    mid = sum(loc, Vector()) / len(loc)
                    print(f"  f{f}: {spots[0][0]} around pod-frame ({mid.x:.2f}, {mid.y:.2f}, {mid.z:.2f}), z {min(q.z for q in loc):.2f}..{max(q.z for q in loc):.2f}")
            print("POD HITS", len(hits), " ".join(hits))  # boot soles brushing the outer flank at deck level are expected
            if "--close" in args:  # side-on stills along the pod's long axis at the given frames
                sc.timeline_markers.clear()
                for k, side in enumerate((S["lat"], -S["lat"])):
                    cam = lib.camera(S["pod"] + side * 2.2 + S["ax"] * 0.5 + Vector((0, 0, 0.35)), S["pod"] + S["ax"] * 0.5 + Vector((0, 0, 0.3)), lens=35, name=f"close{k}")
                    sc.camera = cam
                    for f in (int(x) for x in args[args.index("--close") + 1].split(",")):
                        sc.frame_set(f)
                        lib.render_still(os.path.join(lib.OUT, f"podclose_{f:03d}_{k}.png"))
                continue
            for cam, f0, f1 in edit:
                sc.camera = cam
                for f in (f0, (f0 + f1) // 2, f1):
                    sc.frame_set(f)
                    lib.render_still(os.path.join(lib.OUT, f"crash_4_{f:03d}.png"))
            continue
        pod_dir = os.path.join(lib.OUT, "crash_pod")
        if "--pods-only" in args:
            # redo only the frames where a pod could be in view (its box inside the camera frame), keeping the rest
            from bpy_extras.object_utils import world_to_camera_view
            redo = []
            for f in range(1, last + 1):
                sc.frame_set(f)
                cam = sc.camera
                for o in S["pods"]:
                    pts = [world_to_camera_view(sc, cam, o.matrix_world @ Vector(c)) for c in o.bound_box]
                    xs, ys = [p.x for p in pts], [p.y for p in pts]
                    if max(p.z for p in pts) > 0 and max(xs) > -0.05 and min(xs) < 1.05 and max(ys) > -0.05 and min(ys) < 1.05:
                        redo.append(f)
                        break
            for f in redo:
                p = os.path.join(pod_dir, f"f_{f:04d}.png")
                if os.path.exists(p): os.remove(p)
            print("POD FRAMES", len(redo), "of", last)
        # render the pod sequence in its own numbering, then append it to crash_open after shot 3
        sc.render.use_overwrite = False  # a resumed render skips the frames already on disk
        # --range A,B renders only those frames: long sessions corrupt frames on this GPU, so a driver
        # script runs short ones; the sequence is appended once every frame exists
        a, b = (int(x) for x in args[args.index("--range") + 1].split(",")) if "--range" in args else (1, last)
        lib.render_frames(pod_dir, a, min(b, last))
        if any(not os.path.exists(os.path.join(pod_dir, f"f_{f:04d}.png")) for f in range(1, last + 1)):
            continue
        os.makedirs(FOLDER, exist_ok=True)
        for f in os.listdir(FOLDER):
            if f.startswith("f_") and int(f[2:6]) >= POD_ON:
                os.remove(os.path.join(FOLDER, f))
        for f in range(1, last + 1):
            shutil.copy(os.path.join(pod_dir, f"f_{f:04d}.png"), os.path.join(FOLDER, f"f_{POD_ON - 1 + f:04d}.png"))
        print("crash_open frames", POD_ON - 1 + last)
        continue
    f0, f1 = SHOTS[n]
    if "--check" in args:  # three frames per shot
        for f in (f0, (f0 + f1) // 2, f1):
            sc.frame_set(f)
            lib.render_still(os.path.join(lib.OUT, f"crash_{n}_{f:03d}.png"))
    else:
        lib.render_frames(FOLDER, f0, f1)
