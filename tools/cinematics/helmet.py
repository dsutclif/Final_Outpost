# helmet_reveal: after level 5's win (docs/STORY-LEVELS.md). 5 s at 30 fps, at night.
# The raider lieutenant's helmet lies where it fell, dust still settling; where the black paint is
# scratched through, the Halcyon's white shell and gold H show. The camera creeps in, then tips
# down to the crew ID card that slipped out of the neck ring, VALE / FIRST OFFICER / BAY 5, and
# holds there long enough to read before the commander's "Vale?".
# blender -b --factory-startup -P tools/cinematics/helmet.py -- [--quick] [--check]
import math, os, random, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Vector
import lib

H_UV = (0.645, 0.665)  # where on the opening frame the H sits, 0..1 from bottom-left
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
quick = "--quick" in args
F0, F1 = 1, 150
CARD_AT = 98  # the camera has tipped onto the card; it holds there to F1
sc = lib.reset(*((360, 640) if quick else (720, 1280)))
if quick:
    sc.eevee.taa_render_samples = 12
sc.render.use_motion_blur = not quick
lib.bloom(threshold=1.0, size=6)

# night: cool moonlight from behind, warm light from a burning wreck off screen
lib.sky(horizon="#1d2332", zenith="#05070c", haze=0.0, haze_color="#2a2f3a")
lib.sun(elevation=22, azimuth=150, strength=0.45, color="#a9bde0", angle=1.0)
lib.ground()
lib.rocks(n=110, x=(-1.2, 1.2), y=(-0.2, 1.2), size=(0.006, 0.03), seed=31)
lib.rocks(n=30, x=(-6, 6), y=(1, 8), size=(0.05, 0.25), seed=32)

# the helmet: neck opening toward the camera (-Y at yaw 0), turned a little
helmet = lib.place("helmet", at=(0, 0, 0), yaw=18, size=0.42, name="helmet")
fire = lib.point((1.4, -0.9, 0.5), "#ff8a3a", 0, radius=0.4, name="fire")
for f in range(F0, F1 + 1):
    fire.data.energy = 60 + 14 * math.sin(f * 0.9) + 9 * math.sin(f * 2.3 + 1) + 5 * math.sin(f * 5.1)
    fire.data.keyframe_insert("energy", frame=f)
visor = lib.point((-0.05, 0.02, 0.2), "#ff2a1a", 0.35, radius=0.05, name="visor")

# the Halcyon H where the black paint is scratched through, stencilled onto the shell (place_h)
# where the opening camera sees it best. Its texture is drawn here, so the shot needs no asset.
GOLD, PAINT = (0.42, 0.27, 0.08), (0.62, 0.60, 0.55)  # linear; darker gold so the H reads against the white


def h_mark(n=384, seed=7):
    rnd = random.Random(seed)
    img = bpy.data.images.new("h_mark", n, n, alpha=True)
    img.colorspace_settings.name = "Non-Color"  # the values below are linear; set first, as it regenerates the image
    waves = [(rnd.uniform(0.03, 0.07), k, rnd.uniform(0, 6.3)) for k in (3, 5, 8, 13)]
    streaks = [(rnd.uniform(0, 6.3), rnd.uniform(0.95, 1.2), rnd.uniform(0.02, 0.045)) for _ in range(5)]
    chips = [(rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8), rnd.uniform(0.015, 0.05)) for _ in range(30)]
    px = [0.0] * (n * n * 4)
    for j in range(n):
        y = j / (n - 1) * 2 - 1
        for i in range(n):
            x = i / (n - 1) * 2 - 1
            r, a = math.hypot(x, y), math.atan2(y, x)
            edge = 0.8 + sum(w * math.sin(k * a + p) for w, k, p in waves) + 0.02 * math.sin(41 * a)
            inside = r < edge
            for sa, ln, wd in streaks:  # scratches running out of the patch
                ux, uy = math.cos(sa), math.sin(sa)
                t = x * ux + y * uy
                if 0.4 < t < ln and abs(-x * uy + y * ux) < wd * (1 - (t - 0.4) / (ln - 0.4)):
                    inside = True
            if inside and r > 0.66:  # flecks of black paint left round the edge
                inside = not any((x - cx) ** 2 + (y - cy) ** 2 < cr * cr for cx, cy, cr in chips if math.hypot(cx, cy) > 0.6)
            if not inside:
                continue
            oc = max(abs(x), abs(y), (abs(x) + abs(y)) / math.sqrt(2))  # octagon "radius", as on the coin
            ring = 0.5 < oc < 0.62
            hh = abs(y) < 0.36 and (0.17 < abs(x) < 0.32 or (abs(x) <= 0.17 and abs(y) < 0.065))
            c = GOLD if ring or hh else PAINT
            g = 1 - 0.06 * rnd.random()
            k = (j * n + i) * 4
            px[k:k + 4] = [c[0] * g, c[1] * g, c[2] * g, 1.0]
    img.pixels = px
    return img


def screen_ray(cam, u, v):
    """World ray from the camera through the frame point (u, v), 0..1 from bottom-left."""
    fr = [cam.matrix_world @ p for p in cam.data.view_frame(scene=sc)]  # tr, br, bl, tl
    p = fr[2] + (fr[1] - fr[2]) * u + (fr[3] - fr[2]) * v
    o = cam.matrix_world.translation.copy()
    return o, (p - o).normalized()


def place_h(cam, u, v, size=0.05, depth=0.045, frame=30):
    """Project the mark onto the helmet's own materials from the camera's side, like a stencil,
    through frame point (u, v) at `frame`: it reads square-on to the camera whatever the shell's
    shape under it, and only within `depth` of the hit, so the far side stays black."""
    sc.frame_set(frame)
    dg = bpy.context.evaluated_depsgraph_get()
    o, d = screen_ray(cam, u, v)
    hit, at, nrm, _, ob, _ = sc.ray_cast(dg, o, d)
    print("H mark on", ob.name if hit else None, at, nrm)
    if not hit:
        return None
    proj = bpy.data.objects.new("h_projector", None)
    sc.collection.objects.link(proj)
    proj.location = at
    proj.rotation_euler = (-d).to_track_quat("Z", "Y").to_euler()
    proj.scale = (size, size, depth)
    img = h_mark()
    for name in helmet["meshes"]:
        for m in {s.material for s in bpy.data.objects[name].material_slots if s.material}:
            nt = m.node_tree
            b = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if b is None:
                continue
            tc = nt.nodes.new("ShaderNodeTexCoord")
            tc.object = proj
            uvw = nt.nodes.new("ShaderNodeVectorMath")
            uvw.operation = "MULTIPLY_ADD"
            nt.links.new(tc.outputs["Object"], uvw.inputs[0])
            uvw.inputs[1].default_value = (0.5, 0.5, 0.5)
            uvw.inputs[2].default_value = (0.5, 0.5, 0.5)
            t = nt.nodes.new("ShaderNodeTexImage")
            t.image, t.extension = img, "CLIP"
            nt.links.new(uvw.outputs["Vector"], t.inputs["Vector"])
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")  # depth window: |z| < 1 in projector space
            nt.links.new(tc.outputs["Object"], sep.inputs[0])
            az = nt.nodes.new("ShaderNodeMath")
            az.operation = "ABSOLUTE"
            nt.links.new(sep.outputs["Z"], az.inputs[0])
            lt = nt.nodes.new("ShaderNodeMath")
            lt.operation = "LESS_THAN"
            nt.links.new(az.outputs[0], lt.inputs[0])
            lt.inputs[1].default_value = 1.0
            fac = nt.nodes.new("ShaderNodeMath")
            fac.operation = "MULTIPLY"
            nt.links.new(t.outputs["Alpha"], fac.inputs[0])
            nt.links.new(lt.outputs[0], fac.inputs[1])
            for inp, val in (("Base Color", t.outputs["Color"]), ("Roughness", 0.4), ("Metallic", 0.3)):
                sock = b.inputs[inp]
                mix = nt.nodes.new("ShaderNodeMix")
                mix.data_type = "RGBA" if inp == "Base Color" else "FLOAT"
                a_in, b_in = (mix.inputs[6], mix.inputs[7]) if inp == "Base Color" else (mix.inputs[2], mix.inputs[3])
                if sock.is_linked:
                    nt.links.new(sock.links[0].from_socket, a_in)
                else:
                    a_in.default_value = sock.default_value
                if isinstance(val, float):
                    b_in.default_value = val
                else:
                    nt.links.new(val, b_in)
                nt.links.new(fac.outputs[0], mix.inputs[0])
                out = mix.outputs[2] if inp == "Base Color" else mix.outputs[0]
                nt.links.new(out, sock)
    return proj


# the ID card, slipped out onto the sand in front of the neck ring
card = bpy.data.materials.new("badge")
card.use_nodes = True
nt = card.node_tree
b = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(os.path.join(lib.HERE, "assets", "badge_bay5.png"))
nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
b.inputs["Roughness"].default_value = 0.45
bpy.ops.mesh.primitive_plane_add(size=1, location=(0.07, -0.31, 0.004))
badge = bpy.context.object
badge.name = "badge"
badge.scale = (0.054, 0.054 * 2000 / 1493, 1)  # the card image's aspect
badge.rotation_euler = (math.radians(4), math.radians(-3), math.radians(16))
badge.data.materials.append(card)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)  # so lettering parented to it stays unstretched

# re-letter the card in place (badge.py's layout, in card pixels): VALE over FIRST OFFICER / BAY 5
CW, CH = 1493, 2000
KPX = 0.054 / CW  # metres per card pixel
FONTS = os.path.join(lib.ROOT, "node_modules", ".pnpm", "@fontsource+barlow@5.1.0", "node_modules", "@fontsource", "barlow", "files")
cpx = tex.image.pixels[:]
samp = [cpx[((CH - 1 - y) * CW + x) * 4:((CH - 1 - y) * CW + x) * 4 + 3] for x in range(300, 1100, 7) for y in range(1545, 1560, 3)]
srgb = [sum(c[i] for c in samp) / len(samp) for i in range(3)]
card_bg = tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in srgb)


def on_card(ob, x, y, z):
    ob.parent = badge
    ob.matrix_parent_inverse.identity()
    ob.location = ((x - CW / 2) * KPX, (CH / 2 - y) * KPX, z)
    ob.rotation_euler = (0, 0, 0)


bpy.ops.mesh.primitive_plane_add(size=1)
cover = bpy.context.object
cover.scale = ((1260 - 160) * KPX, (1545 - 1290) * KPX, 1)
cover.data.materials.append(lib.mat("card_cover", (*card_bg, 1), rough=0.45))
on_card(cover, (160 + 1260) / 2, (1290 + 1545) / 2, 0.00012)
for body, (x, y), em, font, col in (("VALE", (180, 1436), 190, "barlow-latin-800-normal.woff", "#0d0d0f"),
                                    ("FIRST OFFICER · BAY 5", (186, 1532), 92, "barlow-latin-700-normal.woff", "#4a4a4a")):
    bpy.ops.object.text_add()
    t = bpy.context.object
    t.data.body = body
    t.data.font = bpy.data.fonts.load(os.path.join(FONTS, font))
    t.data.size = em * KPX
    t.data.materials.append(lib.mat(body, col, rough=0.45))
    on_card(t, x, y, 0.00024)

# camera: a slow creep toward the helmet, then it tips down onto the card and settles; focus follows
aim = bpy.data.objects.new("aim", None)
sc.collection.objects.link(aim)
for f, p in ((F0, (0, 0, 0.14)), (62, (0.01, -0.05, 0.12)), (CARD_AT, (0.07, -0.31, 0.005)), (F1, (0.07, -0.31, 0.005))):
    aim.location = p
    aim.keyframe_insert("location", frame=f)
cam = lib.camera((0.95, -1.05, 0.32), (0, 0, 0.14), lens=55)
for f, p in ((F0, (0.95, -1.05, 0.32)), (62, (0.5, -0.62, 0.22)), (CARD_AT, (0.12, -0.5, 0.22)),
             (120, (0.095, -0.41, 0.17)), (F1, (0.088, -0.39, 0.158))):
    cam.location = p
    cam.keyframe_insert("location", frame=f)
tt = cam.constraints.new("TRACK_TO")
tt.target, tt.track_axis, tt.up_axis = aim, "TRACK_NEGATIVE_Z", "UP_Y"
cam.data.dof.use_dof = True
cam.data.dof.focus_object = aim
cam.data.dof.aperture_fstop = 2.8
place_h(cam, *H_UV)  # before the dust, so the ray finds the shell

# dust from the fall, settling
dust = bpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(0, -0.05, 0.08))
puff = bpy.context.object
m = bpy.data.materials.new("puff")
m.use_nodes = True
mt = m.node_tree
mt.nodes.remove(mt.nodes["Principled BSDF"])
vol = mt.nodes.new("ShaderNodeVolumePrincipled")
vol.inputs["Color"].default_value = lib.rgb("#8f7c66")
mt.links.new(vol.outputs["Volume"], mt.nodes["Material Output"].inputs["Volume"])
puff.data.materials.append(m)
for f, s, d in ((F0, 0.25, 6.0), (45, 0.55, 0.8), (80, 0.7, 0.0)):
    puff.scale = (s, s, s * 0.5)
    puff.keyframe_insert("scale", frame=f)
    vol.inputs["Density"].default_value = d
    vol.inputs["Density"].keyframe_insert("default_value", frame=f)

if "--check" in args:
    for f in (F0, 40, 62, CARD_AT, 120, F1):
        sc.frame_set(f)
        lib.render_still(os.path.join(lib.OUT, f"helmet_{f:03d}.png"))
else:
    lib.render_frames(os.path.join(lib.OUT, "helmet_reveal"), F0, F1)
