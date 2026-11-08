# Shot down and back up, for every human who can be laid out (Doug, 2026-11-08): the fall Doug approved for Vale
# (vale_fall_stick.py, takes 1-3) cut into two in-game animations and retargeted onto one crew model:
#   Crew_Fall   the bullet strike, thrown back, onto the back; the game holds its last frame while the guard lies
#   Crew_GetUp  roll onto the front and stand up, at 2x Vale's speed (Doug, 2026-11-08: 2.4 s); it ends standing
#               where the fall started, turned the way the capture turns (about 175 degrees: rigged.ts turns the
#               character back once it stands, so the roll itself never spins)
# Both start from the model's own facing (the rig's forward); root motion is in the hips. The fall drifts back about
# a metre (scaled to the model's legs); the get-up walks that drift back out, spread over the roll and stand.
#
# blender -b --factory-startup -P tools/cinematics/crew_fall_bake.py -- "<source>.glb" [--check]
#   reads  ../Asset workflow/3D Models/<source>.glb
#   writes ../Asset workflow/3D Models/<source stem>_falls.glb (its clips plus Crew_Fall and Crew_GetUp)
#   --check: side stills of both clips to out/crew_<stem>_*.png instead of writing
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
from mathutils import Matrix, Vector
import lib, retarget, vale_fall_stick as stick

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "Asset workflow", "3D Models"))
SRC = os.path.join(MODELS, args[0])
STEM = os.path.splitext(args[0])[0]
DST = os.path.join(MODELS, STEM + "_falls.glb")
FALL, GETUP = "Crew_Fall", "Crew_GetUp"
STAND = 6  # frames easing the get-up's last (slightly crouched) pose into a straight stand
GETUP_STEP = 2  # the get-up at 2x Vale's speed (every second frame)


def leg(seg):
    return (seg["lfemur"][1] - seg["lfemur"][0]).length + (seg["ltibia"][1] - seg["ltibia"][0]).length


def lowest(seg):
    return min(min(s.z, e.z) for s, e in seg.values())


def flat(v):
    return Vector((v.x, v.y, 0)).normalized()


def move(seg, M, t):
    return {n: (M @ s + t, M @ e + t) for n, (s, e) in seg.items()}


def turn_about(seg, ang, pivot, t):
    """Turn every joint by ang about the vertical through pivot, then shift by t."""
    R = Matrix.Rotation(ang, 3, "Z")
    return {n: (pivot + R @ (s - pivot) + t, pivot + R @ (e - pivot) + t) for n, (s, e) in seg.items()}


def clips():
    """The fall (strike to lying on the back) and the get-up (roll to standing), in stick space: the fall starts with
    the pelvis over the origin facing +Y; the get-up ends there, facing +Y again."""
    frames, labels = stick.build()
    roll, run = labels[1][0], labels[3][0]
    c0, _, _ = retarget.pelvis(frames[0])
    f0 = stick.belly(frames[0])
    R = Matrix.Rotation(math.atan2(1, 0) - math.atan2(f0.y, f0.x), 3, "Z")  # facing +Y
    frames = [move(s, R, -(R @ Vector((c0.x, c0.y, 0)))) for s in frames[:run]]
    fall, getup = frames[:roll], frames[roll - 1:][::GETUP_STEP]
    # the get-up walks the drift out: by its end the pelvis is back over the origin (eased in over the clip)
    ce, _, _ = retarget.pelvis(getup[-1])
    off = Vector((ce.x, ce.y, 0))
    n = len(getup) - 1
    out = [move(s, Matrix.Identity(3), -off * stick.smooth(i / n)) for i, s in enumerate(getup)]
    # then into a straight stand: the fall's first (standing) pose, turned to the way the get-up ends facing
    fe = stick.belly(out[-1])
    turn = math.atan2(fe.y, fe.x) - math.atan2(1, 0)
    stand = turn_about(fall[0], turn, Vector((0, 0, 0)), Vector((0, 0, 0)))
    last = out[-1]
    out += [stick.lerp_seg(last, stand, stick.smooth(j / STAND)) for j in range(1, STAND + 1)]
    print(f"get-up: ends turned {math.degrees(turn):.0f} deg, drift walked out {off.length:.2f} (stick units)")
    return fall, out


def main():
    fall, getup = clips()
    lib.reset(720, 720, fps=30)
    bpy.ops.import_scene.gltf(filepath=SRC)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = [o for o in bpy.data.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
    keep = {a.name for a in bpy.data.actions}
    arm.animation_data_create()
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    rig = retarget.Rig(arm)
    allf = fall + getup
    s = rig.leg_world / (sum(leg(f) for f in allf) / len(allf))
    # the rig's own forward (world, flat): up x right at rest; stick space faces +Y, so turn it onto the rig's
    up = arm.matrix_world.to_3x3() @ rig.up_rest
    right = arm.matrix_world.to_3x3() @ rig.right_rest
    fwd = flat(up.cross(right))
    TURN = Matrix.Rotation(math.atan2(fwd.y, fwd.x) - math.atan2(1, 0), 3, "Z")
    hip0 = arm.matrix_world @ rig.hip_mid_rest
    base = Vector((hip0.x, hip0.y, 0))

    def place(seg, dz=0.0):
        c, u, r = retarget.pelvis(seg)
        dirs = {k: TURN @ v for k, v in retarget.mocap_dirs(seg).items()}
        rig.pose(dirs, (TURN @ u, TURN @ r), base + TURN @ (c * s) + Vector((0, 0, dz)))

    def mesh_min():
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        lo = 1e9
        for b in body:
            ev = b.evaluated_get(dg)
            me = ev.to_mesh()
            co = np.empty(len(me.vertices) * 3)
            me.vertices.foreach_get("co", co)
            m = np.array(ev.matrix_world)
            lo = min(lo, float((co.reshape(-1, 3) @ m[2, :3] + m[2, 3]).min()))
            ev.to_mesh_clear()
        return lo

    # neutral back, as in vale_fall_bake.py: the trunk pitch that stands the first (standing) frame upright
    def lean(pitch):
        rig.trunk_pitch = pitch
        place(fall[0])
        bpy.context.view_layer.update()
        pbs, mw = arm.pose.bones, arm.matrix_world
        hip, neck = mw @ pbs[retarget.P + "Hips"].head, mw @ pbs[retarget.P + "Neck"].head
        v = neck - hip
        return math.atan2(v.dot(fwd), v.dot(Vector((0, 0, 1))))

    lo_p, hi_p = -0.7, 0.7
    if lean(lo_p) * lean(hi_p) > 0:
        raise SystemExit("trunk calibration: no upright pitch in range")
    for _ in range(30):
        m = (lo_p + hi_p) / 2
        if (lean(m) > 0) == (lean(lo_p) > 0): lo_p = m
        else: hi_p = m
    rig.trunk_pitch = (lo_p + hi_p) / 2
    print(f"{STEM}: trunk pitch {math.degrees(rig.trunk_pitch):.1f} deg; scale {s:.3f}; fall {len(fall)}, get-up {len(getup)} frames")

    # ground lock: the body's lowest point sits where the stick figure's did, smoothed so contacts do not jitter
    def lock(frames):
        dzs = []
        for seg in frames:
            place(seg)
            dzs.append(lowest(seg) * s - mesh_min())
        return [sum(dzs[max(0, i - 2): i + 3]) / len(dzs[max(0, i - 2): i + 3]) for i in range(len(dzs))]

    lf, lg = lock(fall), lock(getup)
    # the get-up starts on the fall's last lock, so the held pose and the get-up's first frame match
    lg = [lf[-1] + (v - lf[-1]) * stick.smooth(i / 8) if i < 8 else v for i, v in enumerate(lg)]

    if "--check" in args:
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_WORKBENCH"
        lib.sky(horizon="#d9d9d9", zenith="#bfbfbf", haze=0)
        bpy.ops.mesh.primitive_plane_add(size=40)
        side = fwd.cross(Vector((0, 0, 1)))
        lib.camera(tuple(base + side * 6 + Vector((0, 0, 1.0))), tuple(base + Vector((0, 0, 0.5))), lens=35, name="side")
        for name, frames, lk in (("fall", fall, lf), ("getup", getup, lg)):
            for f in sorted({0, len(frames) // 4, len(frames) // 2, 3 * len(frames) // 4, len(frames) - 1}):
                place(frames[f], lk[f])
                lib.render_still(os.path.join(lib.OUT, f"crew_{STEM.replace(' ', '_')}_{name}_{f:03d}.png"))
        return

    for name, frames, lk in ((FALL, fall, lf), (GETUP, getup, lg)):
        arm.animation_data.action = None
        for f, seg in enumerate(frames):
            place(seg, lk[f])
            for pb in arm.pose.bones:
                if pb.name.startswith(retarget.P) and pb.name.replace(retarget.P, "") in ["Hips"] + [c[0] for c in retarget.CHAIN]:
                    pb.keyframe_insert("rotation_quaternion", frame=f)
                    if pb.name == retarget.P + "Hips":
                        pb.keyframe_insert("location", frame=f)
        act = arm.animation_data.action
        act.name = name
        act.use_fake_user = True
    for a in bpy.data.actions:
        if a.name in keep: a.use_fake_user = True
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    for b in body: b.select_set(True)
    for o in bpy.data.objects:
        if o.parent == arm: o.select_set(True)
    bpy.context.view_layer.objects.active = arm
    # optimize: drop keys that repeat, so the clips the model already had do not come back fully sampled
    bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB", use_selection=True, export_animation_mode="ACTIONS", export_yup=True, export_optimize_animation_size=True)
    print(f"wrote {DST}: {FALL} {len(fall)} frames ({len(fall) / 30:.2f} s), {GETUP} {len(getup)} frames ({len(getup) / 30:.2f} s)")


main()
