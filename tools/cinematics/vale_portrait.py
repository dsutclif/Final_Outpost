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

# Crew uniform under the head, matching the other bay portraits (portrait_imani/sorrel/brandt.jpg): cream suit, stand collar whose
# rim dips at the front, a flap across the left of the collar, gold piping on the collar rim and flap, along each shoulder yoke
# and down each side of the chest, a plain chest pocket on the wearer's left (viewer's right). No other collar piping.
def mat(name, col, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = col
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = rough
    return m
cream = mat("cream", (0.66, 0.62, 0.52, 1), 0.9)
cream2 = mat("cream2", (0.60, 0.56, 0.46, 1), 0.9)
gold = mat("gold", (0.60, 0.40, 0.10, 1), 0.55)
PX = o_px = None
SY, SZ, SX = 0.075, 0.14, 0.21          # torso ellipsoid: y depth, z half-height, x half-width
SC_Z = -0.14
bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(ctr.x, ctr.y, SC_Z), segments=64, ring_count=32)
sh = bpy.context.object; sh.scale = (SX, SY, SZ); sh.data.materials.append(cream)
R_TOP, R_BOT, Z_TOP, Z_BOT = 0.0575, 0.075, 0.0356, -0.06

def camz_top(o): return hi.z + 0.07 * o
ORTHO = h * 1.67
PXM = ORTHO / 2000.0
TOP = camz_top(ORTHO)
def ref(px, py):                         # reference portrait px (796x1036) -> world x,z ; chin at ref y625 = our y1245, x400 = centre
    ox, oy = 805.5 + (px - 400) * 2.0, 1245 + (py - 625) * 2.0
    return ctr.x + (ox - 805.5) * PXM, TOP - oy * PXM
def on_torso(x, z):
    dx, dz = (x - ctr.x) / SX, (z - SC_Z) / SZ
    t = max(0.0, 1 - dx * dx - dz * dz)
    return ctr.y - SY * math.sqrt(t) - 0.0012
RIM_REF = [(275, 595), (300, 640), (345, 682), (400, 697), (455, 685), (500, 645), (522, 598)]
def rim_z(x):                            # height of the collar's top edge at world x: high at the sides, dipping at the front
    pts = [ref(*p) for p in RIM_REF]
    if x <= pts[0][0]: return pts[0][1]
    for (xa, za), (xb, zb) in zip(pts, pts[1:]):
        if xa <= x <= xb:
            t = (x - xa) / (xb - xa); t = t * t * (3 - 2 * t)
            return za + (zb - za) * t
    return pts[-1][1]
def collar_fwd(x, z):                    # how far in front of the centre the collar surface sits; flares into the torso at its foot
    r = R_BOT + (R_TOP - R_BOT) * (z - Z_BOT) / (Z_TOP - Z_BOT)
    fc = math.sqrt(max(r * r - (x - ctr.x) ** 2, 0))
    ft = ctr.y - on_torso(x, z) + 0.0002
    t = max(0.0, min(1.0, (z - Z_BOT) / 0.05)); t = t * t * (3 - 2 * t)
    return ft + (fc - ft) * t
def on_collar(x, z):
    return ctr.y - collar_fwd(x, z) - 0.0012
def build_collar():                      # ring stack whose top edge follows rim_z, so the front dips under the chin
    NA, NR = 96, 12
    vs, fs = [], []
    for j in range(NR + 1):
        for i in range(NA):
            ph = 2 * math.pi * i / NA
            x = ctr.x + (R_BOT + (R_TOP - R_BOT) * j / NR) * math.sin(ph)
            front = math.cos(ph) > 0
            z = Z_BOT + ((rim_z(x) if front else Z_TOP) - Z_BOT) * j / NR
            if front: y = ctr.y - collar_fwd(x, z)
            else:
                r = R_BOT + (R_TOP - R_BOT) * (z - Z_BOT) / (Z_TOP - Z_BOT)
                y = ctr.y + math.sqrt(max(r * r - (x - ctr.x) ** 2, 0))
            vs.append((x, y, z))
    for j in range(NR):
        for i in range(NA):
            a_, b_ = j * NA + i, j * NA + (i + 1) % NA
            fs.append((a_, b_, b_ + NA, a_ + NA))
    me = bpy.data.meshes.new("collar"); me.from_pydata(vs, [], fs); me.update()
    ob = bpy.data.objects.new("collar", me); sc.collection.objects.link(ob); me.materials.append(cream)
    for pl in me.polygons: pl.use_smooth = True
build_collar()
skin = mat("neck", (0.42, 0.22, 0.14, 1), 0.8)   # the head model ends at the chin line; carry the neck down into the collar
bpy.ops.mesh.primitive_cylinder_add(radius=0.05, depth=0.12, location=(ctr.x, ctr.y + 0.004, -0.04), vertices=48)
nk = bpy.context.object; nk.scale = (1, 0.85, 1); nk.data.materials.append(skin)
def catmull(pts, n=14):
    out = []
    P = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in range(2)))
    out.append(pts[-1])
    return out
def pipe(name, refpts, surf, smooth=True, r=0.0019):
    pts = [ref(*p) for p in refpts]
    if smooth: pts = catmull(pts)
    cu = bpy.data.curves.new(name, "CURVE"); cu.dimensions = "3D"
    cu.bevel_depth = r; cu.bevel_resolution = 3
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for pt, (x, z) in zip(sp.points, pts):
        pt.co = (x, surf(x, z), z, 1)
    ob = bpy.data.objects.new(name, cu); sc.collection.objects.link(ob); ob.data.materials.append(gold)
    return ob

# collar rim (sides high, dipping at the front) and the flap's piped top and left edge
pipe("rim", [(275, 595), (300, 640), (345, 682), (400, 697), (455, 685), (500, 645), (522, 598)], on_collar)
pipe("flap", [(399, 698), (330, 706), (296, 716), (293, 745), (296, 776), (340, 779), (386, 781)], on_collar)
# shoulder yokes and the side seams down the chest
pipe("yoke_l", [(255, 722), (190, 748), (125, 776), (60, 805), (8, 835)], on_torso)
pipe("yoke_r", [(548, 722), (610, 745), (680, 772), (745, 805), (796, 838)], on_torso)
pipe("seam_l", [(90, 785), (100, 860), (112, 940), (124, 1030)], on_torso)
pipe("seam_r", [(726, 795), (716, 870), (703, 950), (690, 1035)], on_torso)
def patch(name, m, p0, p1, nx=14, nz=14, off=0.0008):
    (x0, z0), (x1, z1) = ref(*p0), ref(*p1)
    vs, fs = [], []
    for j in range(nz + 1):
        for i in range(nx + 1):
            x, z = x0 + (x1 - x0) * i / nx, z0 + (z1 - z0) * j / nz
            vs.append((x, on_torso(x, z) - off + 0.0012, z))
    for j in range(nz):
        for i in range(nx):
            a_ = j * (nx + 1) + i
            fs.append((a_, a_ + 1, a_ + nx + 2, a_ + nx + 1))
    me = bpy.data.meshes.new(name); me.from_pydata(vs, [], fs); me.update()
    ob = bpy.data.objects.new(name, me); sc.collection.objects.link(ob); me.materials.append(m)
    for pl in me.polygons: pl.use_smooth = True
patch("pocket", cream2, (483, 888), (670, 978))   # plain chest pocket on the viewer's right

# the head model carries a flared white shirt collar that the uniform's stand collar now covers: drop it for the plate
import bmesh
for ob in objs:
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kill = [f for f in bm.faces if all((ob.matrix_world @ v.co).z < 0.045 and abs((ob.matrix_world @ v.co).x - ctr.x) > 0.05 for v in f.verts)]
    print("DROPPED_FACES", len(kill))
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(ob.data); bm.free()

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
