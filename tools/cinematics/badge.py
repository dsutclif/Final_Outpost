# Re-letter the crew ID badge: paint over the name lines with the card's own background and set
# new text in Barlow (the game's font). Renders a flat, colour-exact copy of the card.
# blender -b --factory-startup -P tools/cinematics/badge.py -- "BAY 5" "FIRST OFFICER" out/badge_bay5.png
import os, sys, bpy

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "..", "node_modules", ".pnpm", "@fontsource+barlow@5.1.0", "node_modules", "@fontsource", "barlow", "files")
args = sys.argv[sys.argv.index("--") + 1:]
name, rank, out = args[0], args[1], os.path.join(HERE, args[2])
src = os.path.join(HERE, "assets", "badge_commander.jpg")

# Card layout in source pixels (1493x2000 card): the two name lines and the box that hides them.
COVER = (165, 1295, 1255, 1535)    # x0, y0, x1, y1
NAME_AT, NAME_PX = (186, 1410), 128  # baseline-left, em size in px
RANK_AT, RANK_PX = (186, 1503), 84
SAMPLE = (300, 1545, 1100, 1560)   # strip of plain card under the text, for the cover colour

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE"
sc.view_settings.view_transform = "Standard"
img = bpy.data.images.load(src)
W, H = img.size
sc.render.resolution_x, sc.render.resolution_y = W, H
sc.render.film_transparent = False

px = img.pixels[:]
def pixel(x, y):
    k = ((H - 1 - y) * W + x) * 4
    return px[k:k + 3]
xs = range(SAMPLE[0], SAMPLE[2], 7)
ys = range(SAMPLE[1], SAMPLE[3], 3)
cols = [pixel(x, y) for x in xs for y in ys]
srgb = [sum(c[i] for c in cols) / len(cols) for i in range(3)]  # byte images read back as sRGB
bg = tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb)

def world(x, y):  # source pixel -> world units (1 unit = 100 px), card centred on the origin
    return (x / 100 - W / 200, H / 200 - y / 100)

def flat(name, color=None, image=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.remove(nt.nodes["Principled BSDF"])
    em = nt.nodes.new("ShaderNodeEmission")
    if image:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = image
        t.interpolation = "Closest"
        nt.links.new(t.outputs["Color"], em.inputs["Color"])
    else:
        em.inputs["Color"].default_value = (*color, 1)
    nt.links.new(em.outputs["Emission"], nt.nodes["Material Output"].inputs["Surface"])
    return m

bpy.ops.mesh.primitive_plane_add(size=1)
card = bpy.context.object
card.scale = (W / 100, H / 100, 1)
card.data.materials.append(flat("card", image=img))

x0, y0, x1, y1 = COVER
(ax, ay), (bx, by) = world(x0, y0), world(x1, y1)
bpy.ops.mesh.primitive_plane_add(size=1, location=((ax + bx) / 2, (ay + by) / 2, 0.01))
cover = bpy.context.object
cover.scale = (bx - ax, ay - by, 1)
cover.data.materials.append(flat("cover", color=bg))

def text(body, at, size_px, font, color):
    bpy.ops.object.text_add(location=(*world(*at), 0.02))
    t = bpy.context.object
    t.data.body = body
    t.data.font = bpy.data.fonts.load(os.path.join(FONTS, font))
    t.data.size = size_px / 100
    t.data.materials.append(flat(body, color=color))
    return t

def lin(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

text(name, NAME_AT, NAME_PX, "barlow-latin-800-normal.woff", lin("#0d0d0f"))
text(rank, RANK_AT, RANK_PX, "barlow-latin-700-normal.woff", lin("#5d5d5d"))

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
sc.collection.objects.link(cam)
cam.data.type = "ORTHO"
cam.data.ortho_scale = max(W, H) / 100
cam.location = (0, 0, 10)
sc.camera = cam
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
print("wrote", out)
