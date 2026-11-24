import bpy, sys
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=sys.argv[-1])
for o in bpy.data.objects:
    print(o.name, o.type, tuple(round(x,2) for x in o.dimensions), len(o.data.vertices) if o.type=='MESH' else '', [m.name for m in o.data.materials] if o.type=='MESH' else '')
for m in bpy.data.materials:
    print('MAT', m.name, [ (n.type, n.image.name if n.type=='TEX_IMAGE' and n.image else '') for n in m.node_tree.nodes])
