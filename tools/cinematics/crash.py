# crash_open: the cinematic before level 1 (docs/STORY-LEVELS.md). About 7.5 s at 30 fps:
#   1 descent  f1-75     the Halcyon dives through the storm; the pulse flashes, the engines cut out
#   2 impact   f76-105   wide: it hits the plain; flash, dust plume, camera shake
#   3 pod      f106-165  inside the wreck: four closed pods (the crew-gap clue), the commander's
#                        pod vents and the commander sits up into the red emergency light
#   4 drop     f166-225  daylight: the commander drops from the breach, lands, stands, and the
#                        camera cranes out to the game camera over the dark reactor
# blender -b --factory-startup -P tools/cinematics/crash.py -- [--shot N] [--quick] [--check]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
quick = "--quick" in args
only = int(args[args.index("--shot") + 1]) if "--shot" in args else None
SHOTS = {1: (1, 75), 2: (76, 105), 3: (106, 165), 4: (166, 225)}
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


# ---------------------------------------------------------------- 3 pod
def upright_pod(at, name=None):
    """A cryo pod stood on end (the model lies on its long X axis), its round cap facing -Y."""
    p = lib.place("capture.recruit_container", at=at, yaw=0, size=2.4, name=name)
    p.rotation_euler = (math.radians(90), math.radians(90), math.radians(90))
    # standing it up swings it about its base; put its footprint back on `at`, base on the floor
    bpy.context.view_layer.update()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in p.children_recursive:
        if o.type == "MESH":
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    p.location += Vector((at[0] - (lo.x + hi.x) / 2, at[1] - (lo.y + hi.y) / 2, -lo.z))
    return p


def shot3():
    sc = bpy.context.scene
    lib.sky(horizon="#141110", zenith="#080707", haze=0.02, haze_color="#2a2220")
    # the cryo bay: steel deck, hull walls, scrap; daylight through a torn breach on the right
    bpy.ops.mesh.primitive_plane_add(size=40)
    bpy.context.object.data.materials.append(lib.mat("deck", "#3a3a3c", rough=0.6, metal=0.6))
    for loc, scale, col in (((0, 6, 4), (40, 1, 8), "#5d5b57"), ((-7, 0, 4), (1, 20, 8), "#55534f")):
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        w = bpy.context.object
        w.scale = scale
        w.data.materials.append(lib.mat("hull", col, rough=0.7, metal=0.3))
    lib.place("decor.ship_scrap", at=(5, 4, 0), yaw=40, size=4)
    # a row of pods along the back wall: four still sealed and frosted (bays five to eight)
    for i, x in enumerate((-6.4, -4.8, -3.2, -1.6)):
        upright_pod((x, 4.6, 0))
    upright_pod((0.4, 4.6, 0), name="pod")  # the commander's, venting
    cmd = lib.place("unit.player", at=(0.4, 4.0, 0), yaw=0, height=1.8, name="commander")
    lib.still(cmd)
    slump = {"Spine": (25, 0, 0), "Spine1": (15, 0, 0), "Neck": (20, 0, 0), "LeftArm": (0, 0, -40), "RightArm": (0, 0, 40),
             "LeftUpLeg": (-10, 0, 0), "RightUpLeg": (-5, 0, 0), "LeftLeg": (20, 0, 0), "RightLeg": (15, 0, 0)}
    stepL = {**slump, "Spine": (15, 0, 0), "LeftUpLeg": (-35, 0, 0), "LeftLeg": (25, 0, 0), "RightUpLeg": (15, 0, 0), "RightLeg": (20, 0, 0),
             "LeftArm": (-20, 0, -45), "RightArm": (25, 0, 45)}
    stepR = {**slump, "Spine": (10, 0, 0), "RightUpLeg": (-35, 0, 0), "RightLeg": (25, 0, 0), "LeftUpLeg": (15, 0, 0), "LeftLeg": (20, 0, 0),
             "LeftArm": (25, 0, -45), "RightArm": (-20, 0, 45)}
    upright = {**lib.STAND, "Neck": (5, 0, 0)}
    look = {**upright, "Neck": (0, -25, 0), "Head": (-5, -20, 0)}  # toward the breach light
    for f, p in ((106, slump), (128, slump), (136, stepL), (144, stepR), (150, slump), (158, upright), (165, look)):
        lib.pose(cmd, p, frame=f)
    key(cmd, "location", [(106, Vector((0.4, 4.0, 0))), (128, Vector((0.4, 4.0, 0))), (144, Vector((-0.1, 2.9, 0))), (150, Vector((-0.5, 2.4, 0)))])
    # steam pours out of the opened pod and hides the commander until they step through it
    for i, (dx, dz, r) in enumerate(((0, 1.0, 0.7), (-0.3, 1.8, 0.6), (0.35, 1.5, 0.6), (0, 0.4, 0.8))):
        s, d = blob((0.4 + dx, 3.9, dz), 1, "#e8eef2", 0.0, f"steam{i}")
        key(s, "scale", [(108 + i * 2, Vector((r, r * 0.8, r))), (160, Vector((r * 2.2, r * 2.6, r * 2)))])
        for f, v in ((107 + i * 2, 0.0), (110 + i * 2, 2.2), (140, 0.5), (165, 0.05)):
            d.default_value = v
            d.keyframe_insert("default_value", frame=f)
    seal = lib.point((0.4, 3.6, 1.6), "#cfe6ff", 0, radius=0.6, name="seal")
    key(seal.data, "energy", [(107, 0), (109, 2500), (125, 300), (165, 150)])
    # red emergency light pulsing; a shaft of pale daylight from the breach
    red = lib.point((-2.5, 2.5, 4.2), "#ff3020", 0, radius=0.3, name="emergency")
    for f in range(106, 166):
        red.data.energy = 350 + 280 * math.sin((f - 106) / 30 * 6.283)
        red.data.keyframe_insert("energy", frame=f)
    day = bpy.data.lights.new("breach", "SPOT")
    day.energy, day.color, day.spot_size, day.spot_blend = 25000, lib.rgb("#ffe8cc")[:3], math.radians(30), 0.6
    d = bpy.data.objects.new("breach", day)
    sc.collection.objects.link(d)
    d.location = (10, -2, 6)
    lib.aim(d, (0.4, 2.8, 0.8))
    cam = lib.camera((0.6, -3.6, 1.3), (-2.3, 4.6, 1.3), lens=24)
    key(cam, "location", [(106, Vector((0.6, -3.6, 1.3))), (165, Vector((0.5, -2.4, 1.4)))])


# ---------------------------------------------------------------- 4 drop
END = Vector((-0.4, 1.1, 0.0))  # where the commander stands at the hand-off


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


def shot4():
    sc = bpy.context.scene
    # the storm has passed: pale dusty daylight, the game's own light (sun low from the left)
    lib.sky(horizon="#d8cbb4", zenith="#8d93a0", haze=0.0018, haze_color="#c4baa8")
    lib.sun(elevation=32, azimuth=-130, strength=3.3, color="#fff0dc")
    lib.ground()
    lib.ridge(at=(0, 300, -1), length=1500, depth=170, height=48, seed=4, color="#4a3f36")
    lib.rocks(n=120, x=(-14, 14), y=(-1, 14), size=(0.05, 0.3), seed=17)
    lib.place("halcyon_wreck", at=(-6, 22, 0), yaw=-25, size=55, name="wreck")
    lib.place("decor.ship_scrap", at=(-1.2, 4.2, 0), yaw=15, size=3.2, name="ledge")
    lib.place("sink.core.l1", at=(3.6, -0.2, 0), size=4.5, name="reactor")  # dark: not lit yet; off the game camera axis
    for i, (x, y) in enumerate(((0.5, 0.9), (1.2, 0.5), (1.8, 0.2))):  # the ore trail to the reactor
        lib.place("node.material_source", at=(x, y, 0), yaw=30 * i, size=0.9)
    cmd = lib.place("unit.player", at=(-1.2, 4.2, 2.0), yaw=20, height=1.8, name="commander")
    lib.still(cmd)
    crouch = {"LeftUpLeg": (-75, 0, 0), "RightUpLeg": (-70, 0, 0), "LeftLeg": (110, 0, 0), "RightLeg": (105, 0, 0),
              "Spine": (22, 0, 0), "LeftArm": (35, 0, -40), "RightArm": (35, 0, 40)}
    tuck = {**crouch, "LeftUpLeg": (-45, 0, 0), "RightUpLeg": (-35, 0, 0), "LeftLeg": (60, 0, 0), "RightLeg": (50, 0, 0), "Spine": (10, 0, 0),
            "LeftArm": (10, 0, 10), "RightArm": (10, 0, -10)}
    look = {**lib.STAND, "Neck": (0, -20, 0), "Head": (5, -25, 0)}  # toward the dark reactor
    for f, p in ((166, crouch), (171, crouch), (176, tuck), (183, tuck), (186, crouch), (194, crouch), (206, lib.STAND), (225, look)):
        lib.pose(cmd, p, frame=f)
    # the leap: off the ledge (2 m up), an arc forward, a hard landing that sinks into the crouch
    key(cmd, "location", [(166, Vector((-1.2, 4.2, 1.55))), (171, Vector((-1.2, 4.0, 1.55))),
                          (177, Vector((-0.8, 2.6, 2.5))), (184, END),
                          (187, END + Vector((0, 0, -0.45))), (194, END + Vector((0, 0, -0.45))), (206, END)])
    land, dd = blob(END + Vector((0, 0, 0.2)), 1, "#c9b089", 0.0, "landing")
    key(land, "scale", [(184, Vector((0.4, 0.4, 0.15))), (205, Vector((2.6, 2.6, 0.7)))])
    for f, v in ((183, 0.0), (185, 0.9), (205, 0.0)):
        dd.default_value = v
        dd.keyframe_insert("default_value", frame=f)
    # camera: low and close on the leap (from the left, clear of the reactor), then a crane out
    # to the in-game view centred on the commander (render-3d: 30° pitch, 45° yaw; viewW 170
    # units = 4 hero heights = 7.3 m at 1.8 m per hero)
    cam = lib.camera((-2.0, -1.8, 1.4), (-1.1, 3.6, 2.4), lens=30, name="shotcam")
    a_loc, a_rot = cam.location.copy(), cam.rotation_euler.copy()
    crane = crane_path(a_loc + Vector((0.3, -0.5, 0.1)), END + Vector((0, 0, 0.9)), 196, 225)
    key(cam, "location", [(166, a_loc), (196, a_loc + Vector((0.3, -0.5, 0.1)))] + [(f, p) for f, p, _ in crane], "LINEAR")
    # the camera stays on the commander through the leap: aim at a target that follows them
    aim_at = bpy.data.objects.new("aim", None)
    sc.collection.objects.link(aim_at)
    key(aim_at, "location", [(166, Vector((-1.2, 4.2, 2.6))), (177, Vector((-0.9, 2.8, 2.6))), (186, END + Vector((0, 0, 0.9))), (225, END + Vector((0, 0, 0.9)))])
    tt = cam.constraints.new("TRACK_TO")
    tt.target, tt.track_axis, tt.up_axis = aim_at, "TRACK_NEGATIVE_Z", "UP_Y"
    key(cam.data, "lens", [(166, 30), (196, 30)] + [(f, l) for f, _, l in crane], "LINEAR")
    sc.render.motion_blur_shutter = 0.3
    sc.camera = cam
    shake(cam, 184, 192, 0.06, seed=9)


def build(n):
    sc = lib.reset(*SIZE)
    if quick:
        sc.eevee.taa_render_samples = 12
    lib.bloom(threshold=1.0, size=7)
    {1: shot1, 2: shot2, 3: shot3, 4: shot4}[n]()
    sc.render.use_motion_blur = not quick
    return sc


for n in ([only] if only else SHOTS):
    f0, f1 = SHOTS[n]
    sc = build(n)
    if "--check" in args:  # three frames per shot
        for f in (f0, (f0 + f1) // 2, f1) + ((202, 210, 217) if n == 4 else ()):
            sc.frame_set(f)
            lib.render_still(os.path.join(lib.OUT, f"crash_{n}_{f:03d}.png"))
    else:
        lib.render_frames(FOLDER, f0, f1)
