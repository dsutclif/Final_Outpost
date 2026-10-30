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
import lib, pod_exit

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
CUT = 0.55            # the pod opens at this fraction of its height
PRE = 45              # frames the commander lies still while the seal blows and the lid swings open
POD_AT = Vector((8.4, -7.6))  # the commander's pod on the plain
WALK = -90.0          # degrees: the way they walk out, over the plain away from the hull
POD_ON = 166          # crash_open frame where the pod shot starts


def model_pod(name, stage, centre, long_along, size_long, size_short, rim_h):
    """A pod model sunk into the deck: centred on `centre` (stage frame), its long axis along
    `long_along` (a stage axis), its CUT line at rim_h. Returns the root and its scaled height."""
    root = lib.place("capture.recruit_container", at=(0, 0, 0), name=name)
    bpy.context.view_layer.update()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in root.children_recursive:
        if o.type == "MESH":
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    ext = hi - lo
    long_x = ext.x >= ext.y
    k_long = size_long / (ext.x if long_x else ext.y)
    k_short = size_short / (ext.y if long_x else ext.x)
    root.scale = (k_long, k_short, k_long) if long_x else (k_short, k_long, k_long)
    root.rotation_euler = (0, 0, math.atan2(long_along.y, long_along.x))
    height = ext.z * k_long
    root.location = (centre.x, centre.y, rim_h - CUT * height)
    root.parent = stage
    return root, height


def split_lid(root):
    """Cut a pod into its tub and lid at CUT of its height. Returns the lid objects."""
    import bmesh
    lids = []
    for name in root["meshes"]:
        tub = bpy.data.objects[name]
        lid = tub.copy()
        lid.data = tub.data.copy()
        bpy.context.scene.collection.objects.link(lid)
        zs = [v.co.z for v in tub.data.vertices]
        cut = min(zs) + (max(zs) - min(zs)) * CUT
        for ob, clear_outer in ((tub, True), (lid, False)):
            bm = bmesh.new()
            bm.from_mesh(ob.data)
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, cut),
                                   plane_no=(0, 0, 1), clear_outer=clear_outer, clear_inner=not clear_outer)
            bm.to_mesh(ob.data)
            bm.free()
        lids.append(lid)
    return lids


def crash_site():
    """The wreck, the deck plate, the pods and the commander keyed with the pod exit. Returns the
    pieces the shots need (all positions in the world)."""
    sc = bpy.context.scene
    lib.place("halcyon_wreck_site", exact=True, name="wreck")
    cmd = lib.place("unit.player", at=(0, 0, 0), height=1.8, name="commander")
    lib.still(cmd)
    P = pod_exit.perform(cmd, pre=PRE)
    for o in P["walls"] + [P["deck"], P["sand"]]:
        bpy.data.objects.remove(o)
    TL, N, starts = P["TL"], P["N"], P["starts"]
    ax, lat, WT, RIM = P["ax"], P["lat"], P["WALL_T"], P["RIM_H"]
    a0, a1 = P["back"] - WT, P["front"] + WT          # the tub's outside, along the step
    l0, l1 = P["lat0"] - WT, P["lat1"] + WT           # and across it
    centre = ax * ((a0 + a1) / 2) + lat * ((l0 + l1) / 2)
    width, length = a1 - a0, l1 - l0
    # turn the motion's frame onto the plain: the whole walk heads WALK, the pod sits at POD_AT
    travel = TL[-1][3] - TL[0][3]
    yaw = math.radians(WALK) - math.atan2(travel.y, travel.x)
    stage = bpy.data.objects.new("stage", None)
    sc.collection.objects.link(stage)
    stage.rotation_euler = (0, 0, yaw)
    c_w = Matrix.Rotation(yaw, 3, "Z") @ Vector((centre.x, centre.y, 0))
    stage.location = (POD_AT.x - c_w.x, POD_AT.y - c_w.y, P["DROP_H"])
    cmd.parent = stage
    bpy.context.view_layer.update()
    W = lambda v: stage.matrix_world @ Vector(v)
    Wd = lambda v: (stage.matrix_world.to_3x3() @ Vector(v)).normalized()

    # the commander's pod (cut open, lid on a hinge along its back rim) and four sealed ones beside it
    long_axis = lat if length >= width else ax
    pod, pod_h = model_pod("pod", stage, centre, long_axis, max(width, length), min(width, length), RIM)
    lids = split_lid(pod)
    hinge = bpy.data.objects.new("hinge", None)
    sc.collection.objects.link(hinge)
    hinge.parent = stage
    hinge.location = ax * a0 + lat * ((l0 + l1) / 2) + Vector((0, 0, RIM))
    bpy.context.view_layer.update()
    for lid in lids:
        mw = lid.matrix_world.copy()
        lid.parent = hinge
        lid.matrix_world = mw
    # the lid swings back over the hull side: about the hinge line, whichever way lifts its far edge back
    probe = ax * (width / 2) + Vector((0, 0, 0.2))
    turn = 1 if (Matrix.Rotation(math.radians(110), 3, lat) @ probe).dot(ax) < 0 else -1
    axis_i = 0 if abs(lat.x) > 0.5 else 1
    lid_sign = turn * (1 if (lat.x if axis_i == 0 else lat.y) > 0 else -1)

    def lid_at(deg):
        e = [0.0, 0.0, 0.0]
        e[axis_i] = math.radians(deg) * lid_sign
        return tuple(e)
    hinge.rotation_euler = lid_at(0)
    bpy.ops.mesh.primitive_cube_add(size=1)
    pad = bpy.context.object
    pad.parent = stage
    pad.location = centre + Vector((0, 0, 0.0015))
    pad.rotation_euler = (0, 0, math.atan2(long_axis.y, long_axis.x))
    pad.scale = (max(width, length) - 2.2 * WT, min(width, length) - 2.2 * WT, 0.003)
    pad.data.materials.append(lib.mat("padding", "#2b2f33", rough=0.8))
    # sealed pods: one alongside (end to end) toward the hull break, three in the row behind
    s_lat = 1 if Wd(lat).x > 0 else -1
    step_a, step_l = width + 0.45, length + 0.5
    sealed = [centre + lat * (s_lat * step_l)] + [centre - ax * step_a + lat * (s_lat * j * step_l) for j in (0, 1, 2)]
    for i, c in enumerate(sealed):
        model_pod(f"bay{5 + i}", stage, c, long_axis, max(width, length), min(width, length), RIM)

    # the deck plate: from behind the pods to the takeoff edge, wide enough for everything on it
    u = P["jump_dir"].copy(); u.z = 0; u.normalize()
    v = Vector((-u.y, u.x, 0))
    pts = [r[3] for r in TL[:starts[3]]]
    for c in [centre] + sealed:
        for sa in (-1, 1):
            for sl in (-1, 1):
                pts.append(c + ax * (sa * width / 2) + lat * (sl * length / 2))
    us, vs = [p.dot(u) for p in pts], [p.dot(v) for p in pts]
    u0, u1 = min(us) - 1.4, P["edge_d"]
    v0, v1 = min(vs) - 1.6, max(vs) + 1.6
    D = P["DROP_H"]
    bpy.ops.mesh.primitive_cube_add(size=1)
    deck = bpy.context.object
    deck.name = "deck"
    deck.parent = stage
    deck.location = u * ((u0 + u1) / 2) + v * ((v0 + v1) / 2) + Vector((0, 0, -D / 2))
    deck.rotation_euler = (0, 0, math.atan2(u.y, u.x))
    deck.scale = (u1 - u0, v1 - v0, D)
    deck.data.materials.append(panel_steel())
    bpy.ops.mesh.primitive_cube_add(size=1)
    stripe = bpy.context.object
    stripe.parent = stage
    stripe.location = u * (u1 - 0.09) + v * ((v0 + v1) / 2) + Vector((0, 0, 0.001))
    stripe.rotation_euler = deck.rotation_euler
    stripe.scale = (0.12, v1 - v0, 0.004)
    stripe.data.materials.append(lib.mat("hazard", "#c8a23a", rough=0.6))
    bpy.context.view_layer.update()

    end = W(TL[-1][3]); end.z = 0
    edge_mid = W(u * u1 + v * ((v0 + v1) / 2)); edge_mid.z = 0
    U, V = Wd(u), Wd(v)
    for dv, yaw_s in ((-0.45, 20), (0.42, -35)):  # debris at the foot of the plate, clear of the landing
        p = edge_mid + U * 1.2 + V * ((v1 - v0) * dv)
        lib.place("decor.ship_scrap", at=(p.x, p.y, 0), yaw=yaw_s, size=1.6)
    lib.rocks(n=160, x=(-6, 26), y=(-21, -9), size=(0.04, 0.22), seed=17)
    for o in bpy.data.objects:  # no stone under the landing or the look-around
        if o.name.startswith("rock") and (Vector((o.location.x, o.location.y, 0)) - end).length < 1.6:
            o.hide_render = True
    pelvis = [W(TL[min(N - 1, max(0, f - 1 - PRE))][3]) for f in range(1, N + PRE + 1)]
    return dict(P=P, cmd=cmd, stage=stage, W=W, Wd=Wd, hinge=hinge, lid_at=lid_at, rim=RIM, pod=W(centre),
                end=end, U=U, ax=Wd(ax), lat=Wd(lat), pelvis=pelvis, starts=starts, N=N)


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
    key(S["hinge"], "rotation_euler", [(7, S["lid_at"](0)), (11, S["lid_at"](8)), (30, S["lid_at"](112))])
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
    # level 1's start: the dark reactor off to the commander's left, a trail of ore toward it; they
    # stay out of the earlier cuts (the limp camera stands where they are) and appear with the drop
    props = [lib.place("sink.core.l1", at=tuple(end + Vector((-3.3, -2.4, 0))), size=4.5, name="reactor")]
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
    c1 = tracked("podcam", pod + A * 2.4 + lat_out * 1.3 + Vector((0, 0, 1.45)), 32, dof=True)
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
    return edit


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
    edit = {1: shot1, 2: shot2, 3: shot3, 4: shot4}[n]()
    sc.render.use_motion_blur = not quick
    return sc, edit


for n in ([only] if only else SHOTS):
    sc, edit = build(n)
    if n == 4:
        if "--check" in args:  # first, middle and last frame of each cut
            for cam, f0, f1 in edit:
                sc.camera = cam
                for f in (f0, (f0 + f1) // 2, f1):
                    sc.frame_set(f)
                    lib.render_still(os.path.join(lib.OUT, f"crash_4_{f:03d}.png"))
            continue
        # render the pod sequence in its own numbering, then append it to crash_open after shot 3
        pod_dir = os.path.join(lib.OUT, "crash_pod")
        lib.render_frames(pod_dir, 1, edit[-1][2])
        os.makedirs(FOLDER, exist_ok=True)
        for f in os.listdir(FOLDER):
            if f.startswith("f_") and int(f[2:6]) >= POD_ON:
                os.remove(os.path.join(FOLDER, f))
        for f in range(1, edit[-1][2] + 1):
            shutil.copy(os.path.join(pod_dir, f"f_{f:04d}.png"), os.path.join(FOLDER, f"f_{POD_ON - 1 + f:04d}.png"))
        print("crash_open frames", POD_ON - 1 + edit[-1][2])
        continue
    f0, f1 = SHOTS[n]
    if "--check" in args:  # three frames per shot
        for f in (f0, (f0 + f1) // 2, f1):
            sc.frame_set(f)
            lib.render_still(os.path.join(lib.OUT, f"crash_{n}_{f:03d}.png"))
    else:
        lib.render_frames(FOLDER, f0, f1)
