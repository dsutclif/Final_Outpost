# Night stills of the kneel (outpost-ops#277): dim moon sun, dark sky, optional warm fill over the commander (the game's kneelLight).
# blender -b kneel_lift.blend -P render_night.py -- OUTDIR frame fill(0|1)
import math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import bpy, lib
a = sys.argv[sys.argv.index("--") + 1:]
out, f, fill = os.path.abspath(a[0]), int(a[1]), a[2] == "1"
os.makedirs(out, exist_ok=True)
sc = bpy.context.scene
for o in list(bpy.data.objects):
    if o.type in ("LIGHT", "CAMERA"): bpy.data.objects.remove(o)
lib.ground(size=40)
lib.sky(horizon="#141a26", zenith="#07090f", haze=0.0)
lib.sun(elevation=35, azimuth=-60, strength=0.35, color="#8fa6d8", angle=4.0)   # moon
if fill:
    ld = bpy.data.lights.new("kneelFill", "POINT"); ld.color = (1.0, 0.78, 0.5); ld.energy = 260; ld.shadow_soft_size = 0.4
    lo = bpy.data.objects.new("kneelFill", ld); sc.collection.objects.link(lo); lo.location = (-0.55, -1.0, 2.0)   # 1.15 H up, 0.6 H toward the camera
sc.render.resolution_x, sc.render.resolution_y = 540, 540
sc.eevee.taa_render_samples = 16
sc.camera = lib.camera((-1.25, -1.6, 0.80), (0.0, -0.18, 0.55), lens=40)
sc.frame_set(f)
lib.render_still(os.path.join(out, f"night_{'fill' if fill else 'nofill'}_{f:03d}.png"))
