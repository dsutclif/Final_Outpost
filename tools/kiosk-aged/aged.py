# Blender 5.2 by script: Level 3 kiosk, original vs aged (outpost-ops#358). Usage:
#   blender -b -P aged.py -- <Trade Kiosk.glb> <out dir> <aged|plain> [iso|front|side]
import bpy, sys, math, random
from mathutils import Vector, Euler

args = sys.argv[sys.argv.index("--") + 1:]
glb, out, mode, view = args[0], args[1], args[2], (args[3] if len(args) > 3 else "iso")
export = mode == "bake"  # bake: the ruined look as one textured mesh, written to <out dir>/Trade Kiosk Aged.glb for tools/build-models.ts
ruin = mode in ("ruined", "bake")  # more damage: crumbling concrete + cracked glass (outpost-ops#358, Doug 2026-11-24)
aged = mode in ("aged", "ruined", "bake")
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
    final = dark.outputs["Result"]

    def node(kind, **kw):
        n = nt.nodes.new(kind)
        for key, v in kw.items():
            if key.startswith("i_"):
                n.inputs[key[2:]].default_value = v
            else:
                setattr(n, key, v)
        return n

    def link(a, b):
        nt.links.new(a, b)

    if ruin:
        # crumbling concrete: Voronoi pits (dark) patchy over the surface + exposed aggregate on sharp edges (pointiness)
        vp = node("ShaderNodeTexVoronoi", i_Scale=55)
        link(tc.outputs["Object"], vp.inputs["Vector"])
        pr = node("ShaderNodeMapRange", **{"i_From Min": 0.0, "i_From Max": 0.30, "i_To Min": 1.0, "i_To Max": 0.0})
        link(vp.outputs["Distance"], pr.inputs["Value"])
        big = node("ShaderNodeTexNoise", i_Scale=3.5, i_Detail=8)
        link(tc.outputs["Object"], big.inputs["Vector"])
        bm = node("ShaderNodeMapRange", **{"i_From Min": 0.48, "i_From Max": 0.62})
        link(big.outputs["Fac"], bm.inputs["Value"])
        pm = node("ShaderNodeMath", operation="MULTIPLY")
        link(pr.outputs["Result"], pm.inputs[0]); link(bm.outputs["Result"], pm.inputs[1])
        pit = node("ShaderNodeMix", data_type="RGBA", i_B=(0.015, 0.012, 0.010, 1))
        link(pm.outputs["Value"], pit.inputs["Factor"]); link(final, pit.inputs["A"])
        pp = node("ShaderNodeMapRange", **{"i_From Min": 0.52, "i_From Max": 0.62})
        link(geo.outputs["Pointiness"], pp.inputs["Value"])
        edge = node("ShaderNodeMix", data_type="RGBA", i_B=(0.42, 0.33, 0.25, 1))
        link(pp.outputs["Result"], edge.inputs["Factor"]); link(pit.outputs["Result"], edge.inputs["A"])
        final = edge.outputs["Result"]
        # cracked glass: front face (-Y normal) with dark albedo; bright thin Voronoi-edge lines in a few patches, plus a milky haze
        lum = node("ShaderNodeRGBToBW"); link(src, lum.inputs["Color"])
        gl = node("ShaderNodeMapRange", **{"i_From Min": 0.16, "i_From Max": 0.08})
        link(lum.outputs["Val"], gl.inputs["Value"])
        ny = node("ShaderNodeSeparateXYZ"); link(geo.outputs["Normal"], ny.inputs[0])
        fy = node("ShaderNodeMapRange", **{"i_From Min": -0.5, "i_From Max": -0.9})
        link(ny.outputs["Y"], fy.inputs["Value"])
        gm_ = node("ShaderNodeMath", operation="MULTIPLY")
        link(gl.outputs["Result"], gm_.inputs[0]); link(fy.outputs["Result"], gm_.inputs[1])
        cw = node("ShaderNodeTexNoise", i_Scale=9, i_Detail=3)
        link(tc.outputs["Object"], cw.inputs["Vector"])
        wsc = node("ShaderNodeVectorMath", operation="SCALE", i_Scale=0.35)
        link(cw.outputs["Color"], wsc.inputs[0])
        wadd = node("ShaderNodeVectorMath", operation="ADD")
        link(tc.outputs["Object"], wadd.inputs[0]); link(wsc.outputs["Vector"], wadd.inputs[1])
        cv = node("ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE", i_Scale=7)
        link(wadd.outputs["Vector"], cv.inputs["Vector"])
        cl = node("ShaderNodeMapRange", **{"i_From Min": 0.0, "i_From Max": 0.022, "i_To Min": 1.0, "i_To Max": 0.0})
        link(cv.outputs["Distance"], cl.inputs["Value"])
        zn = node("ShaderNodeTexNoise", i_Scale=1.6)
        link(tc.outputs["Object"], zn.inputs["Vector"])
        zm = node("ShaderNodeMapRange", **{"i_From Min": 0.42, "i_From Max": 0.5})
        link(zn.outputs["Fac"], zm.inputs["Value"])
        c2 = node("ShaderNodeMath", operation="MULTIPLY")
        link(cl.outputs["Result"], c2.inputs[0]); link(zm.outputs["Result"], c2.inputs[1])
        c3 = node("ShaderNodeMath", operation="MULTIPLY")
        link(c2.outputs["Value"], c3.inputs[0]); link(gm_.outputs["Value"], c3.inputs[1])
        crk = node("ShaderNodeMix", data_type="RGBA", i_B=(0.72, 0.78, 0.80, 1))
        link(c3.outputs["Value"], crk.inputs["Factor"]); link(final, crk.inputs["A"])
        hz = node("ShaderNodeMath", operation="MULTIPLY")
        hz.inputs[1].default_value = 0.35
        link(gm_.outputs["Value"], hz.inputs[0])
        hzc = node("ShaderNodeMix", data_type="RGBA", i_B=(0.30, 0.27, 0.22, 1))
        link(hz.outputs["Value"], hzc.inputs["Factor"]); link(crk.outputs["Result"], hzc.inputs["A"])
        final = hzc.outputs["Result"]
    nt.links.new(final, bsdf.inputs["Base Color"])
    for name, val in (("Roughness", 0.9), ("Metallic", 0.15)):
        for l in list(bsdf.inputs[name].links):
            nt.links.remove(l)
        bsdf.inputs[name].default_value = val

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
g = bpy.context.object
gm = bpy.data.materials.new("sand"); gm.use_nodes = True
gb = gm.node_tree.nodes["Principled BSDF"]; gb.inputs["Base Color"].default_value = (0.36, 0.25, 0.15, 1); gb.inputs["Roughness"].default_value = 1
g.data.materials.append(gm)
if export:
    bpy.data.objects.remove(g)
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
    if ruin:
        # cracked glass panes in the three front openings (the model's windows are open frames): a haze, thin crack lines, and a few
        # missing shards. Pane depth comes from a ray at each pane centre so the panes sit in the frame.
        sc0 = bpy.context.scene
        dg = bpy.context.evaluated_depsgraph_get()

        def front_y(x, z):
            hit, loc, _n, _i, _o, _m = sc0.ray_cast(dg, Vector((x, -3.0, z)), Vector((0, 1, 0)))
            return loc.y if hit else None

        def crack_strips(cx, cy, cz, w, h, yaw):
            # the game cannot draw see-through glass, so a broken pane is solid geometry: thin crack strips radiating from an impact
            # point, plus jagged shards left in the pane corners
            import bmesh
            bm = bmesh.new()
            ca, sa = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))

            def pt(u, v):
                return bm.verts.new((cx + u * ca, cy + u * sa, cz + v))

            def quad(a, b, wd):
                du, dv = b[0] - a[0], b[1] - a[1]
                ln = math.hypot(du, dv) or 1
                nu, nv = -dv / ln * wd / 2, du / ln * wd / 2
                v4 = [pt(a[0] + nu, a[1] + nv), pt(b[0] + nu, b[1] + nv), pt(b[0] - nu, b[1] - nv), pt(a[0] - nu, a[1] - nv)]
                bm.faces.new(v4)

            ix, iy = random.uniform(-w * 0.25, w * 0.25), random.uniform(-h * 0.2, h * 0.2)
            for i in range(9):
                ang = i / 9 * math.tau + random.uniform(-0.2, 0.2)
                ln = random.uniform(0.35, 0.9) * max(w, h)
                px, py = ix, iy
                for _seg in range(3):
                    nx = px + math.cos(ang) * ln / 3 + random.uniform(-0.02, 0.02)
                    ny = py + math.sin(ang) * ln / 3 + random.uniform(-0.02, 0.02)
                    if abs(nx) > w / 2 or abs(ny) > h / 2:
                        break
                    quad((px, py), (nx, ny), 0.014)
                    px, py = nx, ny
                    ang += random.uniform(-0.3, 0.3)
            for rr in (0.09, 0.2):
                pts = [(ix + math.cos(t / 10 * math.tau) * rr * random.uniform(0.85, 1.15), iy + math.sin(t / 10 * math.tau) * rr * random.uniform(0.85, 1.15)) for t in range(11)]
                for a, b in zip(pts, pts[1:]):
                    if abs(a[0]) < w / 2 and abs(b[0]) < w / 2 and abs(a[1]) < h / 2 and abs(b[1]) < h / 2:
                        quad(a, b, 0.012)
            for sx, sy in ((-1, 1), (1, 1), (-1, -1), (1, -1)):
                if random.random() < 0.7:
                    c = (sx * w / 2, sy * h / 2)
                    bm.faces.new([pt(c[0], c[1]), pt(c[0] - sx * w * random.uniform(0.2, 0.45), c[1]), pt(c[0], c[1] - sy * h * random.uniform(0.12, 0.3))])
            me = bpy.data.meshes.new("cracks"); bm.to_mesh(me); bm.free()
            ob = bpy.data.objects.new("cracks", me); bpy.context.collection.objects.link(ob)
            gm2 = bpy.data.materials.get("shard") or bpy.data.materials.new("shard")
            gm2.use_nodes = True; gm2.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.62, 0.70, 0.72, 1)
            ob.data.materials.append(gm2)

        gmat = bpy.data.materials.new("cracked_glass"); gmat.use_nodes = True
        if hasattr(gmat, "surface_render_method"):
            gmat.surface_render_method = "BLENDED"
        gt = gmat.node_tree; gb = gt.nodes["Principled BSDF"]
        gb.inputs["Base Color"].default_value = (0.55, 0.62, 0.62, 1); gb.inputs["Roughness"].default_value = 0.25
        gtc = gt.nodes.new("ShaderNodeTexCoord")
        gv = gt.nodes.new("ShaderNodeTexVoronoi"); gv.feature = "DISTANCE_TO_EDGE"; gv.inputs["Scale"].default_value = 4.5
        gc = gt.nodes.new("ShaderNodeTexVoronoi"); gc.feature = "F1"; gc.inputs["Scale"].default_value = 4.5
        gt.links.new(gtc.outputs["Object"], gv.inputs["Vector"]); gt.links.new(gtc.outputs["Object"], gc.inputs["Vector"])
        gl2 = gt.nodes.new("ShaderNodeMapRange"); gl2.inputs["From Min"].default_value = 0.0; gl2.inputs["From Max"].default_value = 0.035
        gl2.inputs["To Min"].default_value = 1.0; gl2.inputs["To Max"].default_value = 0.0
        gt.links.new(gv.outputs["Distance"], gl2.inputs["Value"])
        gs = gt.nodes.new("ShaderNodeSeparateColor"); gt.links.new(gc.outputs["Color"], gs.inputs[0])
        gh = gt.nodes.new("ShaderNodeMapRange"); gh.inputs["From Min"].default_value = 0.80; gh.inputs["From Max"].default_value = 0.82
        gh.inputs["To Min"].default_value = 1.0; gh.inputs["To Max"].default_value = 0.0
        gt.links.new(gs.outputs["Red"], gh.inputs["Value"])
        ga = gt.nodes.new("ShaderNodeMath"); ga.operation = "MAXIMUM"; ga.inputs[1].default_value = 0.0
        gt.links.new(gl2.outputs["Result"], ga.inputs[0])
        gk = gt.nodes.new("ShaderNodeMath"); gk.operation = "MAXIMUM"; gk.inputs[1].default_value = 0.14
        gt.links.new(ga.outputs["Value"], gk.inputs[0])
        gx = gt.nodes.new("ShaderNodeMath"); gx.operation = "MULTIPLY"
        gt.links.new(gk.outputs["Value"], gx.inputs[0]); gt.links.new(gh.outputs["Result"], gx.inputs[1])
        gt.links.new(gx.outputs["Value"], gb.inputs["Alpha"])
        for cx, cz, w, h, yaw in ((0.04, 0.78, 0.64, 0.84, 0), (-0.45, 0.78, 0.2, 0.84, -28), (0.56, 0.78, 0.26, 0.84, 28)):
            fy_ = front_y(-0.33 if cx < 0.3 else 0.41, cz)  # ray at the mullion beside each pane (a ray down the opening hits the back wall)
            if fy_ is None:
                continue
            if export:
                crack_strips(cx, fy_ + 0.05, cz, w, h, yaw)
                continue
            bpy.ops.mesh.primitive_plane_add(size=1, location=(cx, fy_ + 0.05, cz), rotation=(math.radians(90), 0, math.radians(yaw)))
            p = bpy.context.object; p.scale = (w, h, 1); p.data.materials.append(gmat)
    if ruin:
        # crumbling concrete: ragged relief on the dense mesh, plus a few bites out of corners and edges (Boolean)
        rt = bpy.data.textures.new("crumble", "VORONOI"); rt.noise_scale = 0.16; rt.minkovsky_exponent = 1.0
        rd = k.modifiers.new("crumble", "DISPLACE"); rd.texture = rt; rd.strength = -0.035; rd.mid_level = 0.35
        bt = bpy.data.textures.new("bite", "CLOUDS"); bt.noise_scale = 0.18
        for loc, r in (((-0.92, -0.80, 1.40), 0.20), ((0.95, -0.78, 1.30), 0.17), ((0.55, -0.92, 0.12), 0.18), ((-0.95, -0.86, 0.30), 0.15), ((0.2, 0.9, 1.45), 0.2)):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, location=loc, radius=r)
            cu = bpy.context.object
            cd = cu.modifiers.new("d", "DISPLACE"); cd.texture = bt; cd.strength = 0.12
            bm_ = k.modifiers.new("bite", "BOOLEAN"); bm_.operation = "DIFFERENCE"; bm_.object = cu; bm_.solver = "FLOAT"
            cu.hide_render = True; cu.display_type = "WIRE"
    if ruin:
        # fallen concrete: broken chunks and rubble heaped along the foot of the walls
        cm = bpy.data.materials.new("rubble"); cm.use_nodes = True
        cb = cm.node_tree.nodes["Principled BSDF"]; cb.inputs["Base Color"].default_value = (0.30, 0.27, 0.23, 1); cb.inputs["Roughness"].default_value = 1
        for _ in range(46):
            side = random.choice((-1, 1)); onfront = random.random() < 0.6
            x = random.uniform(-dims.x * 0.62, dims.x * 0.62) if onfront else side * dims.x * random.uniform(0.5, 0.68)
            y = -dims.y * random.uniform(0.5, 0.72) if onfront else random.uniform(-dims.y * 0.5, dims.y * 0.4)
            s = random.uniform(0.025, 0.09)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=(x, y, s * 0.4), scale=(s, s * random.uniform(0.6, 1.2), s * random.uniform(0.5, 0.9)))
            c = bpy.context.object; c.rotation_euler = (random.random() * 3, random.random() * 3, random.random() * 3)
            c.data.materials.append(cm)
    bpy.ops.mesh.primitive_cylinder_add(radius=0.018, depth=0.9, location=(-0.6, -1.15, 0.05), rotation=(math.radians(88), 0, math.radians(35)))
    am = bpy.data.materials.new("aerial"); am.use_nodes = True
    am.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.05, 0.05, 0.05, 1)
    bpy.context.object.data.materials.append(am)

if export:
    # one mesh, one atlas. The body is unwrapped BEFORE the damage modifiers (a displaced mesh breaks into a million islands) and
    # squeezed into the lower-left 88% of the atlas; the loose extras (rubble, crack strips, sand drifts) each map to one flat texel
    # in the spare corner. Then modifiers are applied, everything is joined and the shaded colour is baked into one image.
    import numpy as np
    orig_uv = k.data.uv_layers[0].name
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = orig_uv
    nt.links.new(uvn.outputs["UV"], src.node.inputs["Vector"])
    cutters = [o for o in bpy.data.objects if o.hide_render]
    k.data.uv_layers.new(name="bakeUV"); k.data.uv_layers.active = k.data.uv_layers["bakeUV"]
    bpy.ops.object.select_all(action="DESELECT"); bpy.context.view_layer.objects.active = k; k.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")
    lay = k.data.uv_layers["bakeUV"]
    arr = np.zeros(len(lay.uv) * 2, dtype=np.float32); lay.uv.foreach_get("vector", arr); lay.uv.foreach_set("vector", arr * 0.88)
    spots = {"rubble": (0.95, 0.95), "drift": (0.95, 0.90), "shard": (0.90, 0.95)}
    extras = []
    for o in [o for o in bpy.data.objects if o.type == "MESH" and o is not k and not o.hide_render]:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        nm = o.data.materials[0].name if o.data.materials else "rubble"
        u = o.data.uv_layers.new(name="bakeUV"); o.data.uv_layers.active = u
        spot = spots.get(nm, (0.95, 0.95))
        for i in range(len(u.uv)):
            u.uv[i].vector = spot
        for ly in [l for l in o.data.uv_layers if l.name != "bakeUV"]:
            o.data.uv_layers.remove(ly)
        extras.append(o)
    bpy.context.view_layer.objects.active = k
    for m in list(k.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for o in cutters:
        bpy.data.objects.remove(o)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [k] + extras:
        o.select_set(True)
    bpy.context.view_layer.objects.active = k
    bpy.ops.object.join()
    k.data.uv_layers.active = k.data.uv_layers["bakeUV"]
    img = bpy.data.images.new("kiosk_aged_albedo", 2048, 2048)
    for ms in k.material_slots:
        mt = ms.material.node_tree
        tn = mt.nodes.new("ShaderNodeTexImage"); tn.image = img; mt.nodes.active = tn
    sc = bpy.context.scene; sc.render.engine = "CYCLES"; sc.cycles.device = "CPU"; sc.cycles.samples = 8; sc.cycles.use_denoising = False
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=8, use_clear=True)
    # the extras map to single points (no area to bake): paint their texels straight into the image
    px = np.zeros(2048 * 2048 * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(2048, 2048, 4)
    for (u, v), col in (((0.95, 0.95), (0.30, 0.27, 0.23)), ((0.95, 0.90), (0.42, 0.30, 0.18)), ((0.90, 0.95), (0.62, 0.70, 0.72))):
        cx, cy = int(u * 2048), int(v * 2048)
        px[cy - 20:cy + 20, cx - 20:cx + 20] = (*col, 1.0)
    img.pixels.foreach_set(px.reshape(-1))
    flat = bpy.data.materials.new("kiosk_aged"); flat.use_nodes = True
    fb = flat.node_tree.nodes["Principled BSDF"]
    ft = flat.node_tree.nodes.new("ShaderNodeTexImage"); ft.image = img
    flat.node_tree.links.new(ft.outputs["Color"], fb.inputs["Base Color"])
    fb.inputs["Roughness"].default_value = 0.9
    k.data.materials.clear(); k.data.materials.append(flat)
    for ly in [l for l in k.data.uv_layers if l.name != "bakeUV"]:
        k.data.uv_layers.remove(ly)
    img.filepath_raw = f"{out}/Trade Kiosk Aged.albedo.png"; img.file_format = "PNG"; img.save()
    bpy.ops.object.select_all(action="DESELECT"); k.select_set(True)
    bpy.ops.export_scene.gltf(filepath=f"{out}/Trade Kiosk Aged.glb", export_format="GLB", use_selection=True)
    print("WROTE", f"{out}/Trade Kiosk Aged.glb")
    raise SystemExit(0)

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
