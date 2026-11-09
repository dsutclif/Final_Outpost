# The stasis pod model has an interior floor plate that the reworked opening film cuts out (the commander lies at sand level, so
# the plate would sit through his back). This writes the model with that plate removed; the game's pod (and the film's) use it.
# The plate is found in the build's own metres (k = 1, origin at the bounding box's centre and base), the box matching
# game_film.py FLOOR_BOX scaled back by POD_K: x_local = -y_world / k ... see the arithmetic below.
# blender -b --factory-startup -P tools/cinematics/cut_pod_floor.py -- <in.glb> <out.glb>
import os, sys
import bpy, bmesh
from mathutils import Vector

src, dst = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector(map(min, *pts)); hi = Vector(map(max, *pts))
cx, cy, z0 = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z
K = 2.66 / 3.9847   # the game's pod scale; the film's box was measured at this scale, 0.30 m of base buried
BURY = 0.30
# film box (world, from the pod origin, pod yawed -90): x -0.45..0.35, |y| < 1.0, z 0.15..0.62 above the sand
# -> model frame: z_local = (z_world + BURY) / K ; x_world = y_local * K ; y_world = -x_local * K
z_lo, z_hi = (0.15 + BURY) / K, (0.62 + BURY) / K
y_lo, y_hi = -0.45 / K, 0.35 / K
x_max = 1.0 / K
cut = 0
for o in meshes:
    bm = bmesh.new(); bm.from_mesh(o.data)
    kill = []
    for f in bm.faces:
        c = o.matrix_world @ f.calc_center_median()
        x, y, z = c.x - cx, c.y - cy, c.z - z0
        if abs(x) < x_max and y_lo < y < y_hi and z_lo < z < z_hi:
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(o.data); bm.free()
    cut += len(kill)
print("POD FLOOR faces cut:", cut, "bounds", tuple(round(v, 3) for v in lo), tuple(round(v, 3) for v in hi))
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", use_selection=False)
print("wrote", dst, os.path.getsize(dst), "bytes")
