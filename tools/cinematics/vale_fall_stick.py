# S32 Vale's fall (BACKLOG #6), Doug's picks of 2026-11-07, chained as one stick-figure preview:
#   1. 90_18 fall on the back, with a bullet strike first: thrown straight back, feet off the ground
#   2. 111_21 roll from the back onto the front, at 2x speed
#   3. 140_01 get up from face down, at half speed, cut at 4.0 s (before it hunches over)
#   4. straight into a run to screen right (143_03 start to run, then the 09_02 cycle): in game, not the film
# The helmet (black) comes off when the head meets the ground and rolls away.
# Each take is placed where the last one ended, turned to match, set on the floor, and crossfaded.
#
# blender -b --factory-startup -P tools/cinematics/vale_fall_stick.py -- [--check]
#   writes out/vale_fall_stick_side/ and out/vale_fall_stick_high/ frames (side and high 3/4 views)
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import lib, mocap, retarget

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
FADE = 8                 # crossfade frames between takes
STRIKE = 7               # frames of the bullet strike before the fall starts
STRIKE_BACK = 0.45       # metres thrown back by the strike
STRIKE_LIFT = 0.10       # metres the feet leave the ground
STRIKE_PITCH = 10        # degrees the body tips back during the strike
HELMET_R = 0.14


def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def flat(v):
    return Vector((v.x, v.y, 0)).normalized()


def axis(seg):
    """Body axis on the floor, pelvis to head: the heading for lying and crouched poses."""
    c, _, _ = retarget.pelvis(seg)
    return flat(seg["head"][1] - c)


def belly(seg):
    """Facing on the floor for standing poses."""
    _, up, right = retarget.pelvis(seg)
    return flat(up.cross(right))


class Take:
    """frames a..b of a CMU take sampled at 30*slow fps (slow 2 = half speed, 0.5 = double)."""

    def __init__(self, name, a, b, slow=1.0, head_in=axis, head_out=axis, fade=FADE, label=""):
        self.clip = mocap.Clip(name, src_fps=120, fps=30 * slow)
        self.name, self.label = name, label
        self.a, self.b = int(a * slow), min(int(b * slow), len(self.clip))
        self.head_in, self.head_out, self.fade = head_in, head_out, fade
        self.ground = min(min(min(s.z, e.z) for s, e in self.clip.pose(i)[0].values()) for i in range(self.a, self.b))

    def frames(self):
        for i in range(self.a, self.b):
            seg, _, _ = self.clip.pose(i)
            yield {n: (s.copy(), e.copy()) for n, (s, e) in seg.items()}


def move(seg, M, t):
    """Rigid transform of every joint: p -> M @ p + t."""
    return {n: (M @ s + t, M @ e + t) for n, (s, e) in seg.items()}


def lerp_seg(a, b, w):
    return {n: (a[n][0].lerp(b[n][0], w), a[n][1].lerp(b[n][1], w)) for n in b if n in a}


def build():
    # (take, frames) in 30 fps clip time; see tools/cinematics stick previews of 2026-11-07
    takes = [
        Take("90_18", 12, 50, label="1  hit, thrown back, fall"),               # fall starts at 18, lands 36
        Take("111_21", 246, 300, slow=0.5, label="2  roll over  (2x)"),          # back at 246, front by 306
        Take("140_01", 40, 120, slow=2, head_out=axis, label="3  get up  (half speed, cut at 4.0 s)"),
        Take("143_03", 33, 58, head_in=belly, head_out=belly, label="4  run right  (in game)"),
        Take("09_02", 0, 24, head_in=belly, head_out=belly, fade=3, label="4  run right  (in game)"),
        Take("09_02", 0, 24, head_in=belly, head_out=belly, fade=3, label="4  run right  (in game)"),
    ]
    out, labels = [], []  # out: per frame {bone: (start, end)}; labels: (first frame, text)
    for k, t in enumerate(takes):
        poses = list(t.frames())
        p0 = poses[0]
        c0, _, _ = retarget.pelvis(p0)
        if k == 0:
            M, base = Matrix.Identity(3), Vector((0, 0, 0))
        else:
            prev = out[-1]
            want = takes[k - 1].head_out(prev)
            have = t.head_in(p0)
            ang = math.atan2(want.y, want.x) - math.atan2(have.y, have.x)
            M = Matrix.Rotation(ang, 3, "Z")
            pc, _, _ = retarget.pelvis(prev)
            base = Vector((pc.x, pc.y, 0))
        shift = base - M @ Vector((c0.x, c0.y, t.ground))
        first = len(out)
        if k == 0:
            # the bullet strike: hold the standing pose, throw it straight back with the feet off the ground
            back = -belly(p0)
            for j in range(STRIKE):
                s = ease_out((j + 1) / STRIKE)
                lift = STRIKE_LIFT * math.sin(math.pi * 0.5 * s)
                pitch = Matrix.Rotation(math.radians(STRIKE_PITCH) * s, 3, back.cross(Vector((0, 0, 1))).normalized() * -1)
                pivot = Vector((c0.x, c0.y, c0.z))
                seg = {n: (pivot + pitch @ (a - pivot), pivot + pitch @ (b - pivot)) for n, (a, b) in p0.items()}
                out.append(move(seg, M, shift + back * STRIKE_BACK * s + Vector((0, 0, lift))))
            labels.append((0, t.label))
            # the fall keeps the strike's offset; the lift and pitch fade as the fall takes over
            fall_from = 18 - t.a
            for j, seg in enumerate(poses):
                if j < fall_from:
                    continue  # the strike replaced the standing frames before the fall
                f = j - fall_from
                w = 1 - smooth(f / 10)
                pitch = Matrix.Rotation(math.radians(STRIKE_PITCH) * w, 3, back.cross(Vector((0, 0, 1))).normalized() * -1)
                pivot = Vector((c0.x, c0.y, c0.z))
                seg = {n: (pivot + pitch @ (a - pivot), pivot + pitch @ (b - pivot)) for n, (a, b) in seg.items()}
                drift = back * (STRIKE_BACK + 0.15 * ease_out(f / 12))
                out.append(move(seg, M, shift + drift + Vector((0, 0, STRIKE_LIFT * w))))
            continue
        for seg in poses:
            out.append(move(seg, M, shift))
        labels.append((first, t.label))
        hold = out[first - 1]
        for j in range(min(t.fade, len(poses))):
            out[first + j] = lerp_seg(hold, out[first + j], smooth((j + 1) / (t.fade + 1)))
    # turn the whole thing so the run heads to +X (screen right); the fall spot at x = -1
    run_a, _, _ = retarget.pelvis(out[labels[3][0]])
    run_b, _, _ = retarget.pelvis(out[-1])
    d = flat(run_b - run_a)
    R = Matrix.Rotation(-math.atan2(d.y, d.x), 3, "Z")
    c_first, _, _ = retarget.pelvis(out[0])
    t0 = Vector((-1.0, 0, 0)) - R @ Vector((c_first.x, c_first.y, 0))
    out = [move(s, R, t0) for s in out]
    return out, labels


def helmet_path(frames):
    """Helmet on the head until the head first meets the ground, then it rolls away toward the camera."""
    contact = next(i for i, s in enumerate(frames) if s["head"][1].z < 0.22 and i > STRIKE)
    h0 = frames[contact]["head"][1].copy()
    c, _, _ = retarget.pelvis(frames[contact])
    away = (flat(h0 - c) + Vector((0, -1.2, 0))).normalized()  # past the head, mostly toward the camera
    path = []
    for i, s in enumerate(frames):
        if i < contact:
            path.append(s["head"][1].copy())
            continue
        t = (i - contact) / 30
        dist = 0.9 * (1 - math.exp(-t * 2.2))
        bounce = 0.12 * abs(math.sin(t * 9)) * math.exp(-t * 5)
        path.append(Vector((h0.x, h0.y, 0)) + away * dist + Vector((0, 0, HELMET_R + bounce)))
    return path, contact


def bone_obj(name, color, r):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=1, location=(0, 0, 0.5))
    o = bpy.context.object
    bpy.ops.object.transform_apply(location=True)
    o.name, o.color, o.rotation_mode = name, color, "QUATERNION"
    return o


def main():
    frames, labels = build()
    helm, contact = helmet_path(frames)
    n = len(frames)
    sc = lib.reset(1280, 720)
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.light = "STUDIO"
    sc.display.shading.color_type = "OBJECT"
    sc.view_settings.view_transform = "Standard"
    lib.sky(horizon="#d9d9d9", zenith="#bfbfbf", haze=0)
    sc.world.color = (0.82, 0.82, 0.82)
    col = (0.85, 0.35, 0.2, 1)
    objs = {}
    for name in frames[0]:
        thick = 0.045 if any(t in name for t in ("femur", "tibia", "humerus", "back", "thorax")) else 0.03
        objs[name] = bone_obj(name, col, thick)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11)
    head = bpy.context.object
    head.color = col
    bpy.ops.mesh.primitive_uv_sphere_add(radius=HELMET_R)
    hel = bpy.context.object
    hel.color = (0.05, 0.05, 0.06, 1)
    for f, seg in enumerate(frames):
        for name, (s, e) in seg.items():
            o, v = objs[name], e - s
            o.location = s
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized()) if v.length > 1e-6 else (1, 0, 0, 0)
            o.scale = (1, 1, max(v.length, 1e-4))
            for p in ("location", "rotation_quaternion", "scale"):
                o.keyframe_insert(p, frame=f + 1)
        head.location = seg["head"][1]
        head.keyframe_insert("location", frame=f + 1)
        hel.location = helm[f]
        hel.keyframe_insert("location", frame=f + 1)
    # floor with 1 m lines so distances read
    bpy.ops.mesh.primitive_plane_add(size=60)
    bpy.context.object.color = (0.75, 0.73, 0.7, 1)
    for x in range(-6, 12):
        bpy.ops.mesh.primitive_cube_add(size=1, location=(x, 0, 0.002))
        g = bpy.context.object
        g.scale = (0.01, 30, 0.002)
        g.color = (0.62, 0.6, 0.57, 1)
    sc.frame_start, sc.frame_end = 1, n
    print(f"vale_fall_stick: {n} frames ({n / 30:.1f} s); helmet off at frame {contact + 1}; beats {labels}")
    with open(os.path.join(lib.OUT, "vale_fall_stick_beats.txt"), "w") as fh:
        for i, (a, text) in enumerate(labels):
            b = labels[i + 1][0] if i + 1 < len(labels) else n
            fh.write(f"{a}\t{b}\t{text}\n")
    views = {"side": ((0.4, -5.8, 1.0), (0.4, 0, 0.55), 40), "high": ((2.6, -3.6, 2.9), (-0.2, 0, 0.3), 32)}
    for view, (at, look, lens) in views.items():
        cam = lib.camera(at, look, lens=lens, name=view)
        sc.camera = cam
        if "--check" in args:
            for f in (1, STRIKE, contact + 1, labels[1][0] + 10, labels[2][0] + 60, labels[3][0] + 5, n):
                sc.frame_set(f)
                lib.render_still(os.path.join(lib.OUT, f"vale_fall_stick_{view}_{f:03d}.png"))
        else:
            lib.render_frames(os.path.join(lib.OUT, f"vale_fall_stick_{view}"), 1, n)


main()
