# Compose the review sheets with Blender's bundled numpy: strip (grid of side frames) and end-pose vs helmet_reveal frame 1.
import bpy, numpy as np, os, sys
a = sys.argv[sys.argv.index("--") + 1:]
root = a[0]
def load(p):
    im = bpy.data.images.load(p); w, h = im.size
    px = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4); return px
def fit(px, H):
    h, w, _ = px.shape; W = int(w * H / h)
    ys = (np.arange(H) * h / H).astype(int); xs = (np.arange(W) * w / W).astype(int)
    return px[ys][:, xs]
def save(px, p):
    h, w, _ = px.shape
    im = bpy.data.images.new("o", w, h, alpha=True); im.pixels = px.ravel().tolist(); im.filepath_raw = p; im.file_format = "PNG"; im.save()
fr = [1,9,17,25,33,41,49,57,65,73,81,89,96]
tiles = [fit(load(f"{root}/stills/strip_frames_v3/side_{f:03d}.png"), 270) for f in fr]
cols = 5; rows = 3
tw = tiles[0].shape[1]
blank = np.ones((270, tw, 4), np.float32) * 0.15; blank[..., 3] = 1
tiles += [blank] * (cols * rows - len(tiles))
sheet = np.concatenate([np.concatenate(tiles[r*cols:(r+1)*cols], axis=1) for r in reversed(range(rows))], axis=0)
save(sheet[::1], f"{root}/stills/kneel_lift_strip-v3.png")
end = fit(load(f"{root}/stills/front34_096-v3.png"), 540)
rev = fit(load(f"{root}/packages/client/src/cinematics/helmet_reveal.poster.png"), 540)
save(np.concatenate([end, rev], axis=1), f"{root}/stills/end_pose_vs_helmet_reveal_first_frame-v3.png")
