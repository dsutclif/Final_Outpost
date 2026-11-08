# BACKLOG #6 follow-up (Doug, 2026-11-08): Vale's warlord suit was auto-rigged without a head, so its Head bone sits
# at the collar tipped about 50 degrees back, and Vale's head (which rides that bone) looked up at the sky and sank
# into the suit. This stands the Head bone upright like the old warlord's (Raider boss - Animated.glb: Head to
# HeadTop_End points up, a few degrees forward, local z facing forward) and rewrites every clip's Head keys so each
# clip's head motion is kept in the parent's frame, at half strength (the head follows the chest, with a little nod).
#
# blender -b --factory-startup -P tools/cinematics/vale_rig_fix.py
#   reads  ../Asset workflow/3D Models/Warlord_headless_Vale_Animated.glb
#   writes ../Asset workflow/3D Models/Warlord_headless_Vale_Animated_rig.glb (vale_fall_bake.py reads this one)
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Quaternion, Vector
import lib

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.normpath(os.path.join(HERE, "..", "..", "..", "Asset workflow", "3D Models"))
SRC = os.path.join(MODELS, "Warlord_headless_Vale_Animated.glb")
DST = os.path.join(MODELS, "Warlord_headless_Vale_Animated_rig.glb")
P = "mixamorig:"
HEAD_DIR = Vector((0.0, -0.024, 0.206)).normalized()  # the old warlord's Head bone (Blender: -y is forward)
HEAD_LEN = 0.2
NOD = 0.5  # share of each clip's head turn kept


def rest_rel(arm, name):
    b = arm.data.bones[name]
    m = b.matrix_local if b.parent is None else b.parent.matrix_local.inverted() @ b.matrix_local
    return m.to_quaternion(), m.to_3x3()


def channelbag(act):
    from bpy_extras import anim_utils
    return anim_utils.action_get_channelbag_for_slot(act, act.slots[0])


def main():
    lib.reset(720, 720, fps=30)
    bpy.ops.import_scene.gltf(filepath=SRC)
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    body = next(o for o in bpy.data.objects if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers))
    head = P + "Head"
    r_old, m_old = rest_rel(arm, head)
    # every clip's Head keys, as parent-frame turns (and offsets) on top of the rest
    saved = {}
    for act in bpy.data.actions:
        cb = channelbag(act)
        rq = [cb.fcurves.find(f'pose.bones["{head}"].rotation_quaternion', index=i) for i in range(4)]
        lc = [cb.fcurves.find(f'pose.bones["{head}"].location', index=i) for i in range(3)]
        if rq[0] is None:
            continue
        times = [k.co[0] for k in rq[0].keyframe_points]
        keys = []
        for t in times:
            d = Quaternion([fc.evaluate(t) for fc in rq])
            loc = Vector([fc.evaluate(t) if fc else 0.0 for fc in lc])
            keys.append((t, r_old @ d @ r_old.inverted(), m_old @ loc))
        saved[act.name] = keys
    # stand the bone up (edit bones are in armature space; the mesh keeps its shape, the bind is redone on export)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    eb = arm.data.edit_bones
    hb = eb[head]
    print("old head", tuple(round(v, 3) for v in hb.head), "tail", tuple(round(v, 3) for v in hb.tail))
    hb.tail = hb.head + HEAD_DIR * HEAD_LEN
    hb.align_roll(Vector((0, -1, 0)))  # local z forward
    top = eb.get(P + "HeadTop_End")
    if top:
        top.head = hb.tail
        top.tail = hb.tail + HEAD_DIR * HEAD_LEN
        top.align_roll(Vector((0, -1, 0)))
    front = eb.get("headfront")
    if front:
        # the face direction marker: in front of the head's middle
        mid = hb.head + HEAD_DIR * HEAD_LEN * 0.5
        front.head = mid + Vector((0, -0.12, 0))
        front.tail = front.head + Vector((0, -0.05, 0))
    print("new head", tuple(round(v, 3) for v in hb.head), "tail", tuple(round(v, 3) for v in hb.tail))
    bpy.ops.object.mode_set(mode="OBJECT")
    r_new, m_new = rest_rel(arm, head)
    ident = Quaternion()
    for act in bpy.data.actions:
        keys = saved.get(act.name)
        if not keys:
            continue
        cb = channelbag(act)
        rq = [cb.fcurves.find(f'pose.bones["{head}"].rotation_quaternion', index=i) for i in range(4)]
        lc = [cb.fcurves.find(f'pose.bones["{head}"].location', index=i) for i in range(3)]
        prev = None
        for j, (t, dp, off) in enumerate(keys):
            d = r_new.inverted() @ ident.slerp(dp, NOD) @ r_new
            if prev is not None and prev.dot(d) < 0:
                d.negate()
            prev = d
            loc = m_new.inverted() @ off
            for i in range(4):
                rq[i].keyframe_points[j].co[1] = d[i]
                rq[i].keyframe_points[j].handle_left_type = rq[i].keyframe_points[j].handle_right_type = "AUTO_CLAMPED"
            for i in range(3):
                if lc[i]:
                    lc[i].keyframe_points[j].co[1] = loc[i]
        for fc in rq + [x for x in lc if x]:
            fc.update()
        act.use_fake_user = True
        print(f"{act.name}: {len(keys)} head keys rewritten")
    if arm.animation_data:
        arm.animation_data.action = None
    for pb in arm.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    body.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.export_scene.gltf(filepath=DST, export_format="GLB", use_selection=True, export_animation_mode="ACTIONS", export_yup=True)
    print("wrote", DST)


main()
