# CMU motion capture (ASF skeleton + AMC motion) for the cinematics: reads the files from
# tools/cinematics/mocap/ (gitignored; downloaded from mocap.cs.cmu.edu) and gives world-space joint
# positions and bone rotations per frame, in Blender's frame (metres, Z up).
#
# ASF/AMC conventions: each bone has a rest direction and length in the global frame and an `axis`
# (euler XYZ, degrees) that orients its local frame; an AMC frame gives each bone's rotation (its dofs,
# degrees) in that local frame. Bone k's global rotation is G_parent * C * M * C^-1, and its end is its
# start plus that rotation applied to direction * length. Lengths are in units of 1/`length` inches.
import math, os
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(HERE, "mocap")
# CMU (Y up, Z toward the viewer) -> Blender (Z up, Y away)
TO_BLENDER = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def _euler(order_axes, degs):
    """Rotation matrix for rotations applied in the given axis order (e.g. 'XYZ' -> Rz*Ry*Rx)."""
    m = Matrix.Identity(3)
    for ax, d in zip(order_axes, degs):
        m = Matrix.Rotation(math.radians(d), 3, ax) @ m
    return m


class Skeleton:
    def __init__(self, asf_path):
        self.bones = {}
        self.children = {"root": []}
        self.root_order = ["TX", "TY", "TZ", "RX", "RY", "RZ"]
        self.unit = 1.0
        section, cur = None, None
        for raw in open(asf_path):
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith(":"):
                section = line.split()[0]
                if section == ":units":
                    pass
                continue
            toks = line.split()
            if section == ":units" and toks[0] == "length":
                self.unit = float(toks[1])
            elif section == ":root" and toks[0] == "order":
                self.root_order = [t.upper() for t in toks[1:]]
            elif section == ":bonedata":
                if toks[0] == "begin":
                    cur = {"dof": []}
                elif toks[0] == "end":
                    self.bones[cur["name"]] = cur
                    cur = None
                elif toks[0] == "name":
                    cur["name"] = toks[1]
                elif toks[0] == "direction":
                    cur["dir"] = Vector(map(float, toks[1:4]))
                elif toks[0] == "length":
                    cur["len"] = float(toks[1])
                elif toks[0] == "axis":
                    cur["C"] = _euler(toks[4].upper(), list(map(float, toks[1:4])))
                elif toks[0] == "dof":
                    cur["dof"] = [t.lower() for t in toks[1:]]
            elif section == ":hierarchy" and toks[0] not in ("begin", "end"):
                self.children.setdefault(toks[0], []).extend(toks[1:])
        # inches per unit -> metres
        self.scale = 0.0254 / self.unit


def read_amc(path):
    """Frames as lists of {bone: [values]} in file order."""
    frames, cur = [], None
    for raw in open(path):
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith(":"):
            continue
        toks = line.split()
        if len(toks) == 1 and toks[0].isdigit():
            cur = {}
            frames.append(cur)
        elif cur is not None:
            cur[toks[0]] = list(map(float, toks[1:]))
    return frames


class Clip:
    """One AMC take on its subject's skeleton, sampled at `fps` (CMU files are 120 or 60 fps)."""

    def __init__(self, take, src_fps=120, fps=30):
        subj = take.split("_")[0]
        self.take = take
        self.sk = Skeleton(os.path.join(DIR, f"{subj}.asf"))
        raw = read_amc(os.path.join(DIR, f"{take}.amc"))
        step = src_fps / fps
        self.frames = [raw[int(i * step)] for i in range(int(len(raw) / step))]

    def __len__(self):
        return len(self.frames)

    def pose(self, i):
        """Joint world positions and bone world rotations at frame i (Blender frame, metres).
        Returns ({bone: (start, end)}, {bone: rotation 3x3}, root position)."""
        sk, fr = self.sk, self.frames[min(max(i, 0), len(self.frames) - 1)]
        vals = dict(zip(sk.root_order, fr["root"]))
        root_pos = Vector((vals.get("TX", 0), vals.get("TY", 0), vals.get("TZ", 0))) * sk.scale
        root_rot = _euler("XYZ", [vals.get("RX", 0), vals.get("RY", 0), vals.get("RZ", 0)])
        seg, rot = {}, {"root": root_rot}
        stack = [("root", root_pos, root_rot)]
        while stack:
            parent, start, G = stack.pop()
            for name in sk.children.get(parent, []):
                b = sk.bones[name]
                vals = fr.get(name, [])
                d = {k: v for k, v in zip(b["dof"], vals)}
                M = _euler("XYZ", [d.get("rx", 0), d.get("ry", 0), d.get("rz", 0)])
                Gb = G @ b["C"] @ M @ b["C"].inverted()
                end = start + Gb @ (b["dir"] * b["len"] * sk.scale)
                seg[name] = (TO_BLENDER @ start, TO_BLENDER @ end)
                rot[name] = TO_BLENDER @ Gb @ TO_BLENDER.inverted()
                stack.append((name, end, Gb))
        return seg, rot, TO_BLENDER @ root_pos
