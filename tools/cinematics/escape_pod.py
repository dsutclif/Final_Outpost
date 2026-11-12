# The lander's escape pod (story level 2), made from the game's burnt Scrap 2 tube so it reads as a pod four people rode in.
# The tube is a 5.6 m rocket wreck only about 1.1 m across, far too thin for seats, so this keeps its tail half (clean
# cylinder, engine, fins), shortens it, fattens the fuselage (fins keep their size), closes the cut end with a blunt
# nose made from the hull's own skin, cuts a hatch in the camera-side flank, drops the hatch door on its sill hinge as a
# ramp, and builds a small cabin with four padded seats (two rows of two, facing the nose).
#
# Texture: the hull keeps its own scorched texture. The new parts get the same kind of surface the hull has, baked into
# one shared 1024 texture: every part is laid out at the hull's texel density, Cycles bakes where each texel sits, which
# way it faces and how enclosed it is, and the colour is then painted here from that (worn metal, quilted fabric, panel
# seams, scorch in the game's own scorch colours, dust lying on everything that faces up, shadow in the corners).
# The result is one mesh with one texture. Fixed numbers and a hashed noise: the same input gives the same file.
#
#   blender -b --factory-startup -P tools/cinematics/escape_pod.py -- [in.glb] [out.glb] [texture.png]
#
# in.glb defaults to the built, already scorched tube (packages/client/public/models/capture.recruit_container_decoy.glb,
# 5.6 m long, tail toward +X); out.glb defaults to tools/cinematics/assets/escape_pod.glb. Output frame (Blender, Z up):
# nose toward +X, hatch on the -Y flank, origin on the ground under the hull's centre, metres.
import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
SRC = argv[0] if len(argv) > 0 else os.path.join(ROOT, "packages", "client", "public", "models", "capture.recruit_container_decoy.glb")
DST = argv[1] if len(argv) > 1 else os.path.join(HERE, "assets", "escape_pod.glb")

# ---- the source tube (its own metres, as built: 5.6 m long) ----
AXIS_Y, AXIS_Z = 0.04, 0.765      # centre line of the clean cylinder
X_CUT = 0.27                      # keep x >= this: the clean cylinder, engine and fins
X_TAIL = 2.798
X_CABIN_END = 1.52                # the ring band where the engine truss starts
R_BODY = 0.56                     # hull radius: inside it the fuselage is fattened, outside it fins keep their size
STRIP = (0.32, 0.72)              # hull skin copied and bent into the nose

# ---- the pod (metres) ----
CREW_POD_LEN = 1.859              # capture.recruit_container, the towable crew pod
TOTAL_LEN = 1.40 * CREW_POD_LEN   # nose tip to tail
NOSE_LEN = 0.34
SX = (TOTAL_LEN - NOSE_LEN) / (X_TAIL - X_CUT)   # lengthwise scale
SR = 1.20                         # fuselage radius scale
R_SKIN_MIN = 0.61                 # the hull around the cabin is pushed out to at least this
R_HATCH_MAX = 0.672               # ... and pressed in to at most this around the hatch, so the frame sits proud
R_LINER = 0.56                    # cabin wall (well inside the hull: its big flat faces cut the corners of the circle)
R_FRAME = 0.69                    # hatch frame
R_COLLAR = 0.685
CAB_AFT = -(X_CABIN_END - X_CUT) * SX
CAB_FWD = -0.03
FLOOR_D = 0.34                    # cabin floor below the centre line
HX0, HX1 = CAB_AFT + 0.05, CAB_FWD - 0.09        # hatch, lengthwise
PHI0, PHI1 = 15.0, 97.5           # hatch, degrees round the hull from the top toward -Y
STEP = 7.5                        # degrees per wall panel
FRAME_W = 0.055
SEAT_Y = 0.24                     # seat centres either side of the aisle
ROWS = (-0.25, -0.74)             # seat cushion centres, front row then back row
HOOPS = (CAB_AFT + 0.025, -0.60, CAB_FWD - 0.04)   # ring frames on the cabin wall

# ---- surfaces: index in the bake, texel density against the hull's, how much dust settles ----
MATS = ["hull", "wall", "floor", "pad", "shell", "metal", "door", "strap", "scorch", "frame"]
MAT = {n: i for i, n in enumerate(MATS)}
DENSITY = {"wall": 0.5, "floor": 0.6, "pad": 1.0, "shell": 0.7, "metal": 0.8, "door": 0.9, "strap": 0.7, "scorch": 0.9, "frame": 0.9}
DUST_ON = {"wall": 0.5, "floor": 0.9, "pad": 0.6, "shell": 0.5, "metal": 0.5, "door": 0.75, "strap": 0.4, "scorch": 0.25, "frame": 0.3}
DUST = (186, 124, 78)
SCORCH = ((38, 22, 14), (140, 64, 28), (190, 100, 48))   # soot, burnt orange, rust: tools/build-models.ts scorch()
TEX = 1024


def cyl(x, phi, r):
    a = math.radians(phi)
    return Vector((x, -r * math.sin(a), r * math.cos(a)))


def radial(phi):
    a = math.radians(phi)
    return Vector((0, -math.sin(a), math.cos(a)))


def round_dir(phi):
    """Unit vector along increasing phi."""
    a = math.radians(phi)
    return Vector((0, -math.cos(a), -math.sin(a)))


def phi_of(p):
    return math.degrees(math.atan2(-p.y, p.z))


def on_hull(x, phi, r):
    """A frame at a point on the cylinder: local z points out of the hull, local y back round it."""
    return Matrix.Translation(cyl(x, phi, r)) @ Matrix.Rotation(math.radians(phi), 4, "X")


# ---------------------------------------------------------------- load
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
sc = bpy.context.scene
ob = next(o for o in sc.objects if o.type == "MESH")
mw = ob.matrix_world.copy()
ob.parent = None
ob.matrix_world = Matrix.Identity(4)
me = ob.data
me.transform(mw)
for o in list(sc.objects):
    if o is not ob:
        bpy.data.objects.remove(o)
me.uv_layers[0].name = "src"

bm = bmesh.new()
bm.from_mesh(me)
bm.loops.layers.uv.new("atlas")
door_l = bm.faces.layers.int.new("door")     # 1: the door's hull skin, 2: the door's new parts
uvs = bm.loops.layers.uv["src"]              # the hull's own texture coordinates; metres on the new parts
uva = bm.loops.layers.uv["atlas"]
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)   # weld the texture seams so shading stays smooth

# ---------------------------------------------------------------- keep the tail half, empty the cabin
bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(X_CUT, 0, 0), plane_no=(-1, 0, 0), clear_outer=True)
junk = []
for f in bm.faces:
    c = f.calc_center_median()
    if c.x < X_CABIN_END and math.hypot(c.y - AXIS_Y, c.z - AXIS_Z) < 0.36:
        junk.append(f)
bmesh.ops.delete(bm, geom=junk, context="FACES")
loose = [v for v in bm.verts if not v.link_faces]
bmesh.ops.delete(bm, geom=loose, context="VERTS")

# ---------------------------------------------------------------- into the pod's frame: nose +X, hatch side -Y, axis at z = 0
for v in bm.verts:
    dx, dy, dz = v.co.x - X_CUT, v.co.y - AXIS_Y, v.co.z - AXIS_Z
    r = math.hypot(dy, dz)
    rn = r * SR if r <= R_BODY else R_BODY * SR + (r - R_BODY) * SX
    x = -dx * SX
    phi = math.degrees(math.atan2(dy, dz))
    if x >= CAB_AFT:
        rn = max(rn, R_SKIN_MIN)
        if HX0 - 0.12 <= x <= HX1 + 0.12 and PHI0 - 7 <= phi <= PHI1 + 50:
            rn = min(rn, R_HATCH_MAX)
    k = rn / r if r > 1e-6 else SR
    v.co = (x, -dy * k, dz * k)
GROUND = min(v.co.z for v in bm.verts)
X_AFT_END = min(v.co.x for v in bm.verts)


def with_edges(faces):
    geom = set(faces)
    for f in faces:
        geom.update(f.edges)
        geom.update(f.verts)
    return list(geom)


# ---------------------------------------------------------------- nose: a strip of the hull's own skin bent into a blunt dome
s0, s1 = -(STRIP[1] - X_CUT) * SX, -(STRIP[0] - X_CUT) * SX
for x in (s0, s1):   # straight ends for the strip
    bmesh.ops.bisect_plane(bm, geom=with_edges([f for f in bm.faces if abs(f.calc_center_median().x - x) < 0.3]), plane_co=(x, 0, 0), plane_no=(1, 0, 0), dist=1e-5)
strip = [f for f in bm.faces if s0 < f.calc_center_median().x < s1]
nose = [e for e in bmesh.ops.duplicate(bm, geom=strip)["geom"] if isinstance(e, bmesh.types.BMFace)]
NOSE_CUTS = 5
for i in range(1, NOSE_CUTS):   # slices, so the hull's long flat faces can bend
    ret = bmesh.ops.bisect_plane(bm, geom=with_edges(nose), plane_co=(s0 + (s1 - s0) * i / NOSE_CUTS, 0, 0), plane_no=(1, 0, 0), dist=1e-5)
    nose = [e for e in ret["geom"] if isinstance(e, bmesh.types.BMFace)]
TIP = math.radians(80)
for v in {v for f in nose for v in f.verts}:
    t = min(1.0, max(0.0, (v.co.x - s0) / (s1 - s0)))
    r = min(max(math.hypot(v.co.y, v.co.z), 0.615), 0.645)   # pressed nearly round, so nothing sticks out of the nose
    d = Vector((0, v.co.y, v.co.z)).normalized()
    v.co = Vector((NOSE_LEN * math.sin(t * TIP), 0, 0)) + d * (r * math.cos(t * TIP))

# ---------------------------------------------------------------- hatch: cut the door out of the hull
def near_hatch(f, x_pad, phi_pad):
    c = f.calc_center_median()
    return HX0 - x_pad <= c.x <= HX1 + x_pad and PHI0 - phi_pad <= phi_of(c) <= PHI1 + phi_pad and math.hypot(c.y, c.z) > 0.45


def cut(co, no, pick):
    bmesh.ops.bisect_plane(bm, geom=with_edges([f for f in bm.faces if pick(f)]), plane_co=co, plane_no=no, dist=1e-5)


cut((HX0, 0, 0), (1, 0, 0), lambda f: near_hatch(f, 0.2, 20))
cut((HX1, 0, 0), (1, 0, 0), lambda f: near_hatch(f, 0.2, 20))
cut((0, 0, 0), round_dir(PHI0), lambda f: near_hatch(f, 0.15, 25) and abs(phi_of(f.calc_center_median()) - PHI0) < 25)
cut((0, 0, 0), round_dir(PHI1), lambda f: near_hatch(f, 0.15, 25) and abs(phi_of(f.calc_center_median()) - PHI1) < 25)
split = bmesh.ops.split(bm, geom=[f for f in bm.faces if near_hatch(f, 0, 0)])
for f in (e for e in split["geom"] if isinstance(e, bmesh.types.BMFace)):
    f[door_l] = 1

# ---------------------------------------------------------------- new parts
new_faces = []


def face(pts, mat, toward, uv=None, door=False):
    """A flat face wound to look toward `toward`. uv is in metres (flat on the face when not given)."""
    pts = [Vector(p) for p in pts]
    n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
    if uv is None:
        u = (pts[1] - pts[0]).normalized()
        w = n.normalized().cross(u)
        uv = [((p - pts[0]).dot(u), (p - pts[0]).dot(w)) for p in pts]
    order = list(range(len(pts)))
    if n.dot(toward) < 0:
        order.reverse()
    f = bm.faces.new([bm.verts.new(pts[i]) for i in order])
    f.material_index = MAT[mat]
    f[door_l] = 2 if door else 0
    for lp, i in zip(f.loops, order):
        lp[uvs].uv = uv[i]
    new_faces.append(f)
    return f


def box_uv(axis, p):
    """Box-mapped metres: v runs up the sides and along x on the top, so seams can follow it."""
    return ((p.y, p.z), (p.x, p.z), (p.y, p.x))[axis]


def box(m, size, mat, door=False):
    h = (size[0] / 2, size[1] / 2, size[2] / 2)
    for axis, sgn in ((0, 1), (0, -1), (1, 1), (1, -1), (2, 1), (2, -1)):
        a, b = [i for i in range(3) if i != axis]
        local = []
        for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = [0.0, 0.0, 0.0]
            p[axis] = sgn * h[axis]
            p[a] = sa * h[a]
            p[b] = sb * h[b]
            local.append(Vector(p))
        n = [0.0, 0.0, 0.0]
        n[axis] = sgn
        face([m @ p for p in local], mat, m.to_3x3() @ Vector(n), [box_uv(axis, p) for p in local], door)


def pad(m, size, mat, r=0.022):
    """A cushion: a box with rounded edges."""
    before = set(bm.faces)
    ret = bmesh.ops.create_cube(bm, size=1.0, matrix=m @ Matrix.Diagonal((size[0], size[1], size[2], 1)))
    edges = {e for v in ret["verts"] for e in v.link_edges}
    bmesh.ops.bevel(bm, geom=list(edges), offset=r, offset_type="OFFSET", segments=2, profile=0.5, affect="EDGES", clamp_overlap=True)
    inv = m.inverted()
    rot = inv.to_3x3()
    for f in bm.faces:
        if f in before:
            continue
        f.normal_update()
        n = rot @ f.normal
        axis = max(range(3), key=lambda i: abs(n[i]))
        f.material_index = MAT[mat]
        f[door_l] = 0
        for lp in f.loops:
            lp[uvs].uv = box_uv(axis, inv @ lp.vert.co)
        new_faces.append(f)


def wall(x0, x1, p0, p1, r, mat, outward, door=False):
    """A panel on the cylinder of radius r, unrolled flat for its texture."""
    pts = [cyl(x0, p0, r), cyl(x1, p0, r), cyl(x1, p1, r), cyl(x0, p1, r)]
    a0, a1 = r * math.radians(p0), r * math.radians(p1)
    face(pts, mat, radial((p0 + p1) / 2) * (1 if outward else -1), [(x0, a0), (x1, a0), (x1, a1), (x0, a1)], door)


def across(pts, mat, toward, door=False):
    """A face standing across the hull (at one x)."""
    face(pts, mat, toward, [(p.y, p.z) for p in pts], door)


def phis(a, b):
    n = max(1, round((b - a) / STEP))
    return [(a + (b - a) * i / n, a + (b - a) * (i + 1) / n) for i in range(n)]


def disc(x, r, mat, toward, n=24, r_in=0.0):
    for i in range(n):
        a, b = 360 * i / n, 360 * (i + 1) / n
        if r_in > 0:
            across([cyl(x, a, r_in), cyl(x, b, r_in), cyl(x, b, r), cyl(x, a, r)], mat, toward)
        else:
            across([Vector((x, 0, 0)), cyl(x, a, r), cyl(x, b, r)], mat, toward)


def in_hatch(xa, xb, pa, pb):
    return xa >= HX0 - 1e-6 and xb <= HX1 + 1e-6 and pa >= PHI0 - 1e-6 and pb <= PHI1 + 1e-6


def under_floor(pa, pb, r):
    return max(math.cos(math.radians(pa)), math.cos(math.radians(pb))) * r < -FLOOR_D - 0.02


# cabin wall, with the hatch left open and nothing below the floor
xs = [CAB_AFT, HX0]
n = max(1, round((HX1 - HX0) / 0.16))
xs += [HX0 + (HX1 - HX0) * (i + 1) / n for i in range(n)] + [CAB_FWD]
for xa, xb in zip(xs, xs[1:]):
    for pa, pb in phis(0, 360):
        if not in_hatch(xa, xb, pa, pb) and not under_floor(pa, pb, R_LINER):
            wall(xa, xb, pa, pb, R_LINER, "wall", False)
fw = math.sqrt(R_LINER ** 2 - FLOOR_D ** 2)
FLOOR = -FLOOR_D
face([(CAB_AFT, -fw, FLOOR), (CAB_FWD, -fw, FLOOR), (CAB_FWD, fw, FLOOR), (CAB_AFT, fw, FLOOR)], "floor", Vector((0, 0, 1)))
disc(CAB_FWD, R_LINER, "wall", Vector((-1, 0, 0)))
disc(CAB_AFT, R_LINER, "wall", Vector((1, 0, 0)))
disc(CAB_AFT - 0.006, R_LINER, "shell", Vector((-1, 0, 0)))   # seen through the engine truss from behind

# ring frames standing in from the cabin wall, and a hand rail along the far side
HOOP_W, HOOP_T = 0.04, 0.028
for x in HOOPS:
    xa, xb, r = x - HOOP_W / 2, x + HOOP_W / 2, R_LINER - HOOP_T
    for pa, pb in phis(0, 360):
        if in_hatch(xa, xb, pa, pb) or under_floor(pa, pb, R_LINER):
            continue
        wall(xa, xb, pa, pb, r, "metal", False)
        for xe, sgn in ((xa, -1), (xb, 1)):
            across([cyl(xe, pa, r), cyl(xe, pb, r), cyl(xe, pb, R_LINER), cyl(xe, pa, R_LINER)], "metal", Vector((sgn, 0, 0)))
    if HX0 <= xa and xb <= HX1:   # cut by the hatch: close its two ends
        face([cyl(xa, PHI0, r), cyl(xb, PHI0, r), cyl(xb, PHI0, R_LINER), cyl(xa, PHI0, R_LINER)], "metal", round_dir(PHI0))
        face([cyl(xa, PHI1, r), cyl(xb, PHI1, r), cyl(xb, PHI1, R_LINER), cyl(xa, PHI1, R_LINER)], "metal", -round_dir(PHI1))
box(on_hull((CAB_AFT + CAB_FWD) / 2, -62, R_LINER - 0.04), (0.84, 0.024, 0.024), "metal")
for x in (CAB_AFT + 0.18, CAB_FWD - 0.18):
    box(on_hull(x, -62, R_LINER - 0.018), (0.03, 0.022, 0.036), "shell")

# hatch: the tunnel through the hull's thickness, a raised frame round it, a skirt down to the hull, and bolts
dphi = math.degrees(FRAME_W / R_FRAME)
face([cyl(HX0, PHI0, R_LINER), cyl(HX1, PHI0, R_LINER), cyl(HX1, PHI0, R_FRAME), cyl(HX0, PHI0, R_FRAME)], "metal", round_dir(PHI0))
face([cyl(HX0, PHI1, R_LINER), cyl(HX1, PHI1, R_LINER), cyl(HX1, PHI1, R_FRAME), cyl(HX0, PHI1, R_FRAME)], "metal", -round_dir(PHI1))
for pa, pb in phis(PHI0, PHI1):
    for x, sgn in ((HX0, 1), (HX1, -1)):
        across([cyl(x, pa, R_LINER), cyl(x, pb, R_LINER), cyl(x, pb, R_FRAME), cyl(x, pa, R_FRAME)], "metal", Vector((sgn, 0, 0)))
wall(HX0 - FRAME_W, HX1 + FRAME_W, PHI0 - dphi, PHI0, R_FRAME, "frame", True)
wall(HX0 - FRAME_W, HX1 + FRAME_W, PHI1, PHI1 + dphi, R_FRAME, "frame", True)
for pa, pb in phis(PHI0, PHI1):
    wall(HX0 - FRAME_W, HX0, pa, pb, R_FRAME, "frame", True)
    wall(HX1, HX1 + FRAME_W, pa, pb, R_FRAME, "frame", True)
SK = R_FRAME - 0.10
xa, xb = HX0 - FRAME_W, HX1 + FRAME_W
face([cyl(xa, PHI0 - dphi, SK), cyl(xb, PHI0 - dphi, SK), cyl(xb, PHI0 - dphi, R_FRAME), cyl(xa, PHI0 - dphi, R_FRAME)], "frame", -round_dir(PHI0))
face([cyl(xa, PHI1 + dphi, SK), cyl(xb, PHI1 + dphi, SK), cyl(xb, PHI1 + dphi, R_FRAME), cyl(xa, PHI1 + dphi, R_FRAME)], "frame", round_dir(PHI1))
for pa, pb in phis(PHI0 - dphi, PHI1 + dphi):
    for x, sgn in ((xa, -1), (xb, 1)):
        across([cyl(x, pa, SK), cyl(x, pb, SK), cyl(x, pb, R_FRAME), cyl(x, pa, R_FRAME)], "frame", Vector((sgn, 0, 0)))
BOLT = (0.028, 0.028, 0.012)
for i in range(6):
    x = HX0 + (HX1 - HX0) * (i + 0.5) / 6
    box(on_hull(x, PHI0 - dphi / 2, R_FRAME + 0.006), BOLT, "shell")
    box(on_hull(x, PHI1 + dphi / 2, R_FRAME + 0.006), BOLT, "shell")
for i in range(5):
    p = PHI0 + (PHI1 - PHI0) * (i + 0.5) / 5
    box(on_hull(HX0 - FRAME_W / 2, p, R_FRAME + 0.006), BOLT, "shell")
    box(on_hull(HX1 + FRAME_W / 2, p, R_FRAME + 0.006), BOLT, "shell")

# collar over the joint between hull and nose, and a plate on the nose tip
for pa, pb in phis(0, 360):
    wall(-0.045, 0.035, pa, pb, R_COLLAR, "scorch", True)
disc(-0.045, R_COLLAR, "scorch", Vector((-1, 0, 0)), n=48, r_in=0.58)
disc(0.035, R_COLLAR, "scorch", Vector((1, 0, 0)), n=48, r_in=0.58)
tip_x = NOSE_LEN * math.sin(TIP)
for pa, pb in phis(0, 360):
    wall(tip_x - 0.05, tip_x + 0.012, pa, pb, 0.135, "scorch", True)
disc(tip_x + 0.012, 0.135, "scorch", Vector((1, 0, 0)), n=48)

# four seats, two rows of two, facing the nose: a hard shell on a pedestal, padded cushion, back and headrest, a harness
for xc in ROWS:
    for yc in (-SEAT_Y, SEAT_Y):
        box(Matrix.Translation((xc, yc, FLOOR + 0.008)), (0.26, 0.28, 0.016), "metal")
        box(Matrix.Translation((xc, yc, FLOOR + 0.078)), (0.16, 0.20, 0.125), "shell")
        box(Matrix.Translation((xc, yc, FLOOR + 0.157)), (0.34, 0.37, 0.034), "shell")
        pad(Matrix.Translation((xc, yc, FLOOR + 0.211)), (0.32, 0.35, 0.075), "pad")
        box(Matrix.Translation((xc - 0.05, yc, FLOOR + 0.2535)), (0.045, 0.356, 0.010), "strap")                    # lap belt
        box(Matrix.Translation((xc - 0.05, yc, FLOOR + 0.2595)), (0.055, 0.06, 0.012), "metal")                     # buckle
        back = Matrix.Translation((xc - 0.17, yc, FLOOR + 0.25)) @ Matrix.Rotation(math.radians(-12), 4, "Y")
        box(back @ Matrix.Translation((-0.032, 0, 0.21)), (0.034, 0.37, 0.44), "shell")
        pad(back @ Matrix.Translation((0.016, 0, 0.20)), (0.07, 0.33, 0.38), "pad")
        pad(back @ Matrix.Translation((0.014, 0, 0.465)), (0.07, 0.20, 0.12), "pad", 0.02)                          # headrest
        for sgn in (-1, 1):                                                                                         # shoulder straps
            box(back @ Matrix.Translation((0.056, sgn * 0.065, 0.21)) @ Matrix.Rotation(math.radians(sgn * 10), 4, "X"), (0.010, 0.040, 0.36), "strap")

# hinge barrels on the sill
hinge = cyl(0, PHI1, R_FRAME - 0.01)
for x in (HX0 + 0.2, HX1 - 0.2):
    box(Matrix.Translation((x, hinge.y, hinge.z)), (0.15, 0.06, 0.06), "shell")

# the door's inside face and edges, with treads across it (it lies as a ramp), stiffeners and latches; these turn with the door
R_DOOR_IN, R_DOOR_OUT, GAP = 0.555, 0.662, 0.012
gphi = math.degrees(GAP / R_DOOR_OUT)
da, db, dx0, dx1 = PHI0 + gphi, PHI1 - gphi, HX0 + GAP, HX1 - GAP
dxm, dspan = (dx0 + dx1) / 2, dx1 - dx0
for pa, pb in phis(da, db):
    wall(dx0, dx1, pa, pb, R_DOOR_IN, "door", False, True)
    for x, sgn in ((dx0, -1), (dx1, 1)):
        across([cyl(x, pa, R_DOOR_IN), cyl(x, pb, R_DOOR_IN), cyl(x, pb, R_DOOR_OUT), cyl(x, pa, R_DOOR_OUT)], "frame", Vector((sgn, 0, 0)), True)
face([cyl(dx0, da, R_DOOR_IN), cyl(dx1, da, R_DOOR_IN), cyl(dx1, da, R_DOOR_OUT), cyl(dx0, da, R_DOOR_OUT)], "frame", -round_dir(da), door=True)
face([cyl(dx0, db, R_DOOR_IN), cyl(dx1, db, R_DOOR_IN), cyl(dx1, db, R_DOOR_OUT), cyl(dx0, db, R_DOOR_OUT)], "frame", round_dir(db), door=True)
for p in (da + 5, db - 5):                                                   # stiffeners along the long edges
    box(on_hull(dxm, p, R_DOOR_IN - 0.011), (dspan - 0.05, 0.038, 0.022), "metal", True)
for i in range(5):                                                           # treads
    box(on_hull(dxm, da + 15 + (db - da - 30) * i / 4, R_DOOR_IN - 0.008), (dspan * 0.66, 0.026, 0.016), "metal", True)
for x in (dx0 + 0.035, dx1 - 0.035):                                         # side rails, in short straight pieces round the curve
    for pa, pb in phis(da + 9, db - 9):
        box(on_hull(x, (pa + pb) / 2, R_DOOR_IN - 0.009), (0.03, R_DOOR_IN * math.radians(pb - pa) + 0.004, 0.018), "metal", True)
for x in (dx0 + 0.2, dx1 - 0.2):                                             # latches on the lip
    box(on_hull(x, da + 2.5, R_DOOR_IN - 0.014), (0.085, 0.045, 0.03), "shell", True)

# weld each new part's panels together (the door's separately, so it can still turn), so curved parts shade smooth
for flag in (0, 2):
    verts = {v for f in new_faces if f.is_valid and f[door_l] == flag for v in f.verts}
    bmesh.ops.remove_doubles(bm, verts=list(verts), dist=1e-5)
new_faces = [f for f in new_faces if f.is_valid]

# ---------------------------------------------------------------- drop the door on its sill hinge until its lip rests on the ground
door_verts = {v for f in bm.faces if f[door_l] for v in f.verts}
pts = np.array([v.co[:] for v in door_verts])
rel_y, rel_z = pts[:, 1] - hinge.y, pts[:, 2] - hinge.z
DOOR_DEG = 90.0
while DOOR_DEG < 200:
    a = math.radians(DOOR_DEG)
    if (rel_y * math.sin(a) + rel_z * math.cos(a) + hinge.z).min() <= GROUND + 0.012:
        break
    DOOR_DEG += 0.5
turn = Matrix.Translation(hinge) @ Matrix.Rotation(math.radians(DOOR_DEG), 4, "X") @ Matrix.Translation(-hinge)
for v in door_verts:
    v.co = turn @ v.co

# ---------------------------------------------------------------- stand it on the ground, origin under the hull's centre
x_mid = (X_AFT_END + NOSE_LEN) / 2
AXIS_H = -GROUND
for v in bm.verts:
    v.co.x -= x_mid
    v.co.z -= GROUND
bm.normal_update()
for f in bm.faces:
    f.smooth = True
for e in bm.edges:
    if len(e.link_faces) != 2 or e.calc_face_angle() > math.radians(40 if e.link_faces[0].material_index else 50):
        e.smooth = False
bmesh.ops.triangulate(bm, faces=bm.faces[:])


def uv_area(f):
    p = [lp[uvs].uv for lp in f.loops]
    return abs(sum(p[i].x * p[(i + 1) % len(p)].y - p[(i + 1) % len(p)].x * p[i].y for i in range(len(p)))) / 2


# every new part is laid out at the hull's own texel density (times its share), so the detail matches
hull = [f for f in bm.faces if f.material_index == 0]
hull_density = math.sqrt(sum(uv_area(f) for f in hull) / sum(f.calc_area() for f in hull))
for f in bm.faces:
    k = 1.0 if f.material_index == 0 else hull_density * DENSITY[MATS[f.material_index]]
    for lp in f.loops:
        lp[uva].uv = lp[uvs].uv * k
bm.to_mesh(me)
bm.free()
if "custom_normal" in me.attributes:
    me.attributes.remove(me.attributes["custom_normal"])
me.update()

# ---------------------------------------------------------------- pack everything into one texture
hull_mat = me.materials[0]
hull_tex = next(nd for nd in hull_mat.node_tree.nodes if nd.type == "TEX_IMAGE").image
me.uv_layers.active = me.uv_layers["atlas"]
me.uv_layers["atlas"].active_render = True
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
sc.tool_settings.use_uv_select_sync = True
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
try:
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=0.0025, shape_method="CONCAVE")
except TypeError:
    bpy.ops.uv.pack_islands(margin=0.0025)
bpy.ops.object.mode_set(mode="OBJECT")
uv = np.empty(len(me.loops) * 2, np.float32)
me.uv_layers["atlas"].data.foreach_get("uv", uv)
uv = uv.reshape(-1, 2)
print("POD atlas uv", uv.min(0).round(3), uv.max(0).round(3))

# ---------------------------------------------------------------- bake what the painter needs: hull colour, part, position, facing, enclosure
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.use_denoising = False
sc.cycles.seed = 0
sc.world = bpy.data.worlds.new("bake")
sc.world.light_settings.distance = 0.4      # how far a surface looks for something shading it
OFFSET = Vector((3.0, 3.0, 1.0))            # positions are baked as colours, so keep them positive
ob.location = OFFSET
bakes = []
for i, name in enumerate(MATS):
    m = bpy.data.materials.new("bake_" + name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(em.outputs[0], out.inputs[0])
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    nrm = nt.nodes.new("ShaderNodeVectorMath")
    nrm.operation = "MULTIPLY_ADD"
    nrm.inputs[1].default_value = (0.5, 0.5, 0.5)
    nrm.inputs[2].default_value = (0.5, 0.5, 0.5)
    nt.links.new(geo.outputs["Normal"], nrm.inputs[0])
    part = nt.nodes.new("ShaderNodeRGB")
    part.outputs[0].default_value = ((i + 1) / 16, (i + 1) / 16, (i + 1) / 16, 1)
    colour = nt.nodes.new("ShaderNodeRGB")
    colour.outputs[0].default_value = (0, 0, 0, 1)
    albedo = colour.outputs[0]
    if name == "hull":
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "src"
        img = nt.nodes.new("ShaderNodeTexImage")
        img.image = hull_tex
        nt.links.new(uvn.outputs[0], img.inputs[0])
        albedo = img.outputs[0]
    target = nt.nodes.new("ShaderNodeTexImage")
    for nd in nt.nodes:
        nd.select = False
    target.select = True
    nt.nodes.active = target
    if i == 0:
        me.materials[0] = m          # in place: clearing the slots would wipe every face's part number
    else:
        me.materials.append(m)
    bakes.append({"mat": m, "nt": nt, "em": em, "target": target, "albedo": albedo, "part": part.outputs[0], "pos": geo.outputs["Position"], "nrm": nrm.outputs[0]})


def bake(kind, samples=1):
    img = bpy.data.images.new("bake_" + kind, TEX, TEX, alpha=False, float_buffer=True, is_data=True)
    for b in bakes:
        b["target"].image = img
        if kind != "ao":
            b["nt"].links.new(b[kind], b["em"].inputs[0])
    sc.cycles.samples = samples
    bpy.ops.object.bake(type="AO" if kind == "ao" else "EMIT", margin=6, use_clear=True, uv_layer="atlas")
    a = np.empty(TEX * TEX * 4, np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(TEX * TEX, 4)[:, :3].copy()


B_ALBEDO, B_PART, B_POS, B_NRM = bake("albedo"), bake("part"), bake("pos"), bake("nrm")
B_AO = bake("ao", 64)[:, 0]
ob.location = (0, 0, 0)
part_id = np.rint(B_PART[:, 0] * 16).astype(int) - 1     # -1 where the texture is empty
print("POD texture use: hull %.0f%%, new parts %.0f%%, empty %.0f%%" % (100 * (part_id == 0).mean(), 100 * (part_id > 0).mean(), 100 * (part_id < 0).mean()))

# ---------------------------------------------------------------- paint the new parts
def hash3(i, j, k):
    h = (i.astype(np.uint32) * np.uint32(73856093)) ^ (j.astype(np.uint32) * np.uint32(19349663)) ^ (k.astype(np.uint32) * np.uint32(83492791))
    h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
    h = h ^ (h >> np.uint32(16))
    return (h & np.uint32(0xFFFFFF)).astype(np.float32) / np.float32(0xFFFFFF)


def vnoise(p):
    i = np.floor(p).astype(np.int64)
    f = (p - i).astype(np.float32)
    f = f * f * (3 - 2 * f)
    out = np.zeros(len(p), np.float32)
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (f[:, 0] if dx else 1 - f[:, 0]) * (f[:, 1] if dy else 1 - f[:, 1]) * (f[:, 2] if dz else 1 - f[:, 2])
                out += w * hash3(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz)
    return out


def cloud(p, freq, seed=0.0):
    """Blotchy 0..1 noise at about `freq` blotches a metre."""
    q = p * freq + seed
    s = 0.5 * vnoise(q) + 0.3 * vnoise(q * 2.03 + 19.7) + 0.2 * vnoise(q * 4.1 + 43.1)
    return np.clip((s - 0.3) / 0.4, 0, 1)


def rgb(c):
    return np.array(c, np.float32)[None, :]


def mix(a, b, t):
    return a * (1 - t[:, None]) + b * t[:, None]


def frac(v):
    return v - np.floor(v)


def scorched(p):
    k = np.clip(0.2 + 0.8 * cloud(p, 4.0, 3.0) - np.clip(cloud(p, 1.5, 9.0) - 0.5, 0, 1) * 0.9, 0, 1)
    lo, mid, hi = (rgb(c) for c in SCORCH)
    return np.where((k < 0.5)[:, None], mix(lo, mid, k / 0.5), mix(mid, hi, (k - 0.5) / 0.5))


sel = np.nonzero(part_id > 0)[0]
P = B_POS[sel] - np.array(OFFSET, np.float32)[None, :]
N = B_NRM[sel] * 2 - 1
ao = np.clip(B_AO[sel], 0, 1)
pid = part_id[sel]
n1, n2, n3 = cloud(P, 3.0), cloud(P, 13.0, 5.0), cloud(P, 6.0, 31.0)
col = np.zeros((len(sel), 3), np.float32)

m = pid == MAT["wall"]            # cabin lining: panels with dark seams
phi_w = np.degrees(np.arctan2(-P[:, 1], P[:, 2] - AXIS_H))
flat = np.abs(N[:, 0]) > 0.7      # the end walls
seam = np.where(flat, (frac(P[:, 1] / 0.3 + 0.5) < 0.03) | (frac(P[:, 2] / 0.26) < 0.035), (frac(P[:, 0] / 0.27) < 0.035) | (frac(phi_w / 22.5) < 0.045))
c = rgb((104, 93, 83)) * (0.8 + 0.4 * n1[:, None]) * (0.94 + 0.12 * n2[:, None])
c = c * np.where(seam, 0.5, 1.0)[:, None]
col[m] = c[m]

m = pid == MAT["floor"]           # deck plate with a raised tread
tread = (np.floor(P[:, 0] / 0.035) + np.floor(P[:, 1] / 0.035)) % 2
c = rgb((82, 76, 70)) * (0.85 + 0.3 * n1[:, None]) * (0.93 + 0.14 * tread[:, None])
col[m] = c[m]

m = pid == MAT["pad"]             # quilted fabric: seams across the cushion and across the back, puffed between them
along = np.where(np.abs(N[:, 2]) > 0.6, P[:, 0], P[:, 2])
band = np.abs(frac(along / 0.085) - 0.5) * 2
c = rgb((160, 148, 126)) * (0.84 + 0.26 * n1[:, None]) * (0.94 + 0.12 * n2[:, None])
c = c * (0.90 + 0.10 * np.cos(band * math.pi / 2))[:, None] * (1 - 0.34 * np.clip((band - 0.8) / 0.2, 0, 1))[:, None]
col[m] = c[m]

m = pid == MAT["shell"]           # moulded seat shells, pedestals, bolt heads
c = rgb((62, 59, 58)) * (0.82 + 0.36 * n2[:, None])
col[m] = c[m]

steel = rgb((128, 116, 104)) * (0.78 + 0.44 * n1[:, None]) * (1 + 0.16 * (n2 > 0.7))[:, None]
steel = mix(steel, rgb((118, 60, 32)), 0.55 * np.clip((n1 * n3 - 0.3) / 0.3, 0, 1))
m = pid == MAT["metal"]           # worn steel with rust
col[m] = steel[m]

m = pid == MAT["door"]            # painted panel, chipped to the metal
chips = np.clip((cloud(P, 9.0, 3.0) - 0.62) / 0.08, 0, 1)
c = mix(rgb((140, 130, 114)) * (0.84 + 0.32 * n1[:, None]), rgb((84, 74, 66)), 0.8 * chips)
col[m] = c[m]

m = pid == MAT["strap"]           # webbing
c = rgb((40, 39, 42)) * (0.82 + 0.36 * n2[:, None])
col[m] = c[m]

burnt = scorched(P)
m = pid == MAT["scorch"]          # collar and nose plate: burnt like the hull
col[m] = burnt[m]
m = pid == MAT["frame"]           # hatch frame and door edges: steel, scorched
c = mix(steel, burnt, 0.4 + 0.35 * n3)
col[m] = c[m]

# years of dust on whatever faces up, thicker in the corners; then shadow where parts crowd together
up = np.clip((N[:, 2] - 0.25) / 0.6, 0, 1)
settle = np.array([DUST_ON.get(name, 0) for name in MATS], np.float32)[pid]
dust = np.clip(up * (0.25 + 0.9 * n3 + 0.6 * (1 - ao)) * settle, 0, 1)
col = mix(col, rgb(DUST) * (0.9 + 0.2 * n2[:, None]), dust)
col = col * (0.32 + 0.68 * ao)[:, None]

lin = np.clip(B_ALBEDO, 0, 1)
out = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)   # the hull's own texture, back to sRGB
out[part_id < 0] = np.array(SCORCH[1], np.float32) / 255
out[sel] = np.clip(col / 255, 0, 1)
atlas = bpy.data.images.new("albedo_pod", TEX, TEX, alpha=False)
atlas.pixels.foreach_set(np.concatenate([out, np.ones((TEX * TEX, 1), np.float32)], axis=1).ravel())
png = os.path.join(tempfile.mkdtemp(), "albedo_pod.png")
atlas.filepath_raw = png
atlas.file_format = "PNG"
atlas.save()
atlas.source = "FILE"
atlas.reload()

# ---------------------------------------------------------------- one material, one texture
me.materials.clear()
for b in bakes:
    bpy.data.materials.remove(b["mat"])
me.materials.append(hull_mat)
next(nd for nd in hull_mat.node_tree.nodes if nd.type == "TEX_IMAGE").image = atlas
me.polygons.foreach_set("material_index", [0] * len(me.polygons))
me.uv_layers.remove(me.uv_layers["src"])
me.update()

# ---------------------------------------------------------------- export
ob.name = "body"
me.name = "body"
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
os.makedirs(os.path.dirname(DST), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB", use_selection=True, export_image_format="WEBP", export_image_quality=85,
                          export_animations=False, export_apply=True)
if len(argv) > 2:   # also keep the texture as a picture, for a look
    atlas.filepath_raw = argv[2]
    atlas.save()
co = np.array([v.co[:] for v in me.vertices])
print("POD wrote", DST)
print("POD bytes", os.path.getsize(DST), "tris", len(me.polygons), "verts", len(me.vertices))
print("POD size", (co.max(0) - co.min(0)).round(3), "lo", co.min(0).round(3), "hi", co.max(0).round(3))
print("POD hull length %.3f (%.2fx crew pod) axis height %.3f door %.1f deg SX %.3f SR %.3f hull texels %.0f per metre" % (
    NOSE_LEN - X_AFT_END, (NOSE_LEN - X_AFT_END) / CREW_POD_LEN, AXIS_H, DOOR_DEG, SX, SR, hull_density * TEX))
