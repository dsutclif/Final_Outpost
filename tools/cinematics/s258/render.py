# Render stills of the kneel-lift blend: blender -b kneel_lift.blend -P render.py -- OUTDIR cam f1,f2,...
# cam: side (from the commander's right, facing screen-right), front34 (close three-quarter from the front)
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import bpy, lib
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
out, cam, frames = a[0], a[1], [int(x) for x in a[2].split(",")]
bright = float(a[3]) if len(a) > 3 else 1.0
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA"): bpy.data.objects.remove(o)
lib.ground(size=40)
lib.sky(horizon="#c9d0d8", zenith="#8d9bb0", haze=0.0)
lib.sun(elevation=50, azimuth=-30, strength=3.2 * bright, color="#ffffff", angle=3.0)
fill = lib.sun(elevation=30, azimuth=150, strength=1.4 * bright, color="#dfe8ff", angle=6.0)
sc.render.resolution_x, sc.render.resolution_y = (480, 540) if cam == "side" else (540, 540)
sc.eevee.taa_render_samples = 24
if cam == "side":   # from -X looking +X: commander faces screen right
    c = lib.camera((-7.0, 0.05, 0.62), (0, 0.05, 0.58), lens=85)
elif cam == "foot":   # close on the right foot, from the commander right side, a little behind
    sc.render.resolution_x, sc.render.resolution_y = 540, 400
    c = lib.camera((-1.3, 0.40, 0.14), (-0.08, 0.40, 0.09), lens=50)
else:               # close three-quarter from front-right, looking at the helmet/hands
    c = lib.camera((-1.25, -1.6, 0.80), (0.0, -0.18, 0.55), lens=40)
sc.camera = c
for f in frames:
    sc.frame_set(f)
    lib.render_still(os.path.join(out, f"{cam}_{f:03d}.png"))
