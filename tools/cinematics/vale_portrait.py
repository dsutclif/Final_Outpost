# Front-on portrait of Vale's head (item.vale_head.glb, the head revealed in the Level 5 fall) on the crew-portrait
# grey backdrop, framed like the other bay portraits (head and suit collar, 1611x2000).
# blender -b --factory-startup -P tools/cinematics/vale_portrait.py -- assets/portrait_vale_full.png
import os, sys, math, bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
out = os.path.join(HERE, sys.argv[sys.argv.index("--") + 1])
GLB = os.path.join(HERE, "..", "..", "packages", "client", "public", "models", "item.vale_head.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.render.resolution_x, sc.render.resolution_y = 1611, 2000
sc.view_settings.view_transform = "Standard"
bpy.ops.import_scene.gltf(filepath=GLB)
objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
ctr, size = (lo + hi) / 2, hi - lo
print("BOUNDS", tuple(lo), tuple(hi))
h = size.z

# plain cream suit under the head (collar + shoulders), like the other crew portraits; the face is the model's alone
cream = bpy.data.materials.new("cream"); cream.use_nodes = True
cream.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.5, 0.46, 0.36, 1)
cream.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(ctr.x, ctr.y, -0.14), segments=48, ring_count=24)
sh = bpy.context.object; sh.scale = (0.21, 0.09, 0.14); sh.data.materials.append(cream)
bpy.ops.mesh.primitive_cylinder_add(radius=0.058, depth=0.07, location=(ctr.x, ctr.y + 0.005, -0.015), vertices=48)
co = bpy.context.object; co.data.materials.append(cream)

# the glTF importer is Y-up converted to Z-up, so the head's front is usually -Y; camera looks from -Y at +Y
w = bpy.data.worlds.new("w"); sc.world = w
w.use_nodes = True
bg = w.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.55, 0.57, 0.6, 1); bg.inputs["Strength"].default_value = 1.0

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
cam.data.type = "ORTHO"
o = h * 1.67  # like the photos: crown at 7% of the frame, chin at about 62%
cam.data.ortho_scale = o
cam.location = (ctr.x, ctr.y - 5 * h, hi.z + 0.07 * o - o / 2)
cam.rotation_euler = (math.radians(90), 0, 0)
sc.camera = cam

def sun(rot, e):
    s = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN"))
    s.data.energy = e
    s.rotation_euler = tuple(math.radians(v) for v in rot)
    sc.collection.objects.link(s)
sun((60, 0, 20), 2.5)
sun((70, 0, -60), 1.2)
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("wrote", out)
