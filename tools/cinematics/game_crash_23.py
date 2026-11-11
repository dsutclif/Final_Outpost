# crash_open shots 2 (impact) and 3 (the wreck at dawn) on the game's own crash-site sizes (docs/SCALE.md: wreck 27 m, pod
# 2.66 m), lit (EEVEE), 720x1280, frame numbers as in crash_open (2: 76-105, 3: 106-165). Shot 1 (the descent) and the pod
# sequence (game_film.py --eevee) are separate. The impact is crash.py's shot 2 scaled to the 27 m wreck.
# blender -b --factory-startup -P tools/cinematics/game_crash_23.py -- [--shot 2|3] [--check] [--quick]
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib, game_set

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
# Doug 2026-11-10: the wreck shot keeps only the ridges by the pod (the hand-off's rock pile); its camera starts on the
# level's east boundary ridge, which would fill the approved shot's foreground
os.environ.setdefault("RIDGE_ONLY", "ridgeN")
os.environ.setdefault("GAME_LOOK", "1")  # Doug 2026-11-10: the game's sand and the original Meshy wreck in the final render (game_set.py)
only = int(args[args.index("--shot") + 1]) if "--shot" in args else None
SHOTS = {1: (1, 75), 2: (76, 105), 3: (106, 165)}
FOLDER = os.path.join(lib.OUT, "crash_open_new")
K = game_set.WRECK_M / 95.0          # crash.py's impact was built for a 95 m wreck
POD_K = game_set.POD_M / 3.9847


def key(obj, path, fv, interp="BEZIER"):
    for f, v in fv:
        setattr(obj, path, v)
        obj.keyframe_insert(path, frame=f)
    for fc in lib.fcurves(obj):
        if fc.data_path == path:
            for kp in fc.keyframe_points: kp.interpolation = interp


def shake(cam, f0, f1, amp, seed=1):
    rng = random.Random(seed)
    sc = bpy.context.scene
    bases = []
    for f in list(range(f0, f1 + 1, 2)) + [f1 + 2]:
        sc.frame_set(f)
        bases.append((f, cam.location.copy()))
    for f, base in bases:
        k = 0 if f > f1 else amp * (1 - (f - f0) / max(1, f1 - f0))
        cam.location = base + Vector((rng.uniform(-k, k), rng.uniform(-k, k) * 0.3, rng.uniform(-k, k)))
        cam.keyframe_insert("location", frame=f)


def blob(at, radius, color, density, name):
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


def night_world():
    """A night dust storm (Doug): the storm's brown-red haze with the day taken out, a dim warm light over dark sand and ridge."""
    lib.sky(horizon="#5a3b2a", zenith="#1a1210", haze=0.006, haze_color="#5a3b2a")
    lib.sun(elevation=25, azimuth=-150, strength=3.0, color="#d9a67e")
    lib.ground()
    lib.ridge(at=(0, 260, -1), length=1500, depth=170, height=48, seed=4, color="#241812")
    lib.ridge(at=(-120, 480, -3), length=1800, depth=240, height=95, seed=9, color="#2b1d16")
    bpy.context.scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 4.0


def glow(parent, at, radius, color, power, name):
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


def shot1():
    """crash.py shot 1 (the descent) at the 27 m wreck's scale: everything but the sky and the engines' glow scaled by K."""
    night_world()
    ship = lib.place("halcyon_flying", size=90 * K, name="halcyon")
    sc = bpy.context.scene
    key(ship, "location", [(1, Vector((110, 90, 120)) * K), (75, Vector((-60, 40, 12)) * K)], "LINEAR")
    key(ship, "rotation_euler", [(1, (math.radians(6), math.radians(-10), math.radians(-12))),
                                 (40, (math.radians(-4), math.radians(-18), math.radians(-12))),
                                 (75, (math.radians(9), math.radians(-30), math.radians(-12)))])
    sc.frame_set(1)
    bpy.context.view_layer.update()
    tail = ship.matrix_world @ Vector((44 / ship.scale.x, 0, 19 / ship.scale.x))
    lt, em = glow(ship, tail, 3 * K, "#ff8a3a", 400_000 * K * K, "engines")
    pulse = lib.point(Vector((-120, 400, 70)) * K, "#bfe8ff", 100, radius=6 * K, name="pulse")
    for f in range(1, 76):
        beat = math.exp(-((f - 35) / 3.5) ** 2)
        pulse.data.energy = (200 + 9_000_000 * beat) * K * K
        pulse.data.keyframe_insert("energy", frame=f)
        on = 0.05 if 36 <= f <= 47 else (0.5 + 0.5 * (f % 3 == 0) if 48 <= f <= 56 else 1.0)
        lt.data.energy = 400_000 * K * K * on
        lt.data.keyframe_insert("energy", frame=f)
        em.default_value = 40 * on
        em.keyframe_insert("default_value", frame=f)
    lib.dust(n=500, x=(-30 * K, 30 * K), y=(-70 * K, -20 * K), z=(0, 30 * K), loop=75, wind=(-40 * K, 6 * K, -8 * K), seed=21, color="#b89b74")
    cam = lib.camera(Vector((10, -95, 4)) * K, Vector((0, 0, 50)) * K, lens=24)
    track = cam.constraints.new("TRACK_TO")
    track.target, track.track_axis, track.up_axis = ship, "TRACK_NEGATIVE_Z", "UP_Y"
    track.influence = 0.85
    shake(cam, 1, 75, 0.25 * K, seed=3)


def shot2():
    night_world()
    hit = Vector((-30, 130, 0)) * K
    ship = lib.place("halcyon_flying", size=90 * K, name="halcyon")
    key(ship, "location", [(76, hit + Vector((70, 40, 75)) * K), (86, hit + Vector((0, 0, 14)) * K)], "LINEAR")
    key(ship, "rotation_euler", [(76, (math.radians(9), math.radians(-30), math.radians(-12))),
                                 (86, (math.radians(4), math.radians(-14), math.radians(-12)))], "LINEAR")
    wreck = lib.place("decor.halcyon_wreck", at=tuple(hit), yaw=-12, size=game_set.WRECK_M, name="wreck")
    for o, show in ((ship, (True, False)), (wreck, (False, True))):
        for ob in [o] + list(o.children_recursive):
            for f, vis in ((85, show[0]), (86, show[1])):
                ob.hide_render = not vis
                ob.keyframe_insert("hide_render", frame=f)
    flash = lib.point(hit + Vector((0, -10, 12)) * K, "#ffd2a0", 0, radius=10 * K, name="flash")
    key(flash.data, "energy", [(85, 0), (86, 4e7 * K * K), (90, 4e6 * K * K), (105, 0)])
    plume, dens = blob(hit + Vector((0, 0, 5)) * K, 1, "#a68862", 0.08 / K, "plume")
    key(plume, "scale", [(85, Vector((1, 1, 1))), (86, Vector((20, 20, 8)) * K), (105, Vector((95, 95, 45)) * K)])
    for f, d in ((86, 0.12 / K), (105, 0.03 / K)):
        dens.default_value = d
        dens.keyframe_insert("default_value", frame=f)
    cam = lib.camera(Vector((40, -90, 10)) * K + hit * 0, hit + Vector((0, 0, 22)) * K, lens=30)
    cam.location = hit + (Vector((40, -90, 10)) - Vector((-30, 130, 0))) * K
    shake(cam, 86, 100, 2.5 * K, seed=5)


def shot3():
    night_world()
    S = game_set.build(scenery=False)  # no reactor, no ore: level 1 lets you find them
    for o in bpy.data.objects:  # the level's ridge stand-in boxes are for the preview only
        if o.type == "MESH" and any(m and m.name.startswith("ridge") for m in o.data.materials): o.hide_render = True
    pod = S["pods"][0]
    pod_c = pod.location.copy(); pod_c.z = 0
    lid = bpy.data.objects["lid0"]  # still sealed: the closed pose game_film.py opens from
    yw = math.radians(-90)
    off = Vector((-0.034, 0.258)) * POD_K
    lid.rotation_euler = (0, 0, yw)
    lid.location = (pod_c.x + off.y * math.sin(yw), pod_c.y - (-off.x * math.sin(yw)), -game_set.POD_BURY + 1.909 * POD_K)
    wreck = S["wreck"].location.copy()
    lib.point(pod_c + Vector((-1.6, 1.4, 1.5)), "#ff3424", 110, radius=0.15, name="emergency")
    lib.dust(n=260, x=(-20, 40), y=(-45, -10), z=(0, 6), loop=60, wind=(6, 1, 0.2), seed=41, color="#c9b393")
    mid = (wreck + pod_c) / 2 + Vector((0, 0, 2.5))
    # crash.py shot 3's camera, the same slow push in, on the smaller site (offsets x0.45 from the pod)
    look = pod_c + Vector((0.45, -0.2, 1.35))
    cam = lib.camera(pod_c + Vector((16.2, -22.5, 4.0)), look, lens=30)
    key(cam, "location", [(106, pod_c + Vector((16.2, -22.5, 4.0))), (165, pod_c + Vector((9.9, -14.2, 2.9)))])


for n in ([only] if only else (1, 2, 3)):
    sc = lib.reset(720, 1280)
    if "--quick" in args: sc.eevee.taa_render_samples = 12
    lib.bloom(threshold=1.0, size=7)
    {1: shot1, 2: shot2, 3: shot3}[n]()
    sc.render.use_motion_blur = "--quick" not in args
    f0, f1 = SHOTS[n]
    if "--check" in args:
        for f in (f0, (f0 + f1) // 2, f1):
            sc.frame_set(f)
            lib.render_still(os.path.join(lib.OUT, f"game_crash_{n}_{f:03d}.png"))
    else:
        lib.render_frames(FOLDER, f0, f1)
