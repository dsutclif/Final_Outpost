# Landing screen: dusk over the young outpost. The commander in the foreground looks toward the
# ridge, where the pulse flashes; the Halcyon wreck lies on the plain; the reactor glows.
# Top third stays sky for the title, bottom sixth ground for the Play button.
# blender -b --factory-startup -P tools/cinematics/title.py -- [--quick | --frames]
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import math
import bpy
from mathutils import Matrix, Vector
import lib

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
frames = "--frames" in args
quick = "--quick" in args
LOOP = 180  # frames (6 s at 30 fps); every motion below repeats a whole number of times per loop

sc = lib.reset(*((540, 960) if quick else (720, 1280) if frames else (1080, 1920)))
if quick: sc.eevee.taa_render_samples = 16

# Pale dusty dusk, low saturation (docs/ART-DIRECTION.md): khaki haze, slate zenith, low warm sun
lib.sky(horizon="#d8c3a2", zenith="#55566a", haze=0.0022, haze_color="#c4baa8")
# A sun this low barely lights the sand, so the sky washes out what it shadows: raise it a little
# and dim the sky so the crew's shadows read on the ground.
lib.sun(elevation=20, azimuth=-115, strength=4.2, color="#ffe0c4")
bpy.context.scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
lib.ground()
lib.ridge(at=(0, 300, -1), length=1500, depth=170, height=48, seed=4, color="#4a3f36")
lib.ridge(at=(-120, 520, -3), length=1800, depth=240, height=95, seed=9, color="#665547")
lib.bloom(threshold=0.9, size=8)
lib.rocks(n=110, x=(-12, 12), y=(-10.5, 12), size=(0.05, 0.28), seed=7)
lib.rocks(n=40, x=(-60, 60), y=(12, 80), size=(0.3, 1.4), seed=8)

# the colony, set back behind the commander
core = lib.place("sink.core.l1", at=(-3, 14, 0), size=7)
lib.reactor_glow(core, 7, power=20000)
lib.place("sink.sales_point", at=(9, 22, 0), yaw=35, size=6)
lib.place("conv.food_processor", at=(-13, 26, 0), yaw=-20, size=6.5)
lib.place("struct.housing", at=(5, 34, 0), yaw=10, size=4)
lib.place("struct.housing", at=(11, 33, 0), yaw=-15, size=4)
lib.place("struct.landmark", at=(-2, 50, 0), yaw=15, size=13)
lib.place("node.food_source", at=(14, 12, 0), yaw=20, size=4)
lib.place("node.material_source", at=(-5.5, 1, 0), size=1.6)
lib.place("node.material_source", at=(-7.5, 3, 0), yaw=40, size=1.4)
lib.place("node.material_source", at=(-1.8, -6.5, 0), yaw=70, size=1.1)

# the crew at work: a hauler picking at the ore pile by the wreckage (-5.5, 1)
CREW = 1.5  # metres
PROP_K = CREW / 1.1  # props are fitted to the game's 1.1 m characters (meshy.json)
w = lib.place("role.supplier", at=(-4.8, 1.4, 0), yaw=-60, height=CREW, rigged=True)
# the pick's sharp end is its file's -x: fitted at the bottom of the swing, pointing at the ground
STRIKE = 53
pick = lib.hold(w, "prop.pickaxe", "Heavy_Hammer_Swing", STRIKE, side=(-1, 0, 0), grip=(0, 0.03, 0), k=PROP_K * 1.25, want=(0, 0, -1), palm=True)
lib.brighten(pick, 2.6)  # dark steel on a dark suit vanishes at this distance
strike = lib.bake_cycle(w, "Heavy_Hammer_Swing", STRIKE, LOOP, n=3, recover=12, grip=55)  # three swings per loop

# a ranger shooting a spiked hopper
# One hopper per loop: it comes in from off screen under fire, drops, fades, and the next starts as the loop does.
HOP_FROM, HOP_TO, HOP_Y = 9.5, 3.0, 9.0
DIES, ROLLED, FADE_FROM, FADE_TO = 130, 146, 150, 178
def hopper_at(f):
    u = min(1.0, (f - 1) / (DIES - 1))
    return Vector((HOP_FROM + (HOP_TO - HOP_FROM) * u, HOP_Y, 0.55))
r = lib.place("role.hunter", at=(-0.2, 9.7, 0), yaw=103, height=CREW, rigged=True)
SHOTS = (48, 66, 84, 102, 120, 128)
rifle = lib.hold(r, "prop.rifle_ranger", "Run_and_Shoot", 1 + 0.3 * 21, gun=True, axis=(-1, 0, 0), side=(0, 1, 0), grip=(0.1, 0.05, 0), k=PROP_K)
# the muzzle: the middle of the model's front end (its file's -x)
pts = [c.matrix_local @ v.co for c in rifle.children_recursive if c.type == "MESH" for v in c.data.vertices]
front = min(p.x for p in pts)
tip = [p for p in pts if p.x < front + 0.015]
muzzle = bpy.data.objects.new("muzzle", None)
bpy.context.scene.collection.objects.link(muzzle)
muzzle.parent = rifle
muzzle.location = sum(tip, Vector()) / len(tip)
lib.animate(r, "01a14f15", speed=lib.cycles("01a14f15", 2, LOOP))
h = lib.place("node.prey_dangerous", at=(HOP_FROM, HOP_Y, 0), yaw=-90, size=1.2, rigged=True)
HOPS = 5
hop = lib.animate(h, "Armature|Unreal Take", speed=lib.cycles("Armature|Unreal Take", HOPS, DIES - 1))
hop.repeat = HOPS
hop.extrapolation = "HOLD"  # the last hop's pose, for the body to fall from
lib.settle(h, 1)
hz = h.location.z
for f, x, z, roll in ((1, HOP_FROM, hz, 0), (DIES, HOP_TO, hz, 0), (ROLLED, HOP_TO, hz - 0.05, 100), (LOOP, HOP_TO, hz - 0.05, 100)):
    h.location = (x, HOP_Y, z)
    h.rotation_euler = (0, math.radians(roll), math.radians(-90))
    h.keyframe_insert("location", frame=f)
    h.keyframe_insert("rotation_euler", frame=f)
for fc in lib.fcurves(h):
    for kp in fc.keyframe_points:
        kp.interpolation = "LINEAR"
for name in h["meshes"]:
    for m in bpy.data.objects[name].data.materials:
        b = m.node_tree.nodes["Principled BSDF"].inputs["Alpha"]
        for link in list(b.links): m.node_tree.links.remove(link)
        for f, v in ((1, 1), (FADE_FROM, 1), (FADE_TO, 0)):
            b.default_value = v
            b.keyframe_insert("default_value", frame=f)
# aim: turn the ranger toward the middle of the hopper's walk; the rifle follows it shot by shot below
barrel = lambda: -rifle.matrix_world.to_3x3().col[0].normalized()
def muzzle_at(f):
    sc.frame_set(f)
    bpy.context.view_layer.update()
    return muzzle.matrix_world.translation.copy()
mid = SHOTS[len(SHOTS) // 2]
to = hopper_at(mid) - muzzle_at(mid)
b = barrel()
r.rotation_euler.z += math.atan2(to.y, to.x) - math.atan2(b.y, b.x)
lib.settle(w, 1); lib.settle(r, 1)

# the wreck on the plain, a big broken silhouette left of the colony
lib.place("halcyon_wreck", at=(-40, 85, 0), yaw=35, size=80)

# the pulse: a pale point of light on the ridge crest
PULSE = (28, 300, 47)
lib.point(PULSE, "#9fdcff", 1_200_000, radius=3, name="pulse")
bpy.ops.mesh.primitive_uv_sphere_add(radius=1.1, location=PULSE)
bpy.context.object.data.materials.append(lib.mat("pulse", "#ffffff", emit="#d8f2ff", strength=200))

# the commander, foreground right, looking toward the ridge
cmd = lib.place("unit.player", at=(-0.1, -9.0, 0), yaw=165, height=CREW, name="commander", rigged=True)
lib.still(cmd); lib.pose(cmd, lib.STAND)
lib.settle(cmd, 1)
# nothing crowding the boots, and a soft dark patch tying each of the crew to the ground
for o in [o for o in bpy.data.objects if o.name.startswith("Ico") and o.type == "MESH" and o.dimensions.x > 0.05]:
    if (o.location.xy - cmd.location.xy).length < 1.3:
        bpy.data.objects.remove(o)
lib.contact(cmd.location, 0.55)
lib.contact(w.location, 0.55)
lib.contact(r.location, 0.55)

lib.camera((-1.6, -14.6, 1.15), (-1.0, 40, 7.2), lens=30)

# ---- motion for the loop (frame 1 of it is the still) ----
import math
reactor = bpy.data.objects["reactor_light"]
pulse_light = bpy.data.objects["pulse"]
pulse_mat = bpy.data.materials["pulse"].node_tree.nodes["Principled BSDF"].inputs["Emission Strength"]
for f in range(1, LOOP + 2):
    t = (f - 1) / LOOP
    # reactor: a slow breathing glow with a little flicker, periods dividing the loop
    k = 1 + 0.10 * math.sin(t * 6.283 * 3) + 0.05 * math.sin(t * 6.283 * 11 + 1.3) + 0.03 * math.sin(t * 6.283 * 23)
    reactor.data.energy = 20000 * k
    reactor.data.keyframe_insert("energy", frame=f)
    # the pulse: dim, then two bright beats per loop (~1.3 s and ~4.3 s)
    beat = max(math.exp(-((f - 40) / 6) ** 2), math.exp(-((f - 130) / 6) ** 2))
    pulse_light.data.energy = 150_000 + 6_000_000 * beat
    pulse_light.data.keyframe_insert("energy", frame=f)
    pulse_mat.default_value = 25 + 4000 * beat
    pulse_mat.keyframe_insert("default_value", frame=f)
# commander breathing: two slow breaths per loop
for f, s in ((1, 0), (23, 1), (46, 0), (68, 1), (91, 0), (113, 1), (136, 0), (158, 1), (181, 0)):
    lib.pose(cmd, {**lib.STAND, "Spine2": (-1.6 * s, 0, 0), "Neck": (1.0 * s, 0, 0)}, frame=f)

# the ranger's shots: a tracer out along the barrel, as far as the hopper, and a flash, two frames each
bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.007, depth=1)
tracer = bpy.context.object
tracer.data.materials.append(lib.mat("tracer", "#ffffff", emit="#ffd9a0", strength=60))
for v in tracer.data.vertices: v.co.z += 0.5
flash = lib.point((0, 0, 0), "#ffc27a", 0, radius=0.1, name="muzzle_flash")
tracer.scale = (0, 0, 0)
tracer.keyframe_insert("scale", frame=1)
flash.data.keyframe_insert("energy", frame=1)
first = None
for f in SHOTS:
    a = muzzle_at(f)
    p = rifle.matrix_world.translation.copy()
    rifle.matrix_world = Matrix.Translation(p) @ barrel().rotation_difference(hopper_at(f) - a).to_matrix().to_4x4() @ Matrix.Translation(-p) @ rifle.matrix_world
    bpy.context.view_layer.update()
    first = first or (rifle.location.copy(), rifle.rotation_euler.copy())
    rifle.keyframe_insert("location", frame=f)
    rifle.keyframe_insert("rotation_euler", frame=f)
    a = muzzle.matrix_world.translation.copy()
    aim = barrel()
    print("shot", f, "muzzle", a, "misses the hopper by", (hopper_at(f) - a - aim * (hopper_at(f) - a).dot(aim)).length)
    tracer.location = a
    tracer.rotation_euler = aim.to_track_quat("Z", "Y").to_euler()
    tracer.scale = (1, 1, (hopper_at(f) - a).dot(aim))
    flash.location = a
    for o, path in ((tracer, "location"), (tracer, "rotation_euler"), (tracer, "scale"), (flash, "location")):
        o.keyframe_insert(path, frame=f)
    flash.data.energy = 60
    flash.data.keyframe_insert("energy", frame=f)
    tracer.scale = (0, 0, 0)
    flash.data.energy = 0
    tracer.keyframe_insert("scale", frame=f + 2)
    flash.data.keyframe_insert("energy", frame=f + 2)
for o in (tracer, flash, flash.data):
    for fc in lib.fcurves(o):
        for kp in fc.keyframe_points:
            kp.interpolation = "CONSTANT"
rifle.location, rifle.rotation_euler = first  # back where the loop starts
for f in (1, LOOP + 1):
    rifle.keyframe_insert("location", frame=f)
    rifle.keyframe_insert("rotation_euler", frame=f)
lib.dust(n=220, x=(-9, 9), y=(-11, 6), z=(0.05, 2.2), loop=LOOP, wind=(2.2, 0.4, 0.15), seed=11)
sc.render.use_motion_blur = frames
sc.frame_set(1)

if "--close" in args:  # from the shot's own camera, zoomed: the pick, the commander's feet, the hopper
    cam = bpy.context.scene.camera
    def shots(name, look, lens, fs):
        lib.aim(cam, look)
        cam.data.lens = lens
        for f in fs:
            sc.frame_set(f)
            lib.render_still(os.path.join(lib.OUT, "title_close", f"{name}_{f:03d}.png"))
    shots("pick", (-5.1, 1.2, 0.55), 330, (28, strike - 6, strike - 3, strike, strike + 3))
    shots("feet", (0.2, -9.0, 0.2), 90, (1,))
elif "--check" in args:  # seam check: frame 181 must equal frame 1
    for f in (1, 40, 100, 181):
        sc.frame_set(f)
        lib.render_still(os.path.join(lib.OUT, f"check_{f:03d}.png"))
elif frames:
    lib.render_frames(os.path.join(lib.OUT, "title_loop"), 1, LOOP)
else:
    lib.render_still(os.path.join(lib.OUT, "title_quick.png" if quick else "title_still.png"))
