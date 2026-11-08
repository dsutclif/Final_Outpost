# S32 Vale's fall (BACKLOG #6): the motion Doug approved in vale_fall_stick.py, retargeted onto Vale's warlord rig
# and written into the source model as a clip, so the game plays it like any other (meshy.json clips.fall).
#
# blender -b --factory-startup -P tools/cinematics/vale_fall_bake.py -- [--check]
#   reads  ../Asset workflow/3D Models/Warlord_headless_Vale_Animated.glb
#   writes ../Asset workflow/3D Models/Warlord_headless_Vale_Animated_fall.glb (its clips plus Vale_Fall)
#   --check: profile and front stills of the baked clip to out/vale_bake_*.png instead of writing
#
# The clip runs from the strike to Vale's first strides (RUN_TAIL frames past the get-up's cut); in play the
# warlord's own Running clip takes over from there. Root motion is in the hips: the clip starts with the pelvis
# over the origin, and the run heads +X (Blender) = +x in three.js, the screen's right in the side-on scene.
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
import numpy as np
from mathutils import Vector
import lib, retarget, vale_fall_stick as stick

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "Asset workflow", "3D Models"))
SRC = os.path.join(MODELS, "Warlord_headless_Vale_Animated.glb")
DST = os.path.join(MODELS, "Warlord_headless_Vale_Animated_fall.glb")
ACTION = "Vale_Fall"
RUN_TAIL = 14  # frames of the eased run kept after the get-up's cut


def leg(seg):
    return (seg["lfemur"][1] - seg["lfemur"][0]).length + (seg["ltibia"][1] - seg["ltibia"][0]).length


def lowest(seg):
    return min(min(s.z, e.z) for s, e in seg.values())


def main():
    frames, labels = stick.build()
    cut = labels[3][0]
    frames = frames[: cut + RUN_TAIL]
    lib.reset(720, 720, fps=30)
    bpy.ops.import_scene.gltf(filepath=SRC)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = next(o for o in bpy.data.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers))
    keep = {a.name for a in bpy.data.actions}
    arm.animation_data_create()
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.context.view_layer.update()
    rig = retarget.Rig(arm)
    s = rig.leg_world / (sum(leg(f) for f in frames) / len(frames))
    c0, _, _ = retarget.pelvis(frames[0])
    origin = Vector((c0.x, c0.y, 0))

    def place(seg, dz=0.0):
        c, up, right = retarget.pelvis(seg)
        p = (c - origin) * s
        rig.pose(retarget.mocap_dirs(seg), (up, right), p + Vector((0, 0, dz)))

    def mesh_min():
        bpy.context.view_layer.update()
        dg = bpy.context.evaluated_depsgraph_get()
        ev = body.evaluated_get(dg)
        me = ev.to_mesh()
        co = np.empty(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co)
        m = np.array(ev.matrix_world)
        z = float((co.reshape(-1, 3) @ m[2, :3] + m[2, 3]).min())
        ev.to_mesh_clear()
        return z

    # neutral back, calibrated as in pod_exit.py: the trunk pitch that stands the first (standing) frame upright
    def lean(pitch):
        rig.trunk_pitch = pitch
        place(frames[0])
        bpy.context.view_layer.update()
        pbs, mw = arm.pose.bones, arm.matrix_world
        hip, neck = mw @ pbs[retarget.P + "Hips"].head, mw @ pbs[retarget.P + "Neck"].head
        _, up, right = retarget.pelvis(frames[0])
        fwd = up.cross(right).normalized()
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
    print(f"trunk pitch {math.degrees(rig.trunk_pitch):.1f} deg; scale {s:.3f}; {len(frames)} frames, cut at {cut}")

    # ground lock: the body's lowest point sits where the stick figure's did (the strike's lift stays in the air)
    dzs = []
    for seg in frames:
        place(seg)
        dzs.append(lowest(seg) * s - mesh_min())
    # smooth the lock so contacts do not jitter (a short moving average)
    sm = [sum(dzs[max(0, i - 2): i + 3]) / len(dzs[max(0, i - 2): i + 3]) for i in range(len(dzs))]

    if "--check" in args:
        sc = bpy.context.scene
        sc.render.engine = "BLENDER_WORKBENCH"
        lib.sky(horizon="#d9d9d9", zenith="#bfbfbf", haze=0)
        bpy.ops.mesh.primitive_plane_add(size=40)
        for view, at in (("side", (0.6, -6.0, 1.0)), ("front", (5.5, -2.0, 1.2))):
            lib.camera(at, (0.6, 0, 0.5), lens=35, name=view)
            for f in (0, 6, 20, 35, 50, 70, 100, cut - 1, len(frames) - 1):
                place(frames[f], sm[f])
                lib.render_still(os.path.join(lib.OUT, f"vale_bake_{view}_{f:03d}.png"))
        return

    for f, seg in enumerate(frames):
        place(seg, sm[f])
        for pb in arm.pose.bones:
            if pb.name.startswith(retarget.P) and pb.name.replace(retarget.P, "") in ["Hips"] + [c[0] for c in retarget.CHAIN]:
                pb.keyframe_insert("rotation_quaternion", frame=f)
                if pb.name == retarget.P + "Hips":
                    pb.keyframe_insert("location", frame=f)
    act = arm.animation_data.action
    act.name = ACTION
    act.use_fake_user = True
    for a in bpy.data.actions:
        if a.name in keep: a.use_fake_user = True
    arm.animation_data.action = None
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB", use_selection=True, export_animation_mode="ACTIONS", export_yup=True)
    print(f"wrote {DST}: {ACTION} {len(frames)} frames ({len(frames) / 30:.2f} s), cut at frame {cut} ({cut / 30:.2f} s)")


main()
