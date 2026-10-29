# Tile per-view frame folders into one 2x2 video frame folder (front | side / top | shot), with labels.
# blender -b --factory-startup -P tools/cinematics/tile.py -- out/pod_view_ out/pod_exit_preview front side top shot
import os, sys, bpy
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index("--") + 1:]
prefix, dst, views = os.path.join(HERE, args[0]), os.path.join(HERE, args[1]), args[2:]
os.makedirs(dst, exist_ok=True)
names = sorted(os.listdir(prefix + views[0]))
for n in names:
    imgs = []
    for v in views:
        im = bpy.data.images.load(os.path.join(prefix + v, n))
        w, h = im.size
        a = np.empty(w * h * 4, dtype=np.float32); im.pixels.foreach_get(a)
        imgs.append(a.reshape(h, w, 4)); bpy.data.images.remove(im)
    top = np.concatenate(imgs[2:4], axis=1)   # Blender rows run bottom-up: the last pair is the bottom row
    bottom = np.concatenate(imgs[0:2], axis=1)
    sheet = np.concatenate([top, bottom], axis=0)
    out = bpy.data.images.new("t", sheet.shape[1], sheet.shape[0], alpha=True)
    out.pixels.foreach_set(sheet.ravel())
    out.filepath_raw, out.file_format = os.path.join(dst, n), "PNG"
    out.save(); bpy.data.images.remove(out)
print("tiled", len(names))
