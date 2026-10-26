# helmet_reveal: after level 5's win (docs/STORY-LEVELS.md). About 4 s at 30 fps, at night.
# The raider lieutenant's helmet lies where it fell, dust still settling; the camera creeps in,
# then tips down to the crew ID card that slipped out of the neck ring: BAY 5, FIRST OFFICER.
# blender -b --factory-startup -P tools/cinematics/helmet.py -- [--quick] [--check]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
quick = "--quick" in args
F0, F1 = 1, 120
sc = lib.reset(*((360, 640) if quick else (720, 1280)))
if quick:
    sc.eevee.taa_render_samples = 12
sc.render.use_motion_blur = not quick
lib.bloom(threshold=1.0, size=6)

# night: cool moonlight from behind, warm light from a burning wreck off screen
lib.sky(horizon="#1d2332", zenith="#05070c", haze=0.0, haze_color="#2a2f3a")
lib.sun(elevation=22, azimuth=150, strength=0.45, color="#a9bde0", angle=1.0)
lib.ground()
lib.rocks(n=110, x=(-1.2, 1.2), y=(-0.2, 1.2), size=(0.006, 0.03), seed=31)
lib.rocks(n=30, x=(-6, 6), y=(1, 8), size=(0.05, 0.25), seed=32)

# the helmet: neck opening toward the camera (-Y at yaw 0), turned a little
helmet = lib.place("helmet", at=(0, 0, 0), yaw=18, size=0.42, name="helmet")
fire = lib.point((1.4, -0.9, 0.5), "#ff8a3a", 0, radius=0.4, name="fire")
for f in range(F0, F1 + 1):
    fire.data.energy = 60 + 14 * math.sin(f * 0.9) + 9 * math.sin(f * 2.3 + 1) + 5 * math.sin(f * 5.1)
    fire.data.keyframe_insert("energy", frame=f)
visor = lib.point((-0.05, 0.02, 0.2), "#ff2a1a", 0.35, radius=0.05, name="visor")

# the ID card, slipped out onto the sand in front of the neck ring
card = bpy.data.materials.new("badge")
card.use_nodes = True
nt = card.node_tree
b = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(os.path.join(lib.HERE, "assets", "badge_bay5.png"))
nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
b.inputs["Roughness"].default_value = 0.45
bpy.ops.mesh.primitive_plane_add(size=1, location=(0.07, -0.31, 0.004))
badge = bpy.context.object
badge.name = "badge"
badge.scale = (0.054, 0.054 * 2000 / 1493, 1)  # the card image's aspect
badge.rotation_euler = (math.radians(4), math.radians(-3), math.radians(16))
badge.data.materials.append(card)

# dust from the fall, settling
dust = bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, -0.05, 0.08))
puff = bpy.context.object
m = bpy.data.materials.new("puff")
m.use_nodes = True
mt = m.node_tree
mt.nodes.remove(mt.nodes["Principled BSDF"])
vol = mt.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Color"].default_value = lib.rgb("#8f7c66")
mt.links.new(vol.outputs["Volume"], mt.nodes["Material Output"].inputs["Volume"])
puff.data.materials.append(m)
for f, s, d in ((F0, 0.25, 6.0), (45, 0.55, 0.8), (80, 0.7, 0.0)):
    puff.scale = (s, s, s * 0.5)
    puff.keyframe_insert("scale", frame=f)
    vol.inputs["Density"].default_value = d
    vol.inputs["Density"].keyframe_insert("default_value", frame=f)

# camera: a slow creep toward the helmet, then it tips down onto the card; focus follows
aim = bpy.data.objects.new("aim", None)
sc.collection.objects.link(aim)
for f, p in ((F0, (0, 0, 0.14)), (62, (0.01, -0.05, 0.12)), (98, (0.07, -0.31, 0.005)), (F1, (0.07, -0.31, 0.005))):
    aim.location = p
    aim.keyframe_insert("location", frame=f)
cam = lib.camera((0.95, -1.05, 0.32), (0, 0, 0.14), lens=55)
for f, p in ((F0, (0.95, -1.05, 0.32)), (62, (0.5, -0.62, 0.22)), (98, (0.12, -0.5, 0.22)), (F1, (0.095, -0.41, 0.17))):
    cam.location = p
    cam.keyframe_insert("location", frame=f)
tt = cam.constraints.new("TRACK_TO")
tt.target, tt.track_axis, tt.up_axis = aim, "TRACK_NEGATIVE_Z", "UP_Y"
cam.data.dof.use_dof = True
cam.data.dof.focus_object = aim
cam.data.dof.aperture_fstop = 2.8

if "--check" in args:
    for f in (F0, 62, 98, F1):
        sc.frame_set(f)
        lib.render_still(os.path.join(lib.OUT, f"helmet_{f:03d}.png"))
else:
    lib.render_frames(os.path.join(lib.OUT, "helmet_reveal"), F0, F1)
