# Blender 5.2 by script: Level 3 kiosk, original vs aged (outpost-ops#358). Usage:
#   blender -b -P aged.py -- <Trade Kiosk.glb> <out dir> <aged|plain> [iso|front|side]
import bpy, sys, math, random
from mathutils import Vector, Euler

args = sys.argv[sys.argv.index("--") + 1:]
glb, out, mode, view = args[0], args[1], args[2], (args[3] if len(args) > 3 else "iso")
aged = mode == "aged"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
k = [o for o in bpy.data.objects if o.type == "MESH"][0]
bb = [k.matrix_world @ Vector(c) for c in k.bound_box]
k.location.z -= min(v.z for v in bb)
bpy.context.view_layer.update()
random.seed(7)

mat = k.data.materials[0]
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
if aged:
    src = bsdf.inputs["Base Color"].links[0].from_socket
    tc = nt.nodes.new("ShaderNodeTexCoord")
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 6; noise.inputs["Detail"].default_value = 10
    noise2 = nt.nodes.new("ShaderNodeTexNoise"); noise2.inputs["Scale"].default_value = 28; noise2.inputs["Detail"].default_value = 6
    sep = nt.nodes.new("ShaderNodeSeparateXYZ"); nt.links.new(geo.outputs["Normal"], sep.inputs[0])
    up = nt.nodes.new("ShaderNodeMapRange"); up.inputs["From Min"].default_value = 0.25; up.inputs["From Max"].default_value = 0.9
    nt.links.new(sep.outputs["Z"], up.inputs["Value"])
    dm = nt.nodes.new("ShaderNodeMath"); dm.operation = "MULTIPLY"
    nt.links.new(up.outputs["Result"], dm.inputs[0]); nt.links.new(noise.outputs["Fac"], dm.inputs[1])
    dm2 = nt.nodes.new("ShaderNodeMath"); dm2.operation = "MULTIPLY"; dm2.inputs[1].default_value = 2.2
    nt.links.new(dm.outputs["Value"], dm2.inputs[0])
    dust = nt.nodes.new("ShaderNodeMix"); dust.data_type = "RGBA"; dust.inputs["B"].default_value = (0.55, 0.42, 0.28, 1)
    nt.links.new(dm2.outputs["Value"], dust.inputs["Factor"]); nt.links.new(src, dust.inputs["A"])
    mapn = nt.nodes.new("ShaderNodeMapping"); mapn.inputs["Scale"].default_value = (9, 9, 2.0)
    nt.links.new(tc.outputs["Object"], mapn.inputs[0]); nt.links.new(mapn.outputs[0], noise2.inputs["Vector"])
    rm = nt.nodes.new("ShaderNodeMapRange"); rm.inputs["From Min"].default_value = 0.52; rm.inputs["From Max"].default_value = 0.68
    nt.links.new(noise2.outputs["Fac"], rm.inputs["Value"])
    rust = nt.nodes.new("ShaderNodeMix"); rust.data_type = "RGBA"; rust.inputs["B"].default_value = (0.30, 0.11, 0.04, 1)
    nt.links.new(rm.outputs["Result"], rust.inputs["Factor"]); nt.links.new(dust.outputs["Result"], rust.inputs["A"])
    dark = nt.nodes.new("ShaderNodeMix"); dark.data_type = "RGBA"; dark.inputs["B"].default_value = (0.02, 0.018, 0.016, 1); dark.inputs["Factor"].default_value = 0.35
    nt.links.new(rust.outputs["Result"], dark.inputs["A"])
    nt.links.new(dark.outputs["Result"], bsdf.inputs["Base Color"])
    for name, val in (("Roughness", 0.9), ("Metallic", 0.15)):
        for l in list(bsdf.inputs[name].links):
            nt.links.remove(l)
        bsdf.inputs[name].default_value = val

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
g = bpy.context.object
gm = bpy.data.materials.new("sand"); gm.use_nodes = True
gb = gm.node_tree.nodes["Principled BSDF"]; gb.inputs["Base Color"].default_value = (0.36, 0.25, 0.15, 1); gb.inputs["Roughness"].default_value = 1
g.data.materials.append(gm)
if aged:
    sm = bpy.data.materials.new("drift"); sm.use_nodes = True
    sb = sm.node_tree.nodes["Principled BSDF"]; sb.inputs["Base Color"].default_value = (0.42, 0.30, 0.18, 1); sb.inputs["Roughness"].default_value = 1

    def drift(loc, sc, rot=0.0):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=24, location=loc, scale=sc)
        d = bpy.context.object; d.rotation_euler.z = rot
        bpy.ops.object.shade_smooth(); d.data.materials.append(sm)
        t = bpy.data.textures.new("n", "CLOUDS"); t.noise_scale = 0.5
        md = d.modifiers.new("d", "DISPLACE"); md.texture = t; md.strength = 0.08
        return d

    dims = k.dimensions
    drift((0.0, -dims.y * 0.55, 0.0), (dims.x * 0.55, 0.30, 0.20))
    drift((-dims.x * 0.5, -dims.y * 0.25, 0.0), (0.38, 0.55, 0.24), 0.4)
    drift((dims.x * 0.42, dims.y * 0.1, 0.0), (0.30, 0.5, 0.2), -0.3)
    drift((0.25, -dims.y * 0.7, 0.0), (0.45, 0.2, 0.1), 0.2)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.9, location=(-0.6, -1.15, 0.05), rotation=(math.radians(88), 0, math.radians(35)))
    am = bpy.data.materials.new("aerial"); am.use_nodes = True
    am.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.05, 0.05, 1)
    bpy.context.object.data.materials.append(am)

sun = bpy.data.lights.new("sun", "SUN"); sun.energy = 4.0; sun.color = (1.0, 0.82, 0.62)
so = bpy.data.objects.new("sun", sun); bpy.context.collection.objects.link(so); so.rotation_euler = Euler((math.radians(52), 0, math.radians(-35)))
fill = bpy.data.lights.new("fill", "SUN"); fill.energy = 0.9; fill.color = (0.55, 0.65, 0.95)
fo = bpy.data.objects.new("fill", fill); bpy.context.collection.objects.link(fo); fo.rotation_euler = Euler((math.radians(60), 0, math.radians(140)))
w = bpy.data.worlds.new("w"); bpy.context.scene.world = w; w.use_nodes = True
w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.12, 0.13, 0.17, 1)
w.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8

cam = bpy.data.cameras.new("c"); cam.type = "ORTHO"; cam.ortho_scale = 4.2
co = bpy.data.objects.new("c", cam); bpy.context.collection.objects.link(co); bpy.context.scene.camera = co
tgt = Vector((0, 0, 0.8))
az, el = {"iso": (35, 38), "front": (0, 12), "side": (80, 20)}[view]
d = 12
co.location = tgt + Vector((d * math.cos(math.radians(el)) * math.sin(math.radians(az)), -d * math.cos(math.radians(el)) * math.cos(math.radians(az)), d * math.sin(math.radians(el))))
co.rotation_euler = (tgt - co.location).to_track_quat("-Z", "Y").to_euler()
sc = bpy.context.scene
sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 48; sc.cycles.use_denoising = True
sc.render.resolution_x = 900; sc.render.resolution_y = 900
sc.render.filepath = f"{out}/kiosk_{mode}_{view}.png"
bpy.ops.render.render(write_still=True)
print("WROTE", sc.render.filepath)
