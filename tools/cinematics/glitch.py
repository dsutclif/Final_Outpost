# Find glitched frames in a rendered folder. Long Eevee sessions on this laptop's integrated GPU start
# returning white, red, green, blocky or half-corrupted frames after a few hundred frames, so frames are
# compared tile by tile with the median of their neighbours (a shot's real flashes and cuts get flagged
# too, which only costs a re-render). --delete removes them so a resumed render redoes only those.
# blender -b --factory-startup -P tools/cinematics/glitch.py -- out/crash_pod [--delete]
import os, sys, bpy
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index("--") + 1:]
folder = os.path.join(HERE, args[0])
files = sorted(f for f in os.listdir(folder) if f.endswith(".png"))
TX, TY = 9, 16
tiles = []
for f in files:
    img = bpy.data.images.load(os.path.join(folder, f))
    w, h = img.size
    px = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(h, w, 4)[:, :, :3]
    tiles.append(np.array([[px[y * h // TY:(y + 1) * h // TY, x * w // TX:(x + 1) * w // TX].mean(axis=(0, 1))
                            for x in range(TX)] for y in range(TY)]))
    bpy.data.images.remove(img)
tiles = np.array(tiles)
bad = []
for i in range(len(files)):
    nb = [j for j in range(i - 6, i + 7) if j != i and 0 <= j < len(files)]
    ref = np.median(tiles[nb], axis=0)
    # how far each tile is from its neighbourhood, against how much that tile normally moves there
    spread = np.median(np.abs(tiles[nb] - ref), axis=0)
    off = (np.abs(tiles[i] - ref) - 3 * spread).max(axis=2)
    if (off > 0.05).mean() > 0.02 or off.max() > 0.2:
        bad.append(files[i])
print("GLITCH", len(bad), " ".join(bad))
if "--delete" in args:
    for f in bad:
        os.remove(os.path.join(folder, f))
