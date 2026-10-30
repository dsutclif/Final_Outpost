# Doug's stasis pod (cache/cryo_pod.glb, from "Statis Pod no Glass.glb") and its glass lid
# (cache/cryo_glass.glb), sunk into the deck plate for the crash cinematic (Doug, 2026-10-29):
# scaled up uniformly until the commander fits the cavity lying down, then sunk until its long side
# walls stand only as high as the step-over clears above the deck (the capture lies, stands and steps
# out on one floor, so he lies on a pad at deck level with the cradle cut away under it), and the
# glass fitted over the cavity on a hinge along the back long edge. The glass pane is see-through
# frost; its frame stays opaque.
#
# Pod frame (what build() returns): x along the pod's long axis, y across it with +y the open
# (step-out) side, the floor (deck level) at z 0, the cavity centred on the origin.
import math
import bmesh, bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
import lib


def _flatten(root):
    """Join a placed model's meshes into one object whose vertices are in world coordinates."""
    objs = [bpy.data.objects[n] for n in root["meshes"]]
    bpy.context.view_layer.update()
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = None
        o.data.transform(mw)
        o.matrix_world = Matrix.Identity(4)
    o = objs[0]
    if len(objs) > 1:
        with bpy.context.temp_override(active_object=o, selected_editable_objects=objs):
            bpy.ops.object.join()
    bpy.data.objects.remove(root)
    return o


def _bounds(me):
    xs, ys, zs = zip(*(v.co[:] for v in me.vertices))
    return Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))


def _profile(obj, n=60):
    """Height of the model seen from above on a grid: {(i, j): z} with cell centres."""
    lo, hi = _bounds(obj.data)
    bvh = BVHTree.FromObject(obj, bpy.context.evaluated_depsgraph_get())
    cells = {}
    for i in range(n):
        for j in range(n):
            x = lo.x + (hi.x - lo.x) * (i + 0.5) / n
            y = lo.y + (hi.y - lo.y) * (j + 0.5) / n
            hit = bvh.ray_cast(Vector((x, y, hi.z + 1)), Vector((0, 0, -1)))
            if hit[0] is not None:
                cells[(i, j)] = (x, y, hit[0].z)
    return lo, hi, cells, n


def measure(obj):
    """The cavity of an (unscaled) pod: its x and y half-extents, centre and the cradle height."""
    lo, hi, cells, n = _profile(obj)
    H = hi.z - lo.z
    mid = n // 2
    deep = lambda c: c is not None and c[2] < hi.z - 0.35 * H

    def run(line):
        k0 = len(line) // 2
        a = b = k0
        while a > 0 and deep(line[a - 1]): a -= 1
        while b < len(line) - 1 and deep(line[b + 1]): b += 1
        return line[a], line[b]
    along = [cells.get((i, mid)) for i in range(n)]
    across = [cells.get((mid, j)) for j in range(n)]
    (xa, _, _), (xb, _, _) = run(along)
    (_, ya, _), (_, yb, _) = run(across)
    inner = sorted(c[2] for c in cells.values() if xa < c[0] < xb and ya < c[1] < yb)
    cradle = inner[int(len(inner) * 0.3)] if inner else lo.z
    # the long side walls' top: the highest point across the middle, outside the cavity
    wall = max(c[2] for c in across if c is not None and not ya <= c[1] <= yb)
    return dict(x0=xa, x1=xb, y0=ya, y1=yb, cradle=cradle, wall=wall, lo=lo, hi=hi)


def _glass_material(obj):
    """Second material for the pane: the same frosted texture, partly see-through."""
    src = obj.data.materials[0]
    m = src.copy()
    m.name = "pod_glass_pane"
    b = next(nd for nd in m.node_tree.nodes if nd.type == "BSDF_PRINCIPLED")
    b.inputs["Alpha"].default_value = 0.42
    b.inputs["Roughness"].default_value = 0.25
    for link in list(m.node_tree.links):
        if link.to_node == b and link.to_socket.name == "Alpha":
            m.node_tree.links.remove(link)
    if hasattr(m, "surface_render_method"):
        m.surface_render_method = "BLENDED"
    else:
        m.blend_method = "BLEND"
    obj.data.materials.append(m)
    return m


def _pane_faces(obj):
    """Which faces are glass, by the colour the texture paints them: the frosted pane is pale or
    cyan, the frame rusty metal."""
    import numpy as np
    m = obj.data.materials[0]
    tex = next(nd for nd in m.node_tree.nodes if nd.type == "TEX_IMAGE" and any(
        l.to_socket.name == "Base Color" for l in nd.outputs["Color"].links))
    img = tex.image
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)
    uv = obj.data.uv_layers.active.data
    out = []
    for p in obj.data.polygons:
        u = sum(uv[i].uv.x for i in p.loop_indices) / p.loop_total
        v = sum(uv[i].uv.y for i in p.loop_indices) / p.loop_total
        r, g, b, _ = px[min(h - 1, max(0, int(v * h))), min(w - 1, max(0, int(u * w)))]
        out.append(b - r > 0.03 or (min(r, g, b) > 0.55 and max(r, g, b) - min(r, g, b) < 0.12))
    return out


def build(name, need_len, need_wid, rim_h):
    """The pod fitted round a body footprint need_len x need_wid (m) and sunk until its long side
    walls stand rim_h above the floor (z 0), its cradle cut away below a pad at the floor, plus its
    glass on a hinge. Returns (pod object, hinge empty, glass object, dims) in the pod frame."""
    pod = _flatten(lib.place("cryo_pod", name=name))
    m = measure(pod)
    cav_len, cav_wid = m["x1"] - m["x0"], m["y1"] - m["y0"]
    k = max(need_len / cav_len, need_wid / cav_wid)
    centre = Vector(((m["x0"] + m["x1"]) / 2, (m["y0"] + m["y1"]) / 2, m["wall"]))
    pod.data.transform(Matrix.Translation((0, 0, rim_h)) @ Matrix.Scale(k, 4) @ Matrix.Translation(-centre))
    hl, hw = cav_len * k / 2, cav_wid * k / 2
    lo, hi = _bounds(pod.data)
    # whatever of the cradle (and its backrest) rises above the floor goes: he lies on the pad
    bm = bmesh.new()
    bm.from_mesh(pod.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0.004), plane_no=(0, 0, 1))
    gone = []
    for f in bm.faces:
        c = f.calc_center_median()
        if abs(c.x) < hl - 0.03 and abs(c.y) < hw - 0.03 and c.z > 0.004:
            gone.append(f)
    bmesh.ops.delete(bm, geom=gone, context="FACES")
    bm.to_mesh(pod.data)
    bm.free()
    # a dark pad on the floor of the cavity
    bpy.ops.mesh.primitive_cube_add(size=1)
    pad = bpy.context.object
    pad.name = name + "_pad"
    pad.scale = (2 * hl, 2 * hw, 0.003)
    pad.location = (0, 0, 0.0015)
    pad.data.materials.append(lib.mat("padding", "#2b2f33", rough=0.8))
    pad.parent = pod

    # the glass: over the cavity plus its frame, sitting on the rim, hinged along the back (-y) edge
    glass = _flatten(lib.place("cryo_glass", name=name + "_glass"))
    glo, ghi = _bounds(glass.data)
    gc = Vector(((glo.x + ghi.x) / 2, (glo.y + ghi.y) / 2, glo.z))
    gl, gw = 2 * hl * 1.08, 2 * hw * 1.12
    sx, sy = gl / (ghi.x - glo.x), gw / (ghi.y - glo.y)
    glass.data.transform(Matrix.Diagonal((sx, sy, sy, 1)) @ Matrix.Translation(-gc))
    # pane faces (inside the frame band) take the see-through material
    _glass_material(glass)
    for p, is_pane in zip(glass.data.polygons, _pane_faces(glass)):
        c = p.center
        if is_pane and abs(c.x) < gl / 2 * 0.9 and abs(c.y) < gw / 2 * 0.88:
            p.material_index = 1
    hinge = bpy.data.objects.new(name + "_hinge", None)
    bpy.context.scene.collection.objects.link(hinge)
    hinge.parent = pod
    hinge.location = (0, -gw / 2, rim_h)
    glass.parent = hinge
    glass.location = (0, gw / 2, 0)
    dims = dict(k=k, half_len=hl, half_wid=hw, glass_len=gl, glass_wid=gw, top=hi.z, bottom=lo.z)
    print(f"POD {name}: scale {k:.2f}, cavity {2 * hl:.2f} x {2 * hw:.2f} m, end caps to {hi.z:.2f} m, glass {gl:.2f} x {gw:.2f} m")
    return pod, hinge, glass, dims


def lid_angle(hinge, deg):
    """Open the glass by deg (it lifts its free +y edge up and over the back)."""
    hinge.rotation_euler = (math.radians(deg), 0, 0)


def _world_bvh(obj, dg):
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    verts = [ev.matrix_world @ v.co for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys), verts, polys


def collisions(body, solids, floor_z, where=None):
    """Triangles of the body that cut through any of `solids` (pod shell, glass), ignoring the
    floor of the cavity he lies and stands on (anything within 2 cm of floor_z)."""
    dg = bpy.context.evaluated_depsgraph_get()
    b_bvh, _, _ = _world_bvh(body, dg)
    n = 0
    for s in solids:
        s_bvh, verts, polys = _world_bvh(s, dg)
        for _, j in b_bvh.overlap(s_bvh):
            c = sum((verts[k] for k in polys[j]), Vector()) / len(polys[j])
            if c.z > floor_z + 0.02:
                n += 1
                if where is not None: where.append((s.name, c))
    return n
