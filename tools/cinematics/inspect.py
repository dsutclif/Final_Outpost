# Report what each GLB brings into Blender: size, triangles, materials, armatures, bones, actions.
# blender -b --factory-startup -P tools/cinematics/inspect.py -- <file.glb> [...]
import sys, bpy
from mathutils import Vector

files = sys.argv[sys.argv.index("--") + 1:]
for f in files:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=f)
    objs = list(bpy.context.scene.objects)
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    tris = 0
    mats = set()
    for o in objs:
        if o.type == "MESH":
            for c in o.bound_box:
                w = o.matrix_world @ Vector(c)
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
            tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
            mats.update(m.name for m in o.data.materials if m)
    print(f"\n=== {f.split('/')[-1]}")
    print(f"objects {len(objs)} ({', '.join(sorted({o.type for o in objs}))}), tris {tris}, materials {sorted(mats)}")
    print(f"bounds min {tuple(round(v, 3) for v in lo)} max {tuple(round(v, 3) for v in hi)} size {tuple(round(h - l, 3) for h, l in zip(hi, lo))}")
    for o in objs:
        if o.type == "ARMATURE":
            print(f"armature {o.name}: {len(o.data.bones)} bones: {[b.name for b in o.data.bones]}")
    acts = [(a.name, tuple(round(x) for x in a.frame_range)) for a in bpy.data.actions]
    if acts: print(f"actions {acts}")
    imgs = [(i.name, tuple(i.size)) for i in bpy.data.images]
    if imgs: print(f"images {imgs}")
