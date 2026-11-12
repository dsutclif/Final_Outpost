# Stills of the lander escape pod (tools/cinematics/escape_pod.py) for sign-off before it goes into the game:
# a three-quarter view, the hatch side, a look in through the hatch, the game camera's angle (30 degrees above the
# ground, a nearly flat lens) beside a towable crew pod and the commander for scale, and the same at phone size.
#
#   blender -b --factory-startup -P tools/cinematics/escape_pod_stills.py -- <out_dir> [pod.glb] [--draft]
#
# --draft renders one small sheet of all the views (out_dir/draft.png) instead of the full-size stills.
import math
import os
import sys

import bpy
import numpy as np
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
MODELS = os.path.join(ROOT, "packages", "client", "public", "models")
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
DRAFT = "--draft" in argv
argv = [a for a in argv if not a.startswith("--")]
OUT = argv[0]
POD = argv[1] if len(argv) > 1 else os.path.join(HERE, "assets", "escape_pod.glb")
GAME_YAW = 30.0          # the pod turned so its hatch faces the game camera (the camera sits 45 degrees round)
SAND = (0.50, 0.24, 0.11)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene


def load(path, name):
    """Import a GLB under one empty; returns (empty, lo, hi) with the bounds of its meshes."""
    before = set(sc.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in sc.objects if o not in before]
    root = bpy.data.objects.new(name, None)
    sc.collection.objects.link(root)
    for o in new:
        if o.parent is None:
            o.parent = root
    bpy.context.view_layer.update()
    pts = [o.matrix_world @ Vector(c) for o in new if o.type == "MESH" for c in o.bound_box]
    return root, Vector(map(min, *pts)), Vector(map(max, *pts))


pod, plo, phi = load(POD, "pod")
crew, clo, chi = load(os.path.join(MODELS, "capture.recruit_container.glb"), "crew_pod")
man, mlo, mhi = load(os.path.join(MODELS, "unit.player.glb"), "commander")
k = 1.98 / (mhi.z - mlo.z)
man.scale = (k, k, k)
print("STILLS pod", tuple(round(v, 2) for v in phi - plo), "crew pod", tuple(round(v, 2) for v in chi - clo), "commander scale", round(k, 3))

ground = bpy.data.meshes.new("ground")
ground.from_pydata([(-40, -40, 0), (40, -40, 0), (40, 40, 0), (-40, 40, 0)], [], [(0, 1, 2, 3)])
gob = bpy.data.objects.new("ground", ground)
sc.collection.objects.link(gob)
gm = bpy.data.materials.new("sand")
gm.use_nodes = True
bsdf = next(n for n in gm.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
bsdf.inputs["Base Color"].default_value = (*SAND, 1)
bsdf.inputs["Roughness"].default_value = 1.0
ground.materials.append(gm)

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
sc.collection.objects.link(sun)
sun.data.energy = 2.5
sun.data.angle = math.radians(6)
world = bpy.data.worlds.new("world")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.72, 0.62, 0.55, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.6
sc.world = world
for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
    try:
        sc.render.engine = eng
        break
    except TypeError:
        pass
sc.view_settings.view_transform = "Standard"
sc.render.film_transparent = False
sc.render.image_settings.file_format = "PNG"
cam_data = bpy.data.cameras.new("cam")
cam = bpy.data.objects.new("cam", cam_data)
sc.collection.objects.link(cam)
sc.camera = cam
cam_data.type = "ORTHO"
cam_data.clip_start, cam_data.clip_end = 0.1, 200


def aim(obj, origin, toward):
    obj.location = origin
    obj.rotation_euler = (Vector(toward) - Vector(origin)).to_track_quat("-Z", "Y").to_euler()


def place(yaw, extras):
    """extras: where the crew pod and the commander stand, as (metres to screen right, metres toward the game camera)."""
    pod.rotation_euler = (0, 0, math.radians(yaw))
    crew.location = man.location = (500, 500, 0)   # out of shot
    if extras:
        for obj, (a, b) in zip((crew, man), extras):
            obj.location = (0.7071 * (a + b), 0.7071 * (a - b), 0)
        crew.rotation_euler = (0, 0, math.radians(yaw))
        man.rotation_euler = (0, 0, math.radians(-45))


# name, pod yaw, where the crew pod and commander stand (or None), direction to the camera, look point, metres across, pixels
GAME = (1, -1, math.tan(math.radians(30)) * math.sqrt(2))
SHOTS = [
    ("1-three-quarter", 0, None, (0.75, -1.0, 0.52), (0.05, -0.25, 0.75), 4.3, (1500, 1050)),
    ("2-hatch-side", 0, None, (0.0, -1.0, 0.22), (0.0, -0.2, 0.75), 4.0, (1500, 1050)),
    ("3-looking-in", 0, None, (0.18, -0.8, 0.62), (-0.1, -0.45, 0.8), 2.3, (1500, 1050)),
    ("4-game-camera", GAME_YAW, ((3.1, 0.2), (-2.8, -0.3)), GAME, (0.0, 0.0, 0.7), 8.4, (1500, 1050)),
    ("5-phone-size", GAME_YAW, ((1.95, 1.0), (-2.0, 0.6)), GAME, (0.0, 0.0, 0.9), 6.0, (390, 700)),
]
paths = []
for name, yaw, extras, d, look, across, (w, h) in SHOTS:
    place(yaw, extras)
    d = Vector(d).normalized()
    aim(cam, Vector(look) + d * 30, look)
    aim(sun, (0, 0, 0), -(d + Vector((-0.55, -0.25, 0.9))).normalized())   # light from over the camera's left shoulder
    if DRAFT and name != "5-phone-size":
        w, h = w // 2, h // 2
    sc.render.resolution_x, sc.render.resolution_y = w, h
    cam_data.ortho_scale = across if w >= h else across * h / w
    sc.render.filepath = os.path.join(OUT, ("draft_" if DRAFT else "") + name + ".png")
    bpy.ops.render.render(write_still=True)
    paths.append((sc.render.filepath, w, h))
    print("STILLS wrote", sc.render.filepath)

if DRAFT:   # one sheet: four views in a 2 x 2 grid, the phone-size view down the right
    cw, ch = paths[0][1], paths[0][2]
    pw, ph = paths[4][1], paths[4][2]
    sheet = np.zeros((max(ch * 2, ph), cw * 2 + pw, 4), np.float32)
    sheet[..., 3] = 1
    for i, (p, w, h) in enumerate(paths):
        im = bpy.data.images.load(p)
        a = np.empty(w * h * 4, np.float32)
        im.pixels.foreach_get(a)
        a = a.reshape(h, w, 4)
        if i < 4:
            r, c = divmod(i, 2)
            y0 = sheet.shape[0] - (r + 1) * ch
            sheet[y0:y0 + ch, c * cw:(c + 1) * cw] = a
        else:
            sheet[sheet.shape[0] - ph:, cw * 2:] = a
        os.remove(p)
    o = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0])
    o.pixels.foreach_set(sheet.ravel())
    o.filepath_raw = os.path.join(OUT, "draft.png")
    o.file_format = "PNG"
    o.save()
    print("STILLS wrote", o.filepath_raw)
