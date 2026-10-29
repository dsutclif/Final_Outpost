# Retarget CMU motion (mocap.py) onto a Mixamo-rigged game character (the commander), frame by frame.
#
# Each mapped Mixamo bone is swung so its head-to-child segment points along the matching CMU bone
# (aim-only: the twist follows the parent), parent first; the hips take their full orientation from
# the CMU pelvis (up = lower back, right = left hip to right hip) and their position from the CMU
# pelvis, scaled by leg length. The result is keyed as each bone's local rotation and the hips'
# location, so the game rig plays it like any clip.
from mathutils import Matrix, Quaternion, Vector

# Mixamo bone -> (CMU bones whose start..end gives the direction, Mixamo bone whose head ends the segment)
CHAIN = [
    ("Spine", ("lowerback",), "Spine1"),
    ("Spine1", ("upperback",), "Spine2"),
    ("Spine2", ("thorax",), "Neck"),
    ("Neck", ("lowerneck", "upperneck"), "Head"),
    ("Head", ("head",), "HeadTop_End"),
    ("LeftShoulder", ("lclavicle",), "LeftArm"),
    ("LeftArm", ("lhumerus",), "LeftForeArm"),
    ("LeftForeArm", ("lradius",), "LeftHand"),
    ("LeftHand", ("lwrist", "lhand"), None),
    ("RightShoulder", ("rclavicle",), "RightArm"),
    ("RightArm", ("rhumerus",), "RightForeArm"),
    ("RightForeArm", ("rradius",), "RightHand"),
    ("RightHand", ("rwrist", "rhand"), None),
    ("LeftUpLeg", ("lfemur",), "LeftLeg"),
    ("LeftLeg", ("ltibia",), "LeftFoot"),
    ("LeftFoot", ("lfoot",), "LeftToeBase"),
    ("LeftToeBase", ("ltoes",), "LeftToe_End"),
    ("RightUpLeg", ("rfemur",), "RightLeg"),
    ("RightLeg", ("rtibia",), "RightFoot"),
    ("RightFoot", ("rfoot",), "RightToeBase"),
    ("RightToeBase", ("rtoes",), "RightToe_End"),
]
P = "mixamorig:"


def seg_dir(seg, names):
    return (seg[names[-1]][1] - seg[names[0]][0])


def pelvis(seg):
    """CMU pelvis centre, up and right (world, Blender frame)."""
    lh, rh = seg["lfemur"][0], seg["rfemur"][0]
    return (lh + rh) / 2, seg_dir(seg, ("lowerback",)).normalized(), (rh - lh).normalized()


def frame3(up, right):
    x = (right - up * right.dot(up)).normalized()
    return Matrix((x, up, x.cross(up))).transposed()


class Rig:
    def __init__(self, arm):
        self.arm = arm
        self.A = arm.matrix_world.copy()
        self.Ai = self.A.inverted()
        self.Ai3 = self.Ai.to_3x3().normalized()
        b = arm.data.bones
        self.rest = {n.name: n.matrix_local.copy() for n in b}  # armature space
        head = lambda n: b[P + n].head_local.copy()
        self.vrest = {}
        for name, _, child in CHAIN:
            bn = b[P + name]
            v = (head(child) - bn.head_local) if child else (bn.tail_local - bn.head_local)
            self.vrest[name] = bn.matrix_local.to_3x3().inverted() @ v  # in the bone's own rest frame
        self.hip_mid_rest = (head("LeftUpLeg") + head("RightUpLeg")) / 2
        self.hips_rest = b[P + "Hips"].matrix_local.copy()
        self.up_rest = (head("Spine1") - b[P + "Spine"].head_local).normalized()
        self.right_rest = (head("RightUpLeg") - head("LeftUpLeg")).normalized()
        world = lambda v: self.A @ v
        self.leg_world = (world(head("LeftUpLeg")) - world(head("LeftFoot"))).length

    def pose(self, dirs, hip_frame, hip_pos_world, key_frame=None):
        """dirs: Mixamo bone -> world direction; hip_frame: (up, right) world; hip_pos_world: the
        point between the thighs (world). Sets every mapped bone and keys it at key_frame."""
        arm, pb = self.arm, self.arm.pose.bones
        up, right = (self.Ai3 @ hip_frame[0]).normalized(), (self.Ai3 @ hip_frame[1]).normalized()
        R = frame3(up, right) @ frame3(self.up_rest, self.right_rest).transposed()
        mid = self.Ai @ hip_pos_world
        hips_head = mid + R @ (self.hips_rest.translation - self.hip_mid_rest)
        want = {}
        want["Hips"] = Matrix.Translation(hips_head) @ (R @ self.hips_rest.to_3x3()).to_4x4()
        order = ["Hips"] + [c[0] for c in CHAIN]
        parent = {c[0]: pb[P + c[0]].parent.name.replace(P, "") for c in CHAIN}
        for name in order[1:]:
            par = parent[name]
            Mp = want.get(par)
            if Mp is None:  # parent not driven: rigidly follows its own parent
                Mp = self._inherit(par, want, parent)
                want[par] = Mp
            Minh = Mp @ self.rest[P + par].inverted() @ self.rest[P + name]
            R_inh = Minh.to_3x3().normalized()
            v_cur = R_inh @ self.vrest[name]
            tgt = (self.Ai3 @ dirs[name]).normalized() if name in dirs else v_cur.normalized()
            q = v_cur.normalized().rotation_difference(tgt).to_matrix()
            want[name] = Matrix.Translation(Minh.translation) @ (q @ R_inh).to_4x4()
        for name in order:
            b = pb[P + name]
            par = b.parent
            if par is None:
                basis = b.bone.convert_local_to_pose(want[name], b.bone.matrix_local, invert=True)
            else:
                pm = want[par.name.replace(P, "")]
                basis = b.bone.convert_local_to_pose(want[name], b.bone.matrix_local, parent_matrix=pm, parent_matrix_local=par.bone.matrix_local, invert=True)
            loc, rot, _ = basis.decompose()
            b.rotation_mode = "QUATERNION"
            b.rotation_quaternion = rot
            if name == "Hips":
                b.location = loc
            if key_frame is not None:
                b.keyframe_insert("rotation_quaternion", frame=key_frame)
                if name == "Hips":
                    b.keyframe_insert("location", frame=key_frame)

    def _inherit(self, name, want, parent):
        return want["Hips"]  # every chain bone's parent is driven or the hips


def mocap_dirs(seg):
    """Mixamo bone -> world direction from one CMU pose."""
    return {name: seg_dir(seg, src) for name, src, _ in CHAIN}
