# Contact sheet: tile same-size PNGs into one image for review.
# blender -b --factory-startup -P tools/cinematics/contact.py -- out/sheet.png cols out/a.png out/b.png ...
import os, sys, bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index("--") + 1:]
dst, cols, files = os.path.join(HERE, args[0]), int(args[1]), [os.path.join(HERE, f) for f in args[2:]]
imgs = [bpy.data.images.load(f) for f in files]
w, h = imgs[0].size
rows = (len(imgs) + cols - 1) // cols
sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
for i, im in enumerate(imgs):
    a = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(a)
    r, c = divmod(i, cols)
    y0 = (rows - 1 - r) * h  # Blender images start at the bottom row
    sheet[y0:y0 + h, c * w:(c + 1) * w] = a.reshape(h, w, 4)
out = bpy.data.images.new("sheet", cols * w, rows * h, alpha=True)
out.pixels.foreach_set(sheet.ravel())
out.filepath_raw, out.file_format = dst, "PNG"
out.save()
print("wrote", dst)
