# The commander's pod exit from CMU motion capture (Doug's picks, 2026-10-29): get up in the sunken
# pod (140_08, finishing upright), step out over its rim (143_15, walk-in cut, higher leg lift),
# stagger on a hurt leg to the deck edge (139_19), jump down to the sand (82_02 from 4 s in), and look
# around (77_01, more upright). Takes are chained with short crossfades, each placed where the last
# one ended; the set is fitted to the motion (rim where the foot crosses, deck edge where the jump
# leaves); feet are locked to the deck or sand whenever the performer touched the ground; every
# frame is checked for floating, sinking and legs inside the pod walls.
#
# blender -b --factory-startup -P tools/cinematics/pod_exit.py -- [--check] [--views]
#   default: a motion-only preview (flat grey, front/side/top/shot views tiled) to out/pod_exit_preview
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import lib, mocap, retarget

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FADE = 10                # crossfade frames between takes
UPRIGHT_BONES = ("Spine", "Spine1", "Spine2", "Neck", "Head", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg")
DOWN, UP = Vector((0, 0, -1)), Vector((0, 0, 1))


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def slerp_dir(a, b, t):
    a, b = a.normalized(), b.normalized()
    if t <= 0: return a
    if t >= 1: return b
    q = a.rotation_difference(b)
    return (Matrix.Identity(3).to_quaternion().slerp(q, t).to_matrix() @ a).normalized()


def upright(dirs, frame, w):
    """Blend the spine toward vertical and the legs toward straight down, by w (0..1)."""
    out = dict(dirs)
    for n in UPRIGHT_BONES:
        target = DOWN if ("Leg" in n) else UP
        out[n] = slerp_dir(dirs[n], target, w)
    up, right = frame
    return out, (slerp_dir(up, UP, w), right)


def foot_z(seg, side):
    return min(seg[f"{side}toes"][1].z, seg[f"{side}foot"][1].z, seg[f"{side}foot"][0].z)


def body_min(seg):
    return min(min(s.z, e.z) for s, e in seg.values())


# ---------------------------------------------------------------- takes and their edits
class Take:
    def __init__(self, name, a, b, src_fps=120):
        self.clip = mocap.Clip(name, src_fps=src_fps)
        self.name, self.a, self.b = name, a, min(b, len(self.clip))
        seg0, _, _ = self.clip.pose(0)
        self.leg = (seg0["lfemur"][1] - seg0["lfemur"][0]).length + (seg0["ltibia"][1] - seg0["ltibia"][0]).length
        self.floor = None  # height the body is placed from (a ledge take overrides it)
        self._ground = None

    def ground(self):
        """The take's floor: the lowest the body ever gets over the frames used."""
        if self._ground is None:
            self._ground = min(body_min(self.clip.pose(i)[0]) for i in self.frames())
        return self._ground

    def frames(self):
        return range(self.a, self.b)

    def edit(self, i, dirs, frame, seg):
        return dirs, frame


class GetUp(Take):
    def edit(self, i, dirs, frame, seg):
        w = smooth((i - (self.b - 50)) / 40)  # straighten up over the last second and a half
        return upright(dirs, frame, w) if w > 0 else (dirs, frame)


class StepOver(Take):
    """Cut the walk-in: start just before the first foot leaves the ground; lift each foot higher."""
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        lifts = [max(foot_z(self.clip.pose(i)[0], "l"), foot_z(self.clip.pose(i)[0], "r")) for i in range(len(self.clip))]
        ground = min(lifts)
        peak = max(range(len(lifts)), key=lambda i: lifts[i])
        start = peak
        while start > 0 and lifts[start] - ground > 0.04: start -= 1
        self.a = max(0, start - 3)
        # end: both feet down again after the second foot's step
        end = peak
        later = [i for i in range(peak, len(lifts)) if lifts[i] - ground > 0.12]
        end = (later[-1] if later else peak)
        while end < len(lifts) - 1 and lifts[end] - ground > 0.03: end += 1
        self.b = min(len(lifts), end + 12)
        self.foot_floor, self.peak_lift = ground, lifts[peak] - ground

    def edit(self, i, dirs, frame, seg):
        up, right = frame
        out = dict(dirs)
        for side, prefix in (("l", "Left"), ("r", "Right")):
            lift = (foot_z(seg, side) - self.foot_floor) / max(self.peak_lift, 1e-3)
            if lift <= 0.02: continue
            ang = math.radians(32) * smooth(lift)  # up to 32 degrees more hip flexion at the top of the step
            # swing the whole leg forward-up about the hip's left-right axis (whichever way raises the knee)
            for sign in (1, -1):
                rot = Matrix.Rotation(sign * ang, 3, right)
                if (rot @ dirs[f"{prefix}UpLeg"]).z > dirs[f"{prefix}UpLeg"].z: break
            for b in ("UpLeg", "Leg", "Foot", "ToeBase"):
                out[f"{prefix}{b}"] = rot @ dirs[f"{prefix}{b}"]
        return out, frame


class Drop(Take):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.floor = body_min(self.clip.pose(self.a)[0])  # standing on the ledge


class Look(Take):
    def edit(self, i, dirs, frame, seg):
        return upright(dirs, frame, 0.6)


def build_takes():
    # stick preview windows: drop showed clip frames 165..435; Doug: "from 0:04" -> 165 + 120
    return [GetUp("140_08", 0, 224), StepOver("143_15", 0, 10_000), Take("139_19", 0, 75),
            Drop("82_02", 285, 435), Look("77_01", 0, 90, src_fps=60)]


# ---------------------------------------------------------------- the timeline
def heading(right):
    """Facing angle (radians, about Z) from the pelvis right vector."""
    f = Vector((-right.y, right.x, 0))  # forward = up x right
    return math.atan2(f.y, f.x)


def timeline(takes, scale_of):
    """Every output frame: (take index, dirs, (up, right), pelvis world position, mocap contact)."""
    out = []
    pos_end, head_end = Vector((0, 0, 0)), None
    for k, t in enumerate(takes):
        s = scale_of(t)
        seg_a, _, _ = t.clip.pose(t.a)
        c_a, up_a, right_a = retarget.pelvis(seg_a)
        if k == 0:
            # lying: turn the take so the body lies along -X (head toward -X), pelvis at the origin
            axis = seg_a["head"][1] - c_a
            rot_z = math.atan2(-0.0, -1.0) - math.atan2(axis.y, axis.x)
            base = Vector((0, 0, 0))
        else:
            h_a = heading(right_a)
            want = head_end
            if isinstance(t, StepOver):  # step straight out over a side wall: snap to the nearest axis
                want = round(want / (math.pi / 2)) * (math.pi / 2)
            rot_z = want - h_a
            base = pos_end.copy()
        R = Matrix.Rotation(rot_z, 3, "Z")
        z0 = t.floor if t.floor is not None else t.ground()
        for j, i in enumerate(t.frames()):
            seg, _, _ = t.clip.pose(i)
            c, up, right = retarget.pelvis(seg)
            dirs = retarget.mocap_dirs(seg)
            dirs, (up, right) = t.edit(i, dirs, (up, right), seg)
            dirs = {n: R @ v for n, v in dirs.items()}
            up, right = R @ up, R @ right
            d = R @ (c - c_a)
            p = Vector((base.x + d.x * s, base.y + d.y * s, (c.z - z0) * s))
            contact = (body_min(seg) - t.ground() < 0.05) if not isinstance(t, Drop) else None
            out.append([k, dirs, (up, right), p, contact, t, i])
        last = out[-1]
        pos_end, head_end = Vector((last[3].x, last[3].y, 0)), heading(last[2][1])
        if k > 0:  # crossfade the first FADE frames of this take from the previous take's last pose
            first = len(out) - len(t.frames())
            prev = out[first - 1]
            for j in range(min(FADE, len(t.frames()))):
                w = smooth((j + 1) / (FADE + 1))
                cur = out[first + j]
                cur[1] = {n: slerp_dir(prev[1][n], cur[1][n], w) for n in cur[1]}
                cur[2] = (slerp_dir(prev[2][0], cur[2][0], w), slerp_dir(prev[2][1], cur[2][1], w))
    return out


# ---------------------------------------------------------------- scene
sc = lib.reset(640, 360)
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "OBJECT"
sc.view_settings.view_transform = "Standard"
lib.sky(horizon="#d6d6d6", zenith="#c8c8c8", haze=0)
sc.world.color = (0.84, 0.84, 0.84)

root = lib.place("unit.player", at=(0, 0, 0), height=1.8, name="commander")
lib.still(root)
arm = bpy.data.objects[root["armature"]]
# the skinned suit (the file also carries a helper sphere, hidden here)
body = next(bpy.data.objects[n] for n in root["meshes"] if any(m.type == "ARMATURE" for m in bpy.data.objects[n].modifiers))
for n in root["meshes"]:
    if bpy.data.objects[n] is not body: bpy.data.objects[n].hide_render = True
body.color = (0.62, 0.6, 0.57, 1)
bpy.context.view_layer.update()  # place() scaled the model: the rig must read its final world matrix
rig = retarget.Rig(arm)
takes = build_takes()
TL = timeline(takes, lambda t: rig.leg_world / t.leg)
N = len(TL)

# Fit the set to the motion. Ledge drop height (commander scale) from the drop take.
drop = next(t for t in takes if isinstance(t, Drop))
DROP_H = drop.floor * rig.leg_world / drop.leg


def place(frame_row, lock_dz=0.0):
    _, dirs, fr, p, _, _, _ = frame_row
    rig.pose(dirs, fr, p + Vector((0, 0, lock_dz)))


def mesh_points():
    dg = bpy.context.evaluated_depsgraph_get()
    ev = body.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    pts = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return pts


# pass 1: pose everything unlocked, measure the set from where the body goes
k_drop = next(k for k, t in enumerate(takes) if isinstance(t, Drop))
k_step = next(k for k, t in enumerate(takes) if isinstance(t, StepOver))
lying_pts, step_peak, takeoff = [], None, None
best_lift = -1
for f, row in enumerate(TL):
    place(row)
    bpy.context.view_layer.update()
    if row[0] == 0 and row[6] < 20:
        lying_pts += mesh_points()[::7]
    if row[0] == k_step:
        pts = mesh_points()
        lo = min(p.z for p in pts)
        feet = [arm.matrix_world @ arm.pose.bones[retarget.P + n].tail for n in ("LeftToeBase", "RightToeBase")]
        top = max(feet, key=lambda v: v.z)
        if top.z - lo > best_lift: best_lift, step_peak = top.z - lo, top.copy()
    if row[0] == k_drop and takeoff is None:
        seg, _, _ = row[5].clip.pose(row[6])
        if body_min(seg) < drop.floor - 0.06:  # feet have left the ledge
            toes = [arm.matrix_world @ arm.pose.bones[retarget.P + n].tail for n in ("LeftToeBase", "RightToeBase")]
            takeoff = (row[3].copy(), toes)

# the pod: a low tub round the lying body, its front rim on the line the step crosses
xs = [p.x for p in lying_pts]; ys = [p.y for p in lying_pts]
x0, x1, y0, y1 = min(xs) - 0.15, max(xs) + 0.15, min(ys) - 0.12, max(ys) + 0.12
step_dir = Vector((math.cos(heading(TL[next(i for i, r in enumerate(TL) if r[0] == k_step)][2][1])),
                   math.sin(heading(TL[next(i for i, r in enumerate(TL) if r[0] == k_step)][2][1])), 0))
ax = max((Vector((1, 0, 0)), Vector((-1, 0, 0)), Vector((0, 1, 0)), Vector((0, -1, 0))), key=lambda a: a.dot(step_dir))
if ax.x > 0.5: x1 = step_peak.x
elif ax.x < -0.5: x0 = step_peak.x
elif ax.y > 0.5: y1 = step_peak.y
else: y0 = step_peak.y
RIM_H = round(min(0.42, max(0.2, best_lift * 0.6)), 2)
WALL_T = 0.08
walls = []


def box(name, cx, cy, cz, sx, sy, sz, color):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, cz))
    o = bpy.context.object
    o.name, o.scale, o.color = name, (sx, sy, sz), color
    return o


wall_c = (0.45, 0.5, 0.58, 1)
for nm, cx, cy, sx, sy in (("rim_x0", x0 - WALL_T / 2, (y0 + y1) / 2, WALL_T, y1 - y0 + 2 * WALL_T),
                           ("rim_x1", x1 + WALL_T / 2, (y0 + y1) / 2, WALL_T, y1 - y0 + 2 * WALL_T),
                           ("rim_y0", (x0 + x1) / 2, y0 - WALL_T / 2, x1 - x0, WALL_T),
                           ("rim_y1", (x0 + x1) / 2, y1 + WALL_T / 2, x1 - x0, WALL_T)):
    walls.append(box(nm, cx, cy, RIM_H / 2, sx, sy, RIM_H, wall_c))

# the deck ends at the takeoff line, the sand lies DROP_H below
t_pos, t_toes = takeoff
jump_dir = (TL[-1][3] - t_pos); jump_dir.z = 0; jump_dir.normalize()
edge_d = max(v.dot(jump_dir) for v in t_toes) + 0.02  # just past the toes at takeoff
deck_c, sand_c = (0.55, 0.55, 0.57, 1), (0.66, 0.6, 0.5, 1)
deck = box("deck", 0, 0, -DROP_H / 2, 40, 40, DROP_H, deck_c)
cut = box("cut", 0, 0, -DROP_H / 2, 40, 40, DROP_H + 0.02, deck_c)
cut.rotation_euler = (0, 0, math.atan2(jump_dir.y, jump_dir.x))
cut.location = Vector((0, 0, -DROP_H / 2)) + jump_dir * (edge_d + 20)
mod = deck.modifiers.new("edge", "BOOLEAN")
mod.object, mod.operation = cut, "DIFFERENCE"
bpy.context.view_layer.objects.active = deck
bpy.ops.object.modifier_apply(modifier="edge")
bpy.data.objects.remove(cut)
box("sand", 0, 0, -DROP_H - 0.05, 60, 60, 0.1, sand_c)


def support(p):
    return 0.0 if p.dot(jump_dir) <= edge_d else -DROP_H


# pass 2: lock feet to the ground in contact frames, key every frame, check every frame
locks, report = [], []
for f, row in enumerate(TL):
    place(row)
    bpy.context.view_layer.update()
    pts = mesh_points()
    low = min(pts, key=lambda v: v.z)
    dz = 0.0
    if row[4] is True:          # the performer was on the ground: put the body on ours
        dz = support(low) - low.z
    elif row[4] is None:        # the drop: on the ledge before takeoff, on the sand after landing
        seg, _, _ = row[5].clip.pose(row[6])
        bm = body_min(seg)
        if abs(bm - drop.floor) < 0.05 or bm - drop.ground() < 0.05:
            dz = support(low) - low.z
    locks.append(dz)
# smooth the lock so contact changes never pop
sm = [sum(locks[max(0, i - 3):i + 4]) / len(locks[max(0, i - 3):i + 4]) for i in range(N)]
for f, row in enumerate(TL):
    place(row, sm[f])
    for b in arm.pose.bones:
        b.keyframe_insert("rotation_quaternion", frame=f + 1)
        if b.name == retarget.P + "Hips": b.keyframe_insert("location", frame=f + 1)
# pass 3: play the keyed animation back and check every frame
for f, row in enumerate(TL):
    sc.frame_set(f + 1)
    pts = mesh_points()
    low = min(pts, key=lambda v: v.z)
    gap = low.z - support(low)
    issues = []
    if row[4] is True and gap > 0.04: issues.append(f"floating {gap * 100:.0f} cm")
    if gap < -0.04: issues.append(f"sinking {-gap * 100:.0f} cm")
    inside = 0
    for w in walls:
        lo_, hi_ = w.location - w.scale / 2, w.location + w.scale / 2
        inside += sum(1 for p in pts[::3] if lo_.x < p.x < hi_.x and lo_.y < p.y < hi_.y and lo_.z < p.z < hi_.z)
    if inside > 0: issues.append(f"{inside} suit points inside the pod rim")
    if f % 15 == 0: print(f"DBG f{f + 1} {takes[row[0]].name} clipf {row[6]} contact {row[4]} low {low.z:.3f} support {support(low):.2f} gap {gap:.3f} lock {sm[f]:.3f} pelvis_z {row[3].z:.2f}")
    if issues: report.append(f"f{f + 1:04d} [{takes[row[0]].name}] " + "; ".join(issues))

sc.frame_start, sc.frame_end = 1, N
os.makedirs(lib.OUT, exist_ok=True)
with open(os.path.join(lib.OUT, "pod_exit_check.txt"), "w") as fh:
    fh.write(f"{N} frames; rim {RIM_H} m; drop {DROP_H:.2f} m; takes " + ", ".join(f"{t.name} [{t.a}:{t.b}]" for t in takes) + "\n")
    fh.write(f"{len(report)} frames with issues\n" + "\n".join(report) + "\n")
print(f"POD_EXIT {N} frames, rim {RIM_H} m, drop {DROP_H:.2f} m, {len(report)} frames flagged")

# cameras: front, side, top, and a low three-quarter shot camera, all following the pelvis
centre = sum((r[3] for r in TL), Vector()) / N
cams = {
    "front": lib.camera(centre + Vector((0, -7.5, 1.2)), centre + Vector((0, 0, 0.3)), lens=30, name="front"),
    "side": lib.camera(centre + Vector((7.5, 0, 1.2)), centre + Vector((0, 0, 0.3)), lens=30, name="side"),
    "top": lib.camera(centre + Vector((0, 0, 12)), centre, lens=30, name="top"),
    "shot": lib.camera(Vector((x0 - 1.8, y0 - 2.6, 1.3)), Vector(((x0 + x1) / 2, (y0 + y1) / 2, 0.6)), lens=32, name="shot"),
}
if "--check" in args:
    for name, cam in cams.items():
        sc.camera = cam
        for f in (1, N // 4, N // 2, 3 * N // 4, N):
            sc.frame_set(f)
            lib.render_still(os.path.join(lib.OUT, f"pod_{name}_{f:04d}.png"))
else:
    for name, cam in cams.items():
        sc.camera = cam
        lib.render_frames(os.path.join(lib.OUT, f"pod_view_{name}"), 1, N)
