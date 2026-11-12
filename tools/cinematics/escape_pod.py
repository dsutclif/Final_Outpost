# The lander's escape pod (story level 2), made from the game's burnt Scrap 2 tube so it reads as a pod four people rode in.
# The tube is a 5.6 m rocket wreck only about 1.1 m across, far too thin for seats, so this keeps its tail half (clean
# cylinder, engine, fins), shortens it, fattens the fuselage (fins keep their size), closes the cut end with a blunt
# nose made from the hull's own skin, cuts a hatch in the camera-side flank, drops the hatch door on its sill hinge as a
# ramp, and builds a small cabin with four seats (two rows of two, facing the nose). New parts are textured from a
# strip of flat swatches added along the bottom of the tube's own scorched texture, so the result is still one mesh
# with one texture. Everything is fixed numbers and one seeded noise: the same input gives the same file.
#
#   blender -b --factory-startup -P tools/cinematics/escape_pod.py -- [in.glb] [out.glb]
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

# swatches along the bottom of the texture (sRGB 0-255)
PAL = 64                          # texture rows given to the swatches: one row of eight tiles, 128 x 64 each
TILE_W = 128
SWATCH = {"wall": 0, "floor": 1, "pad": 2, "frame": 3, "metal": 4, "door": 5, "strap": 6, "rust": 7}
COLOURS = [(58, 48, 43), (40, 35, 33), (154, 145, 127), (62, 58, 57), (118, 104, 92), (128, 118, 104), (34, 33, 36), (96, 52, 34)]


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


# ---------------------------------------------------------------- load
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
ob = next(o for o in bpy.context.scene.objects if o.type == "MESH")
mw = ob.matrix_world.copy()
ob.parent = None
ob.matrix_world = Matrix.Identity(4)
me = ob.data
me.transform(mw)
for o in list(bpy.context.scene.objects):
    if o is not ob:
        bpy.data.objects.remove(o)

bm = bmesh.new()
bm.from_mesh(me)
uvl = bm.loops.layers.uv.verify()
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)   # weld the texture seams so shading stays smooth
K_V = 1 - PAL / 1024
for f in bm.faces:                                            # the tube's texture moves up to make room for the swatches
    for lp in f.loops:
        lp[uvl].uv.y = PAL / 1024 + lp[uvl].uv.y * K_V

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

# ---------------------------------------------------------------- nose: a strip of the hull's own skin bent into a blunt dome
s0, s1 = -(STRIP[1] - X_CUT) * SX, -(STRIP[0] - X_CUT) * SX
def with_edges(faces):
    geom = set(faces)
    for f in faces:
        geom.update(f.edges)
        geom.update(f.verts)
    return list(geom)


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
door_faces = [f for f in bm.faces if near_hatch(f, 0, 0)]
split = bmesh.ops.split(bm, geom=door_faces)
door_verts = {v for f in (e for e in split["geom"] if isinstance(e, bmesh.types.BMFace)) for v in f.verts}
skin_faces = set(bm.faces)

# ---------------------------------------------------------------- new parts
def swatch_uv(name):
    i = SWATCH[name]
    u0, u1, v0, v1 = i / 8 + 0.012, (i + 1) / 8 - 0.012, 8 / 1024, (PAL - 8) / 1024
    return [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]


def face(pts, name, toward, bucket=None):
    """A flat face wound to look toward `toward`; `bucket` collects its vertices (the door's get the hinge turn)."""
    pts = [Vector(p) for p in pts]
    n = (pts[1] - pts[0]).cross(pts[2] - pts[0])
    if n.dot(toward) < 0:
        pts.reverse()
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    for lp, uv in zip(f.loops, swatch_uv(name)):
        lp[uvl].uv = uv
    if bucket is not None:
        bucket.update(vs)
    return f


def box(m, size, name, bucket=None):
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    for axis, sgn in ((0, 1), (0, -1), (1, 1), (1, -1), (2, 1), (2, -1)):
        a, b = [i for i in range(3) if i != axis]
        h = (hx, hy, hz)
        pts = []
        for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            p = [0.0, 0.0, 0.0]
            p[axis] = sgn * h[axis]
            p[a] = sa * h[a]
            p[b] = sb * h[b]
            pts.append(m @ Vector(p))
        n = [0.0, 0.0, 0.0]
        n[axis] = sgn
        face(pts, name, m.to_3x3() @ Vector(n), bucket)


def wall(x0, x1, p0, p1, r, name, outward, bucket=None):
    """A panel on the cylinder of radius r."""
    face([cyl(x0, p0, r), cyl(x1, p0, r), cyl(x1, p1, r), cyl(x0, p1, r)], name, radial((p0 + p1) / 2) * (1 if outward else -1), bucket)


def phis(a, b):
    n = max(1, round((b - a) / STEP))
    return [(a + (b - a) * i / n, a + (b - a) * (i + 1) / n) for i in range(n)]


def disc(x, r, name, toward, n=24, r_in=0.0):
    for i in range(n):
        a, b = 360 * i / n, 360 * (i + 1) / n
        if r_in > 0:
            face([cyl(x, a, r_in), cyl(x, b, r_in), cyl(x, b, r), cyl(x, a, r)], name, toward)
        else:
            face([Vector((x, 0, 0)), cyl(x, a, r), cyl(x, b, r)], name, toward)


# cabin wall, with the hatch left open and nothing below the floor
xs = [CAB_AFT, HX0]
n = max(1, round((HX1 - HX0) / 0.16))
xs += [HX0 + (HX1 - HX0) * (i + 1) / n for i in range(n)] + [CAB_FWD]
for xa, xb in zip(xs, xs[1:]):
    for pa, pb in phis(0, 360):
        in_hatch = xa >= HX0 - 1e-6 and xb <= HX1 + 1e-6 and pa >= PHI0 - 1e-6 and pb <= PHI1 + 1e-6
        under = max(math.cos(math.radians(pa)), math.cos(math.radians(pb))) * R_LINER < -FLOOR_D - 0.02
        if not in_hatch and not under:
            wall(xa, xb, pa, pb, R_LINER, "wall", False)
fw = math.sqrt(R_LINER ** 2 - FLOOR_D ** 2)
face([(CAB_AFT, -fw, -FLOOR_D), (CAB_FWD, -fw, -FLOOR_D), (CAB_FWD, fw, -FLOOR_D), (CAB_AFT, fw, -FLOOR_D)], "floor", Vector((0, 0, 1)))
disc(CAB_FWD, R_LINER, "wall", Vector((-1, 0, 0)))
disc(CAB_AFT, R_LINER, "wall", Vector((1, 0, 0)))
disc(CAB_AFT - 0.006, R_LINER, "floor", Vector((-1, 0, 0)))   # seen through the engine truss from behind

# hatch: the tunnel through the hull's thickness, a raised frame round it, and a skirt down to the hull
dphi = math.degrees(FRAME_W / R_FRAME)
face([cyl(HX0, PHI0, R_LINER), cyl(HX1, PHI0, R_LINER), cyl(HX1, PHI0, R_FRAME), cyl(HX0, PHI0, R_FRAME)], "metal", round_dir(PHI0))
face([cyl(HX0, PHI1, R_LINER), cyl(HX1, PHI1, R_LINER), cyl(HX1, PHI1, R_FRAME), cyl(HX0, PHI1, R_FRAME)], "metal", -round_dir(PHI1))
for pa, pb in phis(PHI0, PHI1):
    for x, sgn in ((HX0, 1), (HX1, -1)):
        face([cyl(x, pa, R_LINER), cyl(x, pb, R_LINER), cyl(x, pb, R_FRAME), cyl(x, pa, R_FRAME)], "metal", Vector((sgn, 0, 0)))
wall(HX0 - FRAME_W, HX1 + FRAME_W, PHI0 - dphi, PHI0, R_FRAME, "metal", True)
wall(HX0 - FRAME_W, HX1 + FRAME_W, PHI1, PHI1 + dphi, R_FRAME, "metal", True)
for pa, pb in phis(PHI0, PHI1):
    wall(HX0 - FRAME_W, HX0, pa, pb, R_FRAME, "metal", True)
    wall(HX1, HX1 + FRAME_W, pa, pb, R_FRAME, "metal", True)
SK = R_FRAME - 0.10
xa, xb = HX0 - FRAME_W, HX1 + FRAME_W
face([cyl(xa, PHI0 - dphi, SK), cyl(xb, PHI0 - dphi, SK), cyl(xb, PHI0 - dphi, R_FRAME), cyl(xa, PHI0 - dphi, R_FRAME)], "metal", -round_dir(PHI0))
face([cyl(xa, PHI1 + dphi, SK), cyl(xb, PHI1 + dphi, SK), cyl(xb, PHI1 + dphi, R_FRAME), cyl(xa, PHI1 + dphi, R_FRAME)], "metal", round_dir(PHI1))
for pa, pb in phis(PHI0 - dphi, PHI1 + dphi):
    for x, sgn in ((xa, -1), (xb, 1)):
        face([cyl(x, pa, SK), cyl(x, pb, SK), cyl(x, pb, R_FRAME), cyl(x, pa, R_FRAME)], "metal", Vector((sgn, 0, 0)))

# collar over the joint between hull and nose, and a plate on the nose tip
for pa, pb in phis(0, 360):
    wall(-0.045, 0.035, pa, pb, R_COLLAR, "rust", True)
disc(-0.045, R_COLLAR, "rust", Vector((-1, 0, 0)), n=48, r_in=0.58)
disc(0.035, R_COLLAR, "rust", Vector((1, 0, 0)), n=48, r_in=0.58)
tip_x = NOSE_LEN * math.sin(TIP)
for i in range(16):
    a, b = 360 * i / 16, 360 * (i + 1) / 16
    face([cyl(tip_x - 0.05, a, 0.135), cyl(tip_x + 0.012, a, 0.135), cyl(tip_x + 0.012, b, 0.135), cyl(tip_x - 0.05, b, 0.135)], "rust", radial((a + b) / 2))
disc(tip_x + 0.012, 0.135, "rust", Vector((1, 0, 0)), n=16)

# four seats, two rows of two, facing the nose
FLOOR = -FLOOR_D
for xc in ROWS:
    for yc in (-SEAT_Y, SEAT_Y):
        box(Matrix.Translation((xc, yc, FLOOR + 0.085)), (0.22, 0.24, 0.17), "frame")
        box(Matrix.Translation((xc, yc, FLOOR + 0.21)), (0.32, 0.35, 0.09), "pad")
        box(Matrix.Translation((xc - 0.05, yc, FLOOR + 0.261)), (0.05, 0.354, 0.012), "strap")                     # lap belt
        back = Matrix.Translation((xc - 0.17, yc, FLOOR + 0.25)) @ Matrix.Rotation(math.radians(-12), 4, "Y")
        box(back @ Matrix.Translation((0, 0, 0.20)), (0.08, 0.35, 0.40), "pad")
        box(back @ Matrix.Translation((0, 0, 0.465)), (0.07, 0.20, 0.12), "pad")                                    # headrest
        for sgn in (-1, 1):                                                                                         # shoulder straps
            box(back @ Matrix.Translation((0.046, sgn * 0.065, 0.21)) @ Matrix.Rotation(math.radians(sgn * 10), 4, "X"), (0.012, 0.042, 0.37), "strap")

# hinge barrels on the sill
hinge = cyl(0, PHI1, R_FRAME - 0.01)
for x in (HX0 + 0.2, HX1 - 0.2):
    box(Matrix.Translation((x, hinge.y, hinge.z)), (0.15, 0.06, 0.06), "frame")

# the door's inside face, its edges and a grab bar; these turn with the door
R_DOOR_IN, R_DOOR_OUT, GAP = 0.555, 0.662, 0.012
gphi = math.degrees(GAP / R_DOOR_OUT)
da, db, dx0, dx1 = PHI0 + gphi, PHI1 - gphi, HX0 + GAP, HX1 - GAP
for pa, pb in phis(da, db):
    wall(dx0, dx1, pa, pb, R_DOOR_IN, "door", False, door_verts)
    for x, sgn in ((dx0, -1), (dx1, 1)):
        face([cyl(x, pa, R_DOOR_IN), cyl(x, pb, R_DOOR_IN), cyl(x, pb, R_DOOR_OUT), cyl(x, pa, R_DOOR_OUT)], "metal", Vector((sgn, 0, 0)), door_verts)
face([cyl(dx0, da, R_DOOR_IN), cyl(dx1, da, R_DOOR_IN), cyl(dx1, da, R_DOOR_OUT), cyl(dx0, da, R_DOOR_OUT)], "metal", -round_dir(da), door_verts)
face([cyl(dx0, db, R_DOOR_IN), cyl(dx1, db, R_DOOR_IN), cyl(dx1, db, R_DOOR_OUT), cyl(dx0, db, R_DOOR_OUT)], "metal", round_dir(db), door_verts)
mid = (da + db) / 2
bar = Matrix.Translation(cyl((dx0 + dx1) / 2, mid, R_DOOR_IN - 0.03)) @ Matrix.Rotation(math.radians(-mid), 4, "X")
box(bar, (0.46, 0.035, 0.035), "frame", door_verts)
inset = (dx1 - dx0) * 0.14
for pa, pb in phis(da + 12, db - 12):                                        # a darker inner panel, so the door reads as a door
    wall(dx0 + inset, dx1 - inset, pa, pb, R_DOOR_IN - 0.006, "wall", False, door_verts)

# ---------------------------------------------------------------- drop the door on its sill hinge until its lip rests on the ground
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
for v in bm.verts:
    v.co.x -= x_mid
    v.co.z -= GROUND
bm.normal_update()
for f in bm.faces:                 # the hull shades smooth, the new flat parts stay flat
    f.smooth = f in skin_faces
for e in bm.edges:
    if len(e.link_faces) == 2 and e.calc_face_angle() > math.radians(50):
        e.smooth = False
bmesh.ops.triangulate(bm, faces=bm.faces[:])
bm.to_mesh(me)
bm.free()
if "custom_normal" in me.attributes:
    me.attributes.remove(me.attributes["custom_normal"])
me.update()

# ---------------------------------------------------------------- texture: the tube's own, squeezed up, with the swatches below
mat = me.materials[0]
tex = next(nd for nd in mat.node_tree.nodes if nd.type == "TEX_IMAGE")
orig = tex.image
W, H = orig.size
assert (W, H) == (1024, 1024), (W, H)
src_px = np.empty(W * H * 4, np.float32)
orig.pixels.foreach_get(src_px)
src_px = src_px.reshape(H, W, 4)
rows = (np.arange(H - PAL) + 0.5) * H / (H - PAL) - 0.5
r0 = np.clip(np.floor(rows).astype(int), 0, H - 1)
r1 = np.clip(r0 + 1, 0, H - 1)
fr = (rows - np.floor(rows)).astype(np.float32)[:, None, None]
out = np.ones((H, W, 4), np.float32)
out[PAL:] = src_px[r0] * (1 - fr) + src_px[r1] * fr
rng = np.random.default_rng(12)


def blotch(n):
    """Smooth 0..1 noise, one tile, from an n x n grid."""
    g = rng.random((n, n)).astype(np.float32)
    t = np.linspace(0, n - 1, TILE_W)
    i0 = np.clip(np.floor(t).astype(int), 0, n - 2)
    f = (t - i0).astype(np.float32)
    a = g[i0] * (1 - f)[:, None] + g[i0 + 1] * f[:, None]
    return a[:, i0] * (1 - f)[None, :] + a[:, i0 + 1] * f[None, :]


for i, rgb in enumerate(COLOURS):
    k = (1 + (blotch(5) - 0.5) * 0.22 + (rng.random((TILE_W, TILE_W)).astype(np.float32) - 0.5) * 0.07)[:PAL]
    out[:PAL, i * TILE_W:(i + 1) * TILE_W, :3] = np.clip(np.array(rgb, np.float32)[None, None, :] / 255 * k[:, :, None], 0, 1)
atlas = bpy.data.images.new("albedo_pod", W, H, alpha=False)
atlas.pixels.foreach_set(out.ravel())
png = os.path.join(tempfile.mkdtemp(), "albedo_pod.png")
atlas.filepath_raw = png
atlas.file_format = "PNG"
atlas.save()
atlas.source = "FILE"
atlas.reload()
tex.image = atlas

# ---------------------------------------------------------------- export
ob.name = "body"
me.name = "body"
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
bpy.context.view_layer.objects.active = ob
os.makedirs(os.path.dirname(DST), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB", use_selection=True, export_image_format="WEBP", export_image_quality=85,
                          export_animations=False, export_apply=True)
co = np.array([v.co[:] for v in me.vertices])
print("POD wrote", DST)
print("POD bytes", os.path.getsize(DST), "tris", len(me.polygons), "verts", len(me.vertices))
print("POD size", (co.max(0) - co.min(0)).round(3), "lo", co.min(0).round(3), "hi", co.max(0).round(3))
print("POD hull length %.3f (%.2fx crew pod) axis height %.3f door %.1f deg SX %.3f SR %.3f cabin %.3f..%.3f hatch %.3f..%.3f" % (
    NOSE_LEN - X_AFT_END, (NOSE_LEN - X_AFT_END) / CREW_POD_LEN, -GROUND, DOOR_DEG, SX, SR, CAB_AFT - x_mid, CAB_FWD - x_mid, HX0 - x_mid, HX1 - x_mid))
