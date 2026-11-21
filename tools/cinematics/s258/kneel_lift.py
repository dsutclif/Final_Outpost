# Commander kneel-and-lift clip (outpost-ops#258): stand, step, drop to one knee, take the lieutenant helmet
# in both hands, lift it to the chest. 96 frames at 30 fps. Design step: not wired into the game.
# blender -b --factory-startup -P tools/cinematics/s258/kneel_lift.py -- [--out DIR]
import json, math, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import bpy, lib
from mathutils import Vector, Matrix, Euler

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[args.index("--out") + 1] if "--out" in args else os.path.join(lib.OUT, "s258")
os.makedirs(OUT, exist_ok=True)
ENV = lambda k, d: float(os.environ.get(k, d))
F0, F1 = 1, 96
sc = lib.reset(540, 960)
sc.frame_start, sc.frame_end = F0, F1

cmd = lib.place("unit.player", at=(0, 0, 0), yaw=0, height=1.8, name="commander", rigged=True)
lib.still(cmd)
arm = bpy.data.objects[cmd["armature"]]
bpy.context.view_layer.update()
RS = cmd.scale[0]
Xa = Vector((1, 0, 0))
PB = lambda n: arm.pose.bones["mixamorig:" + n]
W = lambda n: arm.matrix_world @ PB(n).head
REST = {n: W(n).copy() for n in ["Hips", "LeftHand", "RightHand", "LeftFoot", "RightFoot", "Spine2"]}
REST_M = {n: (arm.matrix_world @ PB(n).matrix).copy() for n in ["LeftFoot", "RightFoot"]}

# --- helmet in an anchor empty (its centre); the hands hold the anchor's sides
helmet = lib.place("item.lieutenant_helmet", at=(0, 0, 0), size=0.42, name="helmet")
bpy.context.view_layer.update()
HELM_H = 0.413 * (0.42 / 0.447)
anchor = bpy.data.objects.new("anchor", None); sc.collection.objects.link(anchor)
anchor.rotation_mode = "XYZ"
helmet.parent = anchor
helmet.location = (0, 0, -HELM_H / 2)
helmet.rotation_euler = (0, 0, 0)

def empty(name, size=0.05):
    e = bpy.data.objects.new(name, None); e.empty_display_size = size; sc.collection.objects.link(e); e.rotation_mode = "XYZ"; return e
tgt = {k: empty("t_" + k) for k in ["LH", "RH", "LF", "RF"]}
pole = {k: empty("p_" + k) for k in ["LE", "RE", "LK", "RK"]}
def ik(bone, target, pol, chain, tail, rot=False, angle=0.0):
    c = PB(bone).constraints.new("IK"); c.target = target; c.pole_target = pol
    c.chain_count = chain; c.use_tail = tail; c.use_rotation = rot; c.pole_angle = math.radians(angle); return c
PA = {"LE": -90, "RE": -90, "LK": -90, "RK": -90}
if os.environ.get("POLE"): PA.update(json.loads(os.environ["POLE"]))
ik("LeftForeArm", tgt["LH"], pole["LE"], 2, True, False, PA["LE"])
ik("RightForeArm", tgt["RH"], pole["RE"], 2, True, False, PA["RE"])
ik("LeftFoot", tgt["LF"], pole["LK"], 2, False, False, PA["LK"])
ik("RightFoot", tgt["RF"], pole["RK"], 2, False, False, PA["RK"])
for n, t in (("LeftFoot", "LF"), ("RightFoot", "RF")):
    c = PB(n).constraints.new("COPY_ROTATION"); c.target = tgt[t]; c.target_space = "WORLD"; c.owner_space = "WORLD"
if os.environ.get("NOROT"):
    for n in ("LeftFoot","RightFoot"):
        for c in PB(n).constraints: c.use_rotation = False
if os.environ.get("NOPOLE"):
    for n in ("LeftFoot","RightFoot","LeftForeArm","RightForeArm"):
        for c in PB(n).constraints: c.pole_target = None
dtr = {k: empty("d_" + k) for k in ["L", "R"]}
for n, k in (("LeftHand", "L"), ("RightHand", "R")):
    c = PB(n).constraints.new("DAMPED_TRACK"); c.target = dtr[k]; c.track_axis = "TRACK_Y"
pole["LE"].location = (1.0, 0.5, 0.6); pole["RE"].location = (-1.0, 0.5, 0.6)
pole["LK"].location = (0.30, -1.2, 0.6); pole["RK"].location = (-0.08, -1.2, 0.25)

smooth = lambda t: t * t * (3 - 2 * t)
V = Vector
def interp(table, f):
    ks = sorted(table)
    if f <= ks[0]: return table[ks[0]]
    if f >= ks[-1]: return table[ks[-1]]
    for a, b in zip(ks, ks[1:]):
        if a <= f <= b:
            t = smooth((f - a) / (b - a)); va, vb = table[a], table[b]
            return va + (vb - va) * t

GZ = 0.0208   # the rest pose stands 2.1 cm above the sand (measured, frame 1): lower every standing/planted key by it
KUP = 0.015   # and lift the kneeling right leg 1.5 cm so the knee clears the sand
HY, HZ = ENV("HY", 0.0), ENV("HZ", 0.535) + KUP
DZ = V((0, 0, GZ))
HIPS = {1: REST["Hips"] - DZ, 10: REST["Hips"] - DZ, 22: V((0.03, 0.04, ENV("H22", 0.92) - GZ)), 31: V((0.03, 0.08, ENV("H32", 0.84) - GZ)), 46: V((0.02, HY, HZ)), 96: V((0.02, HY, HZ))}
LFOOT = {1: REST["LeftFoot"] - DZ, 10: REST["LeftFoot"] - DZ, 16: V((0.22, -0.02, 0.30)), 22: V((0.30, -0.11, 0.159 - GZ)), 96: V((0.30, -0.11, 0.159 - GZ))}
RA_Y = ENV("RAY", 0.36)
TLAND = int(ENV("TLAND", 31))   # v3: the boot is down (toe planted) by here, before the knee passes 90 deg
RFOOT = {1: REST["RightFoot"] - DZ, 22: REST["RightFoot"] - DZ, (22 + TLAND) // 2: V((-0.10, ENV("MY", 0.34), ENV("MZ", 0.20))), TLAND - 2: V((-0.08, ENV("HVY", 0.36), ENV("HVZ", 0.30))), TLAND: V((-0.075, RA_Y, ENV("RAZ", 0.193) + KUP)), 96: V((-0.075, RA_Y, ENV("RAZ", 0.193) + KUP))}
# v2: the kneeling foot is plantar-flexed about the world X axis (no 180 yaw: that twisted the shin into the boot and folded the mesh)
RFSPIN = {1: 0.0, 22: 0.0, TLAND - 6: 0.0, TLAND: ENV("ROTA", 103.0), 96: ENV("ROTA", 103.0)}
TOEFLAT = {1: 0.0, 22: 0.0, TLAND - 6: 0.0, TLAND: ENV("TOEA", 15.0), 96: ENV("TOEA", 15.0)}
# v4 (outpost-ops#280): a shallower lean (peak 55 -> LEANK of that) and a settle to rest at the end (zero speed at frame 96)
LK = ENV("LEANK", 0.72)
LEAN = {1: 0.0, 14: 0.0, 30: 12.0, 46: 40.0 * LK, 56: 55.0 * LK, 64: 55.0 * LK, 76: 26.0, 88: 6.0, 96: 2.0}
PITCH = {1: 0.0, 14: 0.0, 30: 8.0, 46: 25.0 * LK, 56: 36.0 * LK, 64: 36.0 * LK, 76: 12.0, 88: 3.0, 96: 1.0}
HEADTILT = {1: 0.0, 46: -10.0, 64: -14.0, 84: 4.0, 96: 2.0}
SIGN = ENV("SIGN", 1.0)

A_GROUND = V((0.0, ENV("AGY", -0.42), HELM_H / 2))
A_END = V((0.02, ENV("AEY", -0.26), ENV("AEZ", 0.72)))
G_EUL, E_EUL = V((0.0, 0.0, 18.0)), V((-35.0, 0.0, 18.0))   # neck opening toward the viewer (-Y), tipped up at the end
def anchor_state(f):
    t = 0.0 if f <= 64 else smooth(min(1.0, (f - 64) / 28.0))
    return A_GROUND.lerp(A_END, t) + V((0, 0, 0.12 * math.sin(math.pi * t))), G_EUL.lerp(E_EUL, t)
def anchor_mat(f):
    p, e = anchor_state(f)
    return Matrix.Translation(p) @ Euler([math.radians(x) for x in e], "XYZ").to_matrix().to_4x4()
HOFF = 0.20
def hand_world(side, f):
    sgn = 1 if side == "L" else -1   # helmet yaw 18 (as in helmet_reveal): its local +X is about world +X
    rest = REST["LeftHand" if side == "L" else "RightHand"]
    grasp = lambda ff: anchor_mat(ff) @ V((sgn * HOFF, 0.06, 0.03))
    if f >= 64: return grasp(f)
    hover = lambda ff: anchor_mat(ff) @ V((sgn * 0.23, 0.10, 0.16))
    tab = {1: rest, 20: rest + V((0, 0.05, -0.2)), 36: V((sgn * 0.25, 0.10, 0.50)), 46: hover(46), 54: hover(54).lerp(grasp(54), 0.5), 64: grasp(64)}
    return interp(tab, f)

def rest_axis(bname, axis_w):
    b = arm.data.bones["mixamorig:" + bname]
    r = arm.matrix_world.to_3x3().normalized() @ b.matrix_local.to_3x3()
    return r.inverted() @ axis_w
def rot_world_axis(bname, axis_w, deg, f):
    pb = PB(bname)
    a = rest_axis(bname, axis_w).normalized()
    pb.rotation_mode = "AXIS_ANGLE"; pb.rotation_axis_angle = (math.radians(deg), a.x, a.y, a.z)
    pb.keyframe_insert("rotation_axis_angle", frame=f)
def set_hips(H, f):
    pb = PB("Hips")
    b = arm.data.bones["mixamorig:Hips"]
    r = arm.matrix_world.to_3x3().normalized() @ b.matrix_local.to_3x3()
    pb.location = (r.inverted() @ (H - REST["Hips"])) / RS
    pb.keyframe_insert("location", frame=f)
def key_t(e, loc, rotm, f):
    e.location = loc; e.rotation_euler = rotm.to_euler("XYZ")
    e.keyframe_insert("location", frame=f); e.keyframe_insert("rotation_euler", frame=f)
Rz = lambda deg: Matrix.Rotation(math.radians(deg), 3, "Z")
for f in range(F0, F1 + 1):
    set_hips(interp(HIPS, f), f)
    lean = interp(LEAN, float(f)) * SIGN
    rot_world_axis("Hips", Xa, interp(PITCH, float(f)) * SIGN, f)
    for n, k in (("Spine", 0.3), ("Spine1", 0.35), ("Spine2", 0.35)):
        rot_world_axis(n, Xa, lean * k, f)
    rot_world_axis("Head", Xa, interp(HEADTILT, float(f)) * SIGN, f)
    # v4: the fingers curl round the helmet rim as the hands reach it (frame 46 -> 64) and stay curled
    cu = smooth(min(1.0, max(0.0, (f - 46) / 18.0))) * ENV("CURL", 1.0)
    for side in ("Left", "Right"):
        for fn, (a1, a2, a3) in (("Index", (35, 55, 35)), ("Middle", (40, 60, 40)), ("Ring", (45, 65, 40)), ("Pinky", (50, 65, 40)), ("Thumb", (10, 25, 20))):
            for i, a in enumerate((a1, a2, a3), 1):
                pb = PB(f"{side}Hand{fn}{i}"); pb.rotation_mode = "XYZ"
                pb.rotation_euler = (math.radians(a * cu * ENV("CSIGN", 1.0)), 0, 0)
                pb.keyframe_insert("rotation_euler", frame=f)
    rot_world_axis("RightToeBase", Xa, interp(TOEFLAT, float(f)), f)
    key_t(tgt["LF"], interp(LFOOT, f), REST_M["LeftFoot"].to_3x3(), f)
    key_t(tgt["RF"], interp(RFOOT, f), Matrix.Rotation(math.radians(interp(RFSPIN, float(f))), 3, "X") @ REST_M["RightFoot"].to_3x3(), f)
    for s in "LR":
        key_t(tgt[s + "H"], hand_world(s, f), Matrix.Identity(3), f)
    for sd, sg in (("L", 1), ("R", -1)):
        dtr[sd].location = anchor_mat(f) @ V((sg * 0.13, -0.02, 0.0)); dtr[sd].keyframe_insert("location", frame=f)
    p, e = anchor_state(f)
    anchor.location = p; anchor.rotation_euler = [math.radians(x) for x in e]
    anchor.keyframe_insert("location", frame=f); anchor.keyframe_insert("rotation_euler", frame=f)
for o in [arm, anchor] + list(tgt.values()):
    if o.animation_data and o.animation_data.action:
        for fc in lib.fcurves(o):
            for kp in fc.keyframe_points: kp.interpolation = "LINEAR"
bpy.context.view_layer.update()

mesh = bpy.data.objects[cmd["meshes"][0]]
HM = [bpy.data.objects[n] for n in helmet["meshes"]]
rep = {"frames": {}}
for f in range(F0, F1 + 1):
    sc.frame_set(f)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = mesh.evaluated_get(dg)
    zs = [(ev.matrix_world @ v.co).z for v in ev.to_mesh().vertices]
    hvw = [hm.matrix_world @ v.co for hm in HM for v in hm.data.vertices]
    dmin = lambda bn: min((arm.matrix_world @ b.head - q).length for b in arm.pose.bones if b.name.startswith("mixamorig:" + bn) for q in hvw)
    lowi = min(range(len(zs)), key=lambda i: zs[i]); lowp = ev.matrix_world @ ev.to_mesh().vertices[lowi].co
    fwd = arm.matrix_world @ arm.pose.bones["headfront"].head - W("Head"); fwd.z = 0
    r3 = lambda v: [round(x, 3) for x in v]
    rep["frames"][f] = dict(
        minz=round(min(zs), 4), lowpos=[round(x, 3) for x in lowp], knee_R_z=round(W("RightLeg").z, 3), knee_L_z=round(W("LeftLeg").z, 3),
        kneeR=r3(W("RightLeg")), kneeL=r3(W("LeftLeg")), footL=r3(W("LeftFoot")), footR=r3(W("RightFoot")),
        toeR_z=round((arm.matrix_world @ PB("RightToeBase").head).z, 3), toeL_z=round((arm.matrix_world @ PB("LeftToeBase").head).z, 3),
        head=r3(W("Head")), hips=r3(W("Hips")), spine2=r3(W("Spine2")),
        heading=round(math.degrees(math.atan2(fwd.x, -fwd.y)), 1),
        shoulder_yaw=round(math.degrees(math.atan2((W("LeftArm") - W("RightArm")).y, (W("LeftArm") - W("RightArm")).x)), 1),
        hip_yaw=round(math.degrees(math.atan2((W("LeftUpLeg") - W("RightUpLeg")).y, (W("LeftUpLeg") - W("RightUpLeg")).x)), 1),
        handL_gap=round(dmin("LeftHand"), 3), handR_gap=round(dmin("RightHand"), 3),
        elbowL=r3(W("LeftForeArm")), elbowR=r3(W("RightForeArm")), helm=r3(anchor.matrix_world.translation),
        hand_to_tgtL=round((W("LeftHand") - tgt["LH"].matrix_world.translation).length, 3),
        hand_to_tgtR=round((W("RightHand") - tgt["RH"].matrix_world.translation).length, 3))
json.dump(rep, open(os.path.join(OUT, "measure.json"), "w"))
for f in (1, 22, 30, 46, 58, 70, 84, 96):
    r = rep["frames"][f]
    print(f, {k: r[k] for k in ("minz", "lowpos", "knee_R_z", "knee_L_z", "toeR_z", "heading", "handL_gap", "handR_gap", "hand_to_tgtL", "hand_to_tgtR", "head", "spine2", "kneeL", "kneeR", "elbowL", "elbowR")})
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "kneel_lift.blend"))
if os.environ.get("MUTE"):
    for n in os.environ["MUTE"].split(","):
        for c in PB(n).constraints: c.mute = True
    sc.frame_set(int(os.environ.get("FR", 1)))
    print("DBG2", os.environ["MUTE"], "hips", [round(x,3) for x in W("Hips")], "sp", [round(x,3) for x in W("Spine")], "sp2", [round(x,3) for x in W("Spine2")], "head", [round(x,3) for x in W("Head")], "footL", [round(x,3) for x in W("LeftFoot")], "handL", [round(x,3) for x in W("LeftHand")], "fa", [round(x,3) for x in W("LeftForeArm")])
if os.environ.get("DBG"):
    for c in [c for n in ("LeftForeArm","RightForeArm","LeftFoot","RightFoot") for c in PB(n).constraints]:
        c.mute = bool(int(os.environ["DBG"]))
    sc.frame_set(1)
    print("DBG hips", [round(x,3) for x in W("Hips")], "rest", [round(x,3) for x in REST["Hips"]], "head", [round(x,3) for x in W("Head")], "kneeL", [round(x,3) for x in W("LeftLeg")], "footL", [round(x,3) for x in W("LeftFoot")], "locHips", tuple(PB("Hips").location), "RS", RS)
if os.environ.get("ARMDBG"):
    for fr in (46, 58):
        sc.frame_set(fr)
        r3 = lambda v: [round(x, 3) for x in v]
        print("ARM", fr, "tgtL", r3(tgt["LH"].matrix_world.translation), "wristL", r3(W("LeftHand")), "shL", r3(W("LeftArm")), "elbL", r3(W("LeftForeArm")),
              "len", round((W("LeftForeArm") - W("LeftArm")).length, 3), round((W("LeftHand") - W("LeftForeArm")).length, 3), "dist", round((tgt["LH"].matrix_world.translation - W("LeftArm")).length, 3))
