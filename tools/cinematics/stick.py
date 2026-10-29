# Stage 1 of the pod-exit rework: raw CMU takes as stick figures, side by side, one short video per
# beat, so Doug can pick the performances before any retargeting. Fast Workbench render.
# blender -b --factory-startup -P tools/cinematics/stick.py -- <beat> [--check]
import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib, mocap

# beat -> takes (take, source fps), and how much of each to show
BEATS = {
    "getup": [("140_08", 120), ("140_09", 120)],
    "stepover": [("143_14", 120), ("143_15", 120), ("141_09", 120)],
    "stagger": [("104_13", 120), ("139_19", 120)],
    "drop": [("82_02", 120), ("01_07", 120)],
    "look": [("77_01", 60)],
}
LABEL = {
    "140_08": "A  get up from lying on back", "140_09": "B  get up from lying on back",
    "143_14": "A  walk and step over", "143_15": "B  walk and step over", "141_09": "C  step over",
    "104_13": "A  stumble walk", "139_19": "B  walk, wounded leg",
    "82_02": "A  jump off ledge", "01_07": "B  sit, dangle legs, jump down",
    "77_01": "A  looking around",
}
MAX_SECONDS = 9

args = sys.argv[sys.argv.index("--") + 1:]
beat = args[0]
sc = lib.reset(1280, 720)
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.light = "STUDIO"
sc.display.shading.color_type = "OBJECT"
sc.view_settings.view_transform = "Standard"
lib.sky(horizon="#d9d9d9", zenith="#bfbfbf", haze=0)
sc.world.color = (0.82, 0.82, 0.82)


def window(clip):
    """Frames to show: the whole take if short, else the seconds around its biggest drop (a jump)."""
    n, fps = len(clip), 30
    if n <= MAX_SECONDS * fps:
        return 0, n
    z = [clip.pose(i)[2].z for i in range(n)]
    drop = max(range(5, n), key=lambda i: z[i - 5] - z[i])
    a = max(0, drop - 5 * fps)
    return a, min(n, a + MAX_SECONDS * fps)


def bone_obj(name, color, r):
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=r, depth=1, location=(0, 0, 0.5))
    o = bpy.context.object
    bpy.ops.object.transform_apply(location=True)  # base at the origin, tip at +Z 1
    o.name = name
    o.color = color
    o.rotation_mode = "QUATERNION"
    return o


takes = BEATS[beat]
clips = [mocap.Clip(t, src_fps=f) for t, f in takes]
spans = [window(c) for c in clips]
length = max(b - a for a, b in spans)
GAP = 2.8
colors = [(0.85, 0.35, 0.2, 1), (0.2, 0.45, 0.85, 1), (0.25, 0.65, 0.3, 1)]
floor_z = 0.0
for k, (clip, (a, b)) in enumerate(zip(clips, spans)):
    x0 = (k - (len(clips) - 1) / 2) * GAP
    seg0, _, root0 = clip.pose(a)
    lowest = min(min(s.z, e.z) for s, e in seg0.values())
    off = Vector((x0 - root0.x, -root0.y, 0))
    objs = {}
    for name in seg0:
        thick = 0.045 if any(t in name for t in ("femur", "tibia", "humerus", "back", "thorax")) else 0.03
        objs[name] = bone_obj(f"{clip.take}:{name}", colors[k], thick)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11)
    head = bpy.context.object
    head.color = colors[k]
    for f in range(length):
        seg, _, _ = clip.pose(min(a + f, b - 1))
        for name, (s, e) in seg.items():
            o = objs[name]
            v = e - s
            o.location = s + off
            o.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(v.normalized()) if v.length > 1e-6 else (1, 0, 0, 0)
            o.scale = (1, 1, max(v.length, 1e-4))
            o.keyframe_insert("location", frame=f + 1)
            o.keyframe_insert("rotation_quaternion", frame=f + 1)
            o.keyframe_insert("scale", frame=f + 1)
        head.location = seg["head"][1] + off
        head.keyframe_insert("location", frame=f + 1)
    floor_z = min(floor_z, lowest)
    if lowest > 0.15:  # the take starts up on something (a ledge, a platform): draw it under the feet
        feet = [e for n, (s_, e) in seg0.items() if "toes" in n or "foot" in n]
        cx = sum(v.x for v in feet) / len(feet) + off.x
        cy = sum(v.y for v in feet) / len(feet) + off.y
        bpy.ops.mesh.primitive_cube_add(size=1, location=(cx, cy, lowest / 2))
        ledge = bpy.context.object
        ledge.scale = (0.9, 0.9, lowest)
        ledge.color = (0.55, 0.53, 0.5, 1)
    bpy.ops.object.text_add(location=(x0, 0, 2.15), rotation=(math.radians(90), 0, 0))
    t = bpy.context.object
    t.data.body = f"{LABEL[clip.take].split()[0]}  {clip.take}"
    t.data.align_x = "CENTER"
    t.data.size = 0.22
    t.color = (0.1, 0.1, 0.1, 1)

bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
bpy.context.object.color = (0.75, 0.73, 0.7, 1)
lib.camera((0, -9.0, 1.8), (0, 0, 1.0), lens=35)
sc.frame_start, sc.frame_end = 1, length
print(f"{beat}: {length} frames; windows {spans}")
if "--check" in args:
    for f in (1, length // 2, length):
        sc.frame_set(f)
        lib.render_still(os.path.join(lib.OUT, f"stick_{beat}_{f:03d}.png"))
else:
    lib.render_frames(os.path.join(lib.OUT, f"stick_{beat}"), 1, length)
