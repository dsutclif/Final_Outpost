# Right-foot checks on a kneel_lift blend: bone angles per frame, foot-mesh crush ratio and self-intersection count.
# blender -b FILE.blend -P foot_check.py -- [--all] [--json OUT]
import bpy, math, sys, json, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
a = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
sc = bpy.context.scene
arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
mesh = next(o for o in bpy.data.objects if o.type == "MESH" and o.parent == arm or (o.type == "MESH" and o.modifiers and any(m.type == "ARMATURE" for m in o.modifiers)))
PB = lambda n: arm.pose.bones["mixamorig:" + n]
P = lambda n, tail=False: arm.matrix_world @ (PB(n).tail if tail else PB(n).head)
vg = {g.index: g.name for g in mesh.vertex_groups}
FOOT = {"mixamorig:RightFoot", "mixamorig:RightToeBase", "mixamorig:RightToe_End"}
sel = [v.index for v in mesh.data.vertices if sum(g.weight for g in v.groups if vg[g.group] in FOOT) > 0.5]
selset = set(sel)
def pitch(v):  # degrees above the sand plane; direction measured toward the back (+Y) so 0 = pointing back, positive = up
    return math.degrees(math.atan2(v.z, v.y))
res = {}
frames = range(1, 97) if "--all" in a else (1, 24, 30, 34, 38, 40, 42, 46, 50, 64, 80, 96)
base_ext = None
for f in frames:
    sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get(); ev = mesh.evaluated_get(dg); me = ev.to_mesh()
    knee, ank, ball, tip = P("RightLeg"), P("RightFoot"), P("RightToeBase"), P("RightToeBase", True)
    shin, foot, toe = ank - knee, ball - ank, tip - ball
    ang = lambda u, v: math.degrees(math.acos(max(-1, min(1, u.normalized().dot(v.normalized())))))
    pts = [ev.matrix_world @ me.vertices[i].co for i in sel]
    # crush: extent of the foot-weighted vertices along the foot bone axis and across it
    axis = (ball - ank).normalized() if (ball - ank).length > 1e-6 else Vector((0, 1, 0))
    along = [(p - ank).dot(axis) for p in pts]; side = Vector((1, 0, 0)); across = [(p - ank).dot(side) for p in pts]
    ext = (max(along) - min(along), max(across) - min(across))
    if base_ext is None: base_ext = ext
    # self-intersection among foot-region faces (faces whose vertices are all foot-weighted or within 0.12 m of the ankle)
    bm = bmesh.new(); bm.from_mesh(me); bm.transform(ev.matrix_world); bm.verts.ensure_lookup_table(); bm.faces.ensure_lookup_table()
    near = {v.index for v in bm.verts if (v.co - ank).length < 0.14}
    faces = [fc for fc in bm.faces if all(v.index in near for v in fc.verts)]
    bvh = BVHTree.FromPolygons([tuple(v.co for v in fc.verts) and [vv.index for vv in fc.verts] for fc in faces] and [v.co[:] for v in bm.verts], [[v.index for v in fc.verts] for fc in faces], epsilon=0.0)
    hits = 0
    for i, j in bvh.overlap(bvh):
        if i < j and not (set(v.index for v in faces[i].verts) & set(v.index for v in faces[j].verts)): hits += 1
    bm.free()
    uleg = P("RightUpLeg"); kneeang = ang(uleg - knee, ank - knee)
    res[f] = dict(knee_angle=round(kneeang, 1), ankle_bend_deg=round(180 - ang(-shin, foot), 1), foot_pitch=round(pitch(foot), 1), toe_pitch=round(pitch(toe), 1),
                  toe_vs_foot_bend=round(ang(foot, toe), 1), ankle_z=round(ank.z, 3), ball_z=round(ball.z, 3), tip_z=round(tip.z, 3), knee_z=round(knee.z, 3),
                  foot_len=round(foot.length, 3), toe_len=round(toe.length, 3), crush_along=round(ext[0] / base_ext[0], 2), crush_across=round(ext[1] / base_ext[1], 2), self_hits=hits,
                  minz=round(min(p.z for p in pts), 4), ankle=[round(x, 3) for x in ank], ball=[round(x, 3) for x in ball])
for f, r in res.items(): print("FC", f, r)
if "--json" in a: json.dump(res, open(a[a.index("--json") + 1], "w"))
