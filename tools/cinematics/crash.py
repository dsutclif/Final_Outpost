# crash_open: the cinematic before level 1 (docs/STORY-LEVELS.md). 12.5 s at 30 fps:
#   1 descent    f1-75     the Halcyon dives through the storm; the pulse flashes, the engines cut out
#   2 impact     f76-105   wide: it hits the plain; flash, dust plume, camera shake
#   3 the wreck  f106-165  dawn: the broken Halcyon on the plain, red light glowing in the break
#   4 the pod    f166-300  a torn deck by the break, five pods (four still sealed: bays five to
#                          eight); the commander's pod vents, the lid swings open, they sit up, swing
#                          their legs over the rim, slide off and stagger to the deck edge
#   5 the drop   f301-375  the commander drops to the sand, stands, and the camera cranes out to the
#                          game camera over the dark reactor
# blender -b --factory-startup -P tools/cinematics/crash.py -- [--shot N] [--quick] [--check]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
quick = "--quick" in args
only = int(args[args.index("--shot") + 1]) if "--shot" in args else None
SHOTS = {1: (1, 75), 2: (76, 105), 3: (106, 165), 4: (166, 300), 5: (301, 375)}
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


# ---------------------------------------------------------------- the crash site (shots 3-5)
# Doug's wreck at 60 m, nose -X, lying across the plain; the hull broke in two at x = 12. A torn
# deck section spills out of the break with five cryo pods on it (the commander's nearest the
# camera; the other four sealed: bays five to eight). Shared by shots 3, 4 and 5 so the geography
# holds from the establishing shot to the hand-off.
DECK_Z = 1.5                       # deck top, metres above the sand
PODS_X = (10.6, 12.0, 13.4, 14.8)  # the four sealed pods (bays five to eight)
POD_Y = -3.6                       # pods lie along Y (head end toward the hull)
POD = Vector((8.1, -4.3, DECK_Z))   # the commander's pod, knocked askew
POD_YAW = -55.0                    # its turn, degrees: its open side faces the camera
EDGE = Vector((8.3, -5.9, DECK_Z))  # where the commander stands at the deck's front edge
END = Vector((8.1, -8.0, 0.0))       # where they land on the sand: the hand-off spot
CUT = 0.55                         # the pod opens at this fraction of its height


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


def open_pod(root):
    """Cut a pod model into a tub and a lid at CUT of its height; the lid hangs on a hinge along its
    -X rim (the side away from the camera). Returns the hinge (rotate it about Y, negative, to
    open), the rim height and the pod's bounds, all before the pod is turned (long axis Y)."""
    import bmesh
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
    bpy.context.view_layer.update()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in root.children_recursive:
        if o.type == "MESH":
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    rim_z = lo.z + (hi.z - lo.z) * CUT
    hinge = bpy.data.objects.new("hinge", None)
    bpy.context.scene.collection.objects.link(hinge)
    hinge.location = (lo.x, (lo.y + hi.y) / 2, rim_z)
    bpy.context.view_layer.update()
    lid.parent = hinge
    lid.matrix_parent_inverse = hinge.matrix_world.inverted()
    # dark padding inside the tub so the hollow shell reads as a bed
    bpy.ops.mesh.primitive_cube_add(size=1, location=((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z + 0.2))
    pad = bpy.context.object
    pad.scale = ((hi.x - lo.x) * 0.72, (hi.y - lo.y) * 0.86, 0.22)
    pad.data.materials.append(lib.mat("padding", "#2b2f33", rough=0.8))
    # turn the whole pod (tub, lid hinge, padding) about its centre: knocked askew in the crash
    rig = bpy.data.objects.new("podrig", None)
    bpy.context.scene.collection.objects.link(rig)
    rig.location = POD
    bpy.context.view_layer.update()
    for o in (root, hinge, pad):
        o.parent = rig
        o.matrix_parent_inverse = rig.matrix_world.inverted()
    rig.rotation_euler = (0, 0, math.radians(POD_YAW))
    return hinge, rim_z, lo, hi


def turned(v):
    """A point given in the pod's unturned frame, in the world (the pod turns POD_YAW about POD)."""
    from mathutils import Matrix
    return POD + Matrix.Rotation(math.radians(POD_YAW), 3, "Z") @ (Vector(v) - POD)


def crash_site(open_lid=False):
    """The wreck, the torn deck section and the pods. Returns the commander's pod hinge and rim."""
    lib.place("halcyon_wreck_site", exact=True, name="wreck")
    # the torn deck: a hull section resting on the sand, spilling out of the break
    bpy.ops.mesh.primitive_cube_add(size=1, location=(11.8, -3.7, DECK_Z / 2))
    deck = bpy.context.object
    deck.name = "deck"
    deck.scale = (10.2, 5.0, DECK_Z)
    deck.rotation_euler = (math.radians(1.5), math.radians(-2), 0)
    deck.data.materials.append(panel_steel())
    bpy.ops.mesh.primitive_cube_add(size=1, location=(11.8, -6.22, DECK_Z - 0.02))
    stripe = bpy.context.object
    stripe.scale = (10.2, 0.12, 0.05)
    stripe.data.materials.append(lib.mat("hazard", "#c8a23a", rough=0.6))
    for x, yaw in ((10.4, 20), (13.6, -35), (16.4, 70)):  # debris at the foot of the section
        lib.place("decor.ship_scrap", at=(x, -7.0, 0), yaw=yaw, size=1.8)
    lib.rocks(n=160, x=(-6, 26), y=(-16, -6.5), size=(0.04, 0.3), seed=17)
    for x in PODS_X:
        lib.place("capture.recruit_container", at=(x, POD_Y, DECK_Z), yaw=90, size=2.4)
    pod = lib.place("capture.recruit_container", at=tuple(POD), yaw=90, size=2.4, name="pod")
    hinge, rim_z, lo, hi = open_pod(pod)
    if open_lid:
        hinge.rotation_euler = (0, math.radians(-112), 0)
    return hinge, rim_z, lo, hi


def hip_height(root):
    arm = bpy.data.objects[root["armature"]]
    bpy.context.view_layer.update()
    return (arm.matrix_world @ arm.data.bones["mixamorig:Hips"].head_local).z - root.location.z


def pivoted(root, at):
    """Hang a character from an empty at its hips, so whole-body turns pivot about the pelvis."""
    hz = hip_height(root)
    pivot = bpy.data.objects.new("pivot", None)
    bpy.context.scene.collection.objects.link(pivot)
    pivot.location = at
    root.parent = pivot
    root.matrix_parent_inverse.identity()
    root.location = (0, 0, -hz)
    root.rotation_euler = (0, 0, 0)
    return pivot, hz


# ---------------------------------------------------------------- 3 establishing
def shot3():
    dawn()
    crash_site()
    # the emergency light still glowing red in the break
    lib.point((12, -1.5, 3.2), "#ff3424", 4000, radius=0.6, name="emergency")
    lib.dust(n=260, x=(-20, 40), y=(-45, -10), z=(0, 6), loop=60, wind=(6, 1, 0.2), seed=41, color="#c9b393")
    cam = lib.camera((48, -52, 9), (12, -2, 3), lens=30)
    key(cam, "location", [(106, Vector((48, -52, 9))), (165, Vector((33, -33, 6.5)))])


# ---------------------------------------------------------------- 4 pod
def shot4():
    sc = bpy.context.scene
    dawn()
    hinge, rim_z, lo, hi = crash_site()
    lib.point((10.5, -1.2, 3.6), "#ff3424", 0, radius=0.3, name="emergency")
    red = bpy.data.objects["emergency"]
    for f in range(166, 301):
        red.data.energy = 900 + 700 * math.sin((f - 166) / 30 * 6.283)
        red.data.keyframe_insert("energy", frame=f)
    # the seal blows: a cold flash, steam, the lid swings over on its hinge
    seal = lib.point((POD.x, POD.y, rim_z + 0.4), "#cfe6ff", 0, radius=0.5, name="seal")
    key(seal.data, "energy", [(171, 0), (173, 2600), (195, 250), (300, 120)])
    key(hinge, "rotation_euler", [(174, (0, 0, 0)), (178, (0, math.radians(-8), 0)), (196, (0, math.radians(-112), 0))])
    for i, (dx, dy, r) in enumerate(((0, 0.3, 0.6), (-0.3, -0.5, 0.5), (0.25, 0.8, 0.55), (0, -0.2, 0.75))):
        s, d = blob((POD.x + dx, POD.y + dy, rim_z + 0.25), 1, "#e8eef2", 0.0, f"steam{i}")
        key(s, "scale", [(173 + i * 2, Vector((r, r, r * 0.7))), (215, Vector((r * 2.6, r * 2.6, r * 2.8)))])
        for f, v in ((172 + i * 2, 0.0), (175 + i * 2, 1.9), (200, 0.4), (230, 0.0)):
            d.default_value = v
            d.keyframe_insert("default_value", frame=f)

    # the commander: lying in the pod on their back (head toward the hull), sits up, swings their
    # legs over the near rim, slides off, staggers to the deck edge and looks out over the plain
    cmd = lib.place("unit.player", at=(0, 0, 0), yaw=0, height=1.8, name="commander")
    lib.still(cmd)
    pivot, hz = pivoted(cmd, (POD.x, POD.y - 0.15, lo.z + 0.27))
    arms_down = {"LeftArm": (0, 0, -32), "RightArm": (0, 0, 32)}
    lying = {**arms_down, "Neck": (-8, 0, 0)}
    rising = {"LeftUpLeg": (-60, 0, 0), "RightUpLeg": (-60, 0, 0), "Spine": (18, 0, 0), "Spine1": (10, 0, 0),
              "LeftArm": (-25, 0, -40), "RightArm": (-25, 0, 40), "LeftForeArm": (0, 0, -40), "RightForeArm": (0, 0, 40)}
    sitting = {"LeftUpLeg": (-88, 0, 0), "RightUpLeg": (-88, 0, 0), "Spine": (6, 0, 0), "Neck": (10, 0, 0),
               "LeftArm": (10, 0, -35), "RightArm": (10, 0, 35)}
    dazed = {**sitting, "Neck": (14, 12, 0), "Head": (6, 10, 0)}
    on_rim = {"LeftUpLeg": (-85, 0, 0), "RightUpLeg": (-80, 0, 0), "LeftLeg": (95, 0, 0), "RightLeg": (88, 0, 0),
              "Spine": (12, 0, 0), "LeftArm": (-35, 0, -20), "RightArm": (-35, 0, 20), "LeftForeArm": (0, 0, -25), "RightForeArm": (0, 0, 25)}
    sliding = {"LeftUpLeg": (-40, 0, 0), "RightUpLeg": (-30, 0, 0), "LeftLeg": (45, 0, 0), "RightLeg": (35, 0, 0),
               "Spine": (22, 0, 0), "LeftArm": (-30, 0, -30), "RightArm": (-30, 0, 30)}
    crouch = {"LeftUpLeg": (-35, 0, 0), "RightUpLeg": (-30, 0, 0), "LeftLeg": (50, 0, 0), "RightLeg": (45, 0, 0),
              "Spine": (24, 0, 0), "LeftArm": (15, 0, -40), "RightArm": (15, 0, 40)}
    stepL = {"LeftUpLeg": (-32, 0, 0), "LeftLeg": (22, 0, 0), "RightUpLeg": (14, 0, 0), "RightLeg": (18, 0, 0),
             "Spine": (14, 0, 0), "LeftArm": (-18, 0, -40), "RightArm": (22, 0, 40)}
    stepR = {"RightUpLeg": (-32, 0, 0), "RightLeg": (22, 0, 0), "LeftUpLeg": (14, 0, 0), "LeftLeg": (18, 0, 0),
             "Spine": (10, 0, 0), "LeftArm": (22, 0, -40), "RightArm": (-18, 0, 40)}
    stand = {**lib.STAND, "Spine": (4, 0, 0)}
    look = {**stand, "Neck": (0, 18, 0), "Head": (-4, 16, 0)}
    poses = [(166, lying), (200, lying), (212, rising), (224, sitting), (232, dazed), (240, sitting), (252, on_rim),
             (258, on_rim), (266, sliding), (272, crouch), (280, stepL), (287, stepR), (293, stand), (300, look)]
    for f, p in poses:
        lib.pose(cmd, p, frame=f)
    # positions in the pod's unturned frame (long axis Y, head end +Y; they climb out over its +X
    # side, the side facing the camera), then turned into the world
    sit_hips = turned((POD.x, POD.y - 0.15, lo.z + 0.27))
    rim = turned((hi.x + 0.05, POD.y - 0.2, rim_z + 0.12))
    off = turned((hi.x + 0.5, POD.y - 0.3, DECK_Z + hz * 0.78))
    off.z = DECK_Z + hz * 0.78
    step1 = Vector(((off.x + EDGE.x) / 2 + 0.05, (off.y + EDGE.y) / 2, DECK_Z + hz * 0.96))
    key(pivot, "location", [(166, sit_hips), (224, sit_hips + Vector((0, 0, 0.12))), (240, sit_hips + Vector((0, 0, 0.12))),
                            (252, rim), (258, rim), (268, off), (272, off), (282, step1),
                            (293, EDGE + Vector((0, 0, hz))), (300, EDGE + Vector((0, 0, hz)))])
    # euler XYZ: X tips the body back to lying (face up, head along the pod); Z turns it with the pod,
    # then a further +90 to face out over the +X rim, then square to the plain (0 faces -Y)
    yaw = math.radians(POD_YAW)
    key(pivot, "rotation_euler", [(166, (math.radians(-90), 0, yaw)), (200, (math.radians(-90), 0, yaw)),
                                  (224, (0, 0, yaw)), (240, (0, 0, yaw)), (252, (0, 0, yaw + math.radians(90))),
                                  (268, (0, 0, yaw + math.radians(90))), (285, (0, 0, math.radians(8))), (300, (0, 0, 0))])
    # camera: in front of the pod's open side, the other pods and the break behind; it eases in
    aim = bpy.data.objects.new("aim", None)
    sc.collection.objects.link(aim)
    key(aim, "location", [(166, Vector((POD.x, POD.y, rim_z + 0.1))), (224, sit_hips + Vector((0, 0, 0.5))),
                          (258, rim + Vector((0, 0, 0.4))), (293, EDGE + Vector((0, 0, 1.4))), (300, EDGE + Vector((0, 0, 1.45)))])
    cam = lib.camera((11.6, -10.0, 2.6), (POD.x, POD.y, 2.2), lens=40)
    key(cam, "location", [(166, Vector((11.6, -10.0, 2.6))), (300, Vector((11.0, -9.3, 2.5)))])
    tt = cam.constraints.new("TRACK_TO")
    tt.target, tt.track_axis, tt.up_axis = aim, "TRACK_NEGATIVE_Z", "UP_Y"
    cam.data.dof.use_dof = True
    cam.data.dof.focus_object = aim
    cam.data.dof.aperture_fstop = 2.8


# ---------------------------------------------------------------- 5 drop
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


def shot5():
    sc = bpy.context.scene
    dawn()
    crash_site(open_lid=True)
    # level 1's start: the dark reactor off to the commander's left, a trail of ore toward it
    lib.place("sink.core.l1", at=(2.4, -9.2, 0), size=4.5, name="reactor")
    for i, (x, y) in enumerate(((7.0, -8.4), (5.9, -8.8), (4.9, -9.1))):
        lib.place("node.material_source", at=(x, y, 0), yaw=30 * i, size=0.9)
    cmd = lib.place("unit.player", at=(0, 0, 0), yaw=0, height=1.8, name="commander")
    lib.still(cmd)
    pivot, hz = pivoted(cmd, EDGE)
    crouch = {"LeftUpLeg": (-75, 0, 0), "RightUpLeg": (-70, 0, 0), "LeftLeg": (110, 0, 0), "RightLeg": (105, 0, 0),
              "Spine": (22, 0, 0), "LeftArm": (35, 0, -40), "RightArm": (35, 0, 40)}
    tuck = {**crouch, "LeftUpLeg": (-45, 0, 0), "RightUpLeg": (-35, 0, 0), "LeftLeg": (60, 0, 0), "RightLeg": (50, 0, 0),
            "Spine": (10, 0, 0), "LeftArm": (10, 0, 10), "RightArm": (10, 0, -10)}
    look = {**lib.STAND, "Neck": (0, -20, 0), "Head": (5, -25, 0)}  # toward the dark reactor
    for f, p in ((301, lib.STAND), (304, crouch), (309, crouch), (313, tuck), (319, tuck), (322, crouch), (330, crouch),
                 (342, lib.STAND), (375, look)):
        lib.pose(cmd, p, frame=f)
    dip = hz * 0.55
    key(pivot, "location", [(301, EDGE + Vector((0, 0, hz))), (304, EDGE + Vector((0, 0, hz - dip))), (309, EDGE + Vector((0, -0.2, hz - dip))),
                            (314, Vector((8.2, -6.8, DECK_Z + hz + 0.25))), (320, END + Vector((0, 0, hz))),
                            (323, END + Vector((0, 0, hz - dip))), (330, END + Vector((0, 0, hz - dip))), (342, END + Vector((0, 0, hz)))])
    key(pivot, "rotation_euler", [(301, (0, 0, 0)), (342, (0, 0, 0)), (360, (0, 0, math.radians(-30)))])
    land, dd = blob(END + Vector((0, 0, 0.2)), 1, "#c9b089", 0.0, "landing")
    key(land, "scale", [(320, Vector((0.4, 0.4, 0.15))), (340, Vector((2.6, 2.6, 0.7)))])
    for f, v in ((319, 0.0), (321, 0.9), (340, 0.0)):
        dd.default_value = v
        dd.keyframe_insert("default_value", frame=f)
    aim = bpy.data.objects.new("aim", None)
    sc.collection.objects.link(aim)
    key(aim, "location", [(301, EDGE + Vector((0, 0, 1.2))), (314, Vector((8.2, -6.8, DECK_Z + 1.2))),
                          (322, END + Vector((0, 0, 0.9))), (375, END + Vector((0, 0, 0.9)))])
    cam = lib.camera((3.4, -12.5, 1.3), (7.8, -5.5, 2.2), lens=30, name="shotcam")
    start = Vector((3.6, -12.2, 1.35))
    crane = crane_path(start, END + Vector((0, 0, 0.9)), 336, 375)
    key(cam, "location", [(301, Vector((3.4, -12.5, 1.3))), (336, start)] + [(f, p) for f, p, _ in crane], "LINEAR")
    key(cam.data, "lens", [(301, 30), (336, 30)] + [(f, l) for f, _, l in crane], "LINEAR")
    tt = cam.constraints.new("TRACK_TO")
    tt.target, tt.track_axis, tt.up_axis = aim, "TRACK_NEGATIVE_Z", "UP_Y"
    sc.render.motion_blur_shutter = 0.3
    shake(cam, 320, 328, 0.06, seed=9)


def build(n):
    sc = lib.reset(*SIZE)
    if quick:
        sc.eevee.taa_render_samples = 12
    lib.bloom(threshold=1.0, size=7)
    {1: shot1, 2: shot2, 3: shot3, 4: shot4, 5: shot5}[n]()
    sc.render.use_motion_blur = not quick
    return sc


for n in ([only] if only else SHOTS):
    f0, f1 = SHOTS[n]
    sc = build(n)
    if "--check" in args:  # three frames per shot
        for f in (f0, (f0 + f1) // 2, f1) + ((200, 224, 252, 268, 287) if n == 4 else (322, 345, 360) if n == 5 else ()):
            sc.frame_set(f)
            lib.render_still(os.path.join(lib.OUT, f"crash_{n}_{f:03d}.png"))
    else:
        lib.render_frames(FOLDER, f0, f1)
