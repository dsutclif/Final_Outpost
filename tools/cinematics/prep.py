# Decimate the raw Meshy cinematic models once into tools/cinematics/cache/<id>.glb, so shots
# load in seconds. Textures are kept; only geometry is reduced.
# blender -b --factory-startup -P tools/cinematics/prep.py
import os, bpy

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.normpath(os.path.join(HERE, "..", "..", "..", "Asset workflow", "3D Models"))
OUT = os.path.join(HERE, "cache")

# id -> (source file, target triangles)
MODELS = {
    "halcyon_flying": ("Halcyon flying.glb", 300_000),
    "halcyon_wreck": ("Halcyon_Wreck.glb", 400_000),
    "commander_bust": ("Commander Bust model.glb", 250_000),
    "helmet": ("Helmet_model for intro scene.glb", 200_000),
}

os.makedirs(OUT, exist_ok=True)
for key, (fname, target) in MODELS.items():
    dst = os.path.join(OUT, key + ".glb")
    if os.path.exists(dst):
        print(f"skip {key} (cached)")
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, fname))
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        m = o.modifiers.new("dec", "DECIMATE")
        m.ratio = min(1.0, target / max(1, tris))
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.modifier_apply(modifier=m.name)
        print(f"{key}: {tris} -> {sum(len(p.vertices) - 2 for p in o.data.polygons)} tris")
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_image_format="JPEG", export_jpeg_quality=90)
