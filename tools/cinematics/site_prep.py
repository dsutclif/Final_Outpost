# The crash-site wreck for crash_open shots 3-5: Doug's wreck at 60 m with the loose debris that lies
# in front of the hull break removed, so the deck set and cameras have room. Splits the cached wreck
# into loose parts once, drops the parts whose centre falls in CLEAR, and saves cache/halcyon_wreck_site.glb.
# blender -b --factory-startup -P tools/cinematics/site_prep.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib

CLEAR = (-2.0, 26.0, -20.0, -2.6)   # world x0, x1, y0, y1 (wreck at the origin, 60 m, yaw 0)
SIZE = 60

lib.reset(64, 64)
root = lib.place("halcyon_wreck", at=(0, 0, 0), yaw=0, size=SIZE)
mesh = bpy.data.objects[root["meshes"][0]]
bpy.context.view_layer.objects.active = mesh
mesh.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
parts = [o for o in bpy.context.scene.objects if o.type == "MESH"]
dropped = 0
for o in parts:
    c = sum((o.matrix_world @ Vector(v) for v in o.bound_box), Vector()) / 8
    if CLEAR[0] <= c.x <= CLEAR[1] and CLEAR[2] <= c.y <= CLEAR[3]:
        bpy.data.objects.remove(o)
        dropped += 1
print(f"parts {len(parts)}, dropped {dropped}")
keep = [o for o in bpy.context.scene.objects if o.type == "MESH"]
bpy.ops.object.select_all(action="DESELECT")
for o in keep:
    o.select_set(True)
bpy.context.view_layer.objects.active = keep[0]
bpy.ops.object.join()
# bake the 60 m scale and placement in: place it with lib.place(..., exact=True)
joined = bpy.context.view_layer.objects.active
bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
bpy.data.objects.remove(root)
bpy.ops.object.select_all(action="DESELECT")
bpy.ops.export_scene.gltf(filepath=os.path.join(lib.CACHE, "halcyon_wreck_site.glb"), export_format="GLB",
                          export_image_format="JPEG", export_jpeg_quality=90)
print("wrote halcyon_wreck_site.glb")
