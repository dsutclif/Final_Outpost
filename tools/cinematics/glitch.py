# Find glitched frames in a rendered folder (the GPU occasionally returns a white, red or black frame
# under memory pressure): a frame whose mean colour is far from its neighbourhood's median.
# Prints their numbers; --delete removes them so a resumed render (use_overwrite off) redoes only those.
# blender -b --factory-startup -P tools/cinematics/glitch.py -- out/crash_pod [--delete]
import os, sys, bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index("--") + 1:]
folder = os.path.join(HERE, args[0])
files = sorted(f for f in os.listdir(folder) if f.endswith(".png"))
means = []
for f in files:
    img = bpy.data.images.load(os.path.join(folder, f))
    px = np.empty(len(img.pixels), dtype=np.float32)
    img.pixels.foreach_get(px)
    means.append(px.reshape(-1, 4)[::7, :3].mean(axis=0))
    bpy.data.images.remove(img)
means = np.array(means)
bad = []
for i in range(len(files)):
    # against the median of a window either side, so a run of several bad frames is still caught
    nb = [means[j] for j in range(i - 6, i + 7) if j != i and 0 <= j < len(files)]
    ref = np.median(nb, axis=0)
    if np.abs(means[i] - ref).max() > 0.09:
        bad.append(files[i])
print("GLITCH", len(bad), " ".join(bad))
if "--delete" in args:
    for f in bad:
        os.remove(os.path.join(folder, f))
