# Shared scene building for the cinematics: game models placed in metres, sand, ridges, sky and
# haze, low sun, reactor glow, camera helpers and render settings. Shots import this and stay
# data-like: what goes where, and where the camera looks.
import math, os, bpy
from mathutils import Quaternion, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
MODELS = os.path.join(ROOT, "packages", "client", "public", "models")
CACHE = os.path.join(HERE, "cache")
OUT = os.path.join(HERE, "out")

# Mars Greenhouse palette (packages/skins/src/mars_greenhouse.ts)
PAL = {
    "ground": "#645849", "groundAlt": "#706352", "groundDark": "#544a3e", "structure": "#c6c4be",
    "accent": "#ff9a3c", "sky": "#d8d1c2", "fog": "#c4baa8", "storm": "#a68862",
}


def rgb(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return (*lin, a)


def reset(w=1080, h=1920, fps=30):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    for eng in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):
        try:
            sc.render.engine = eng
            break
        except TypeError:
            pass
    sc.render.resolution_x, sc.render.resolution_y, sc.render.fps = w, h, fps
    sc.eevee.taa_render_samples = 48
    for attr, val in (("use_shadows", True), ("use_raytracing", True), ("volumetric_end", 600.0),
                      ("volumetric_tile_size", "4"), ("use_gtao", True), ("use_volumetric_shadows", False),
                      ("shadow_pool_size", "1024")):
        if hasattr(sc.eevee, attr):
            try: setattr(sc.eevee, attr, val)
            except Exception: pass
    sc.view_settings.view_transform = "AgX"
    try: sc.view_settings.look = "AgX - Medium High Contrast"
    except TypeError: pass
    sc.view_settings.exposure = 0.0
    sc.render.image_settings.file_format = "PNG"
    return sc


def mat(name, color, rough=0.85, metal=0.0, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = rgb(color) if isinstance(color, str) else color
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = rgb(emit)
        b.inputs["Emission Strength"].default_value = strength
    return m


def _import(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    return new, roots


def place(path, at=(0, 0, 0), yaw=0.0, size=None, height=None, name=None, exact=False, rigged=False):
    """Import a GLB, scale it so its largest horizontal extent is `size` (or its height is
    `height`) metres, stand it on the ground at `at`, turned `yaw` degrees. Returns the root.
    rigged: drop the rig's stray Icosphere and measure the skinned body itself; its bound box
    otherwise lifts the character off the ground and shrinks it."""
    if not os.path.isabs(path):
        cached = os.path.join(CACHE, path + ".glb")
        path = cached if os.path.exists(cached) else os.path.join(MODELS, path + ".glb")
    if not os.path.exists(path):
        print("MISSING model", path)
        return None
    new, roots = _import(path)
    if rigged:
        for o in [o for o in new if o.name.startswith("Icosphere")]:
            new.remove(o)
            if o in roots: roots.remove(o)
            bpy.data.objects.remove(o)
    root = bpy.data.objects.new(name or os.path.basename(path), None)
    bpy.context.scene.collection.objects.link(root)
    for r in roots:
        r.parent = root
    bpy.context.view_layer.update()
    lo, hi = Vector((1e9,) * 3), Vector((-1e9,) * 3)
    for o in new:
        if o.type == "MESH":
            if rigged:
                ev = o.evaluated_get(bpy.context.evaluated_depsgraph_get())
                pts = [ev.matrix_world @ v.co for v in ev.to_mesh().vertices]
            else:
                pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
            for w in pts:
                lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    ext = hi - lo
    k = 1.0
    if height: k = height / max(ext.z, 1e-6)
    elif size: k = size / max(ext.x, ext.y, 1e-6)
    for r in ([] if exact else roots):  # exact: the file is already in metres and in place
        r.location = (r.location - Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z)))
    root.scale = (k, k, k)
    root.location = at
    root.rotation_euler = (0, 0, math.radians(yaw))
    root["meshes"] = [o.name for o in new if o.type == "MESH"]
    root["armature"] = next((o.name for o in new if o.type == "ARMATURE"), "")
    return root


def animate(root, clip, start=1, speed=1.0, hold=False):
    """Play one of a rigged model's clips from `start`, looped over the shot unless `hold`."""
    arm = bpy.data.objects.get(root["armature"])
    if not arm:
        return
    act = next((a for a in bpy.data.actions if a.name.startswith(clip)), None)
    if not act:
        raise KeyError(f"no clip {clip}; have {[a.name for a in bpy.data.actions]}")
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = None
    track = ad.nla_tracks.new()
    f0, f1 = act.frame_range
    strip = track.strips.new(clip, int(start), act)
    strip.scale = 1.0 / speed
    strip.repeat = 1 if hold else 40
    if hasattr(strip, "action_slot") and getattr(act, "slots", None):
        try: strip.action_slot = act.slots[0]
        except Exception: pass
    return strip


def settle(root, frame=1):
    """Stand a rigged character's lowest point on the ground at `frame`, posed as it will be seen."""
    sc = bpy.context.scene
    sc.frame_set(frame)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    low = 1e9
    for name in root["meshes"]:
        ev = bpy.data.objects[name].evaluated_get(dg)
        low = min(low, min((ev.matrix_world @ v.co).z for v in ev.to_mesh().vertices))
    print("settle", root.name, "was", round(low, 3), "off the ground")
    root.location.z -= low


def brighten(holder, k):
    """Multiply the base colour of everything under a prop's holder."""
    for o in holder.children_recursive:
        if o.type != "MESH":
            continue
        for m in o.data.materials:
            nt = m.node_tree
            b = nt.nodes["Principled BSDF"].inputs["Base Color"]
            mul = nt.nodes.new("ShaderNodeVectorMath")
            mul.operation = "SCALE"
            mul.inputs["Scale"].default_value = k
            if b.links:
                nt.links.new(b.links[0].from_socket, mul.inputs[0])
            else:
                mul.inputs[0].default_value = b.default_value[:3]
            nt.links.new(mul.outputs[0], b)


def contact(at, radius, strength=0.6):
    """A soft dark patch on the ground: the contact shadow a low sun alone doesn't give."""
    bpy.ops.mesh.primitive_plane_add(size=2, location=(at[0], at[1], 0.004))
    o = bpy.context.object
    o.scale = (radius, radius, 1)
    m = bpy.data.materials.new("contact")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.01, 0.007, 0.005, 1)
    b.inputs["Roughness"].default_value = 1
    tc = nt.nodes.new("ShaderNodeTexCoord")
    grad = nt.nodes.new("ShaderNodeTexGradient"); grad.gradient_type = "SPHERICAL"
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.interpolation_type = "SMOOTHSTEP"
    mr.inputs["To Max"].default_value = strength
    nt.links.new(tc.outputs["Object"], grad.inputs["Vector"])
    nt.links.new(grad.outputs["Fac"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], b.inputs["Alpha"])
    o.data.materials.append(m)
    o.visible_shadow = False
    return o


def still(root):
    """No clip: hold the rig in its rest pose (then shape it with pose())."""
    arm = bpy.data.objects.get(root["armature"])
    if arm and arm.animation_data:
        arm.animation_data.action = None
        for t in list(arm.animation_data.nla_tracks):
            arm.animation_data.nla_tracks.remove(t)
    if arm:
        for pb in arm.pose.bones:
            pb.location = (0, 0, 0)
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.rotation_euler = (0, 0, 0)
            pb.scale = (1, 1, 1)


def pose(root, bones, frame=None):
    """Set bone rotations (degrees, local XYZ euler) by short name: {"LeftArm": (x, y, z)}.
    With `frame`, keys them there so poses can be animated between frames."""
    arm = bpy.data.objects.get(root["armature"])
    for short, deg in bones.items():
        pb = arm.pose.bones.get("mixamorig:" + short) or arm.pose.bones.get(short)
        if not pb:
            continue
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = tuple(math.radians(d) for d in deg)
        if frame is not None:
            pb.keyframe_insert("rotation_euler", frame=frame)


def cycles(clip, n, loop):
    """Playback speed fitting n whole plays of a clip into a loop. Measured here, since an import
    rescales clip frames to the scene's frame rate."""
    act = next(a for a in bpy.data.actions if a.name.startswith(clip))
    return (act.frame_range[1] - act.frame_range[0]) * n / loop


def bake_cycle(root, clip, end, loop, n, recover, grip=0.0):
    """Key n plays of a clip that doesn't close on itself (the swing ends far from where it
    starts): frames 0..end played once per loop/n, the last `recover` easing back to the start.
    grip: degrees to curl the fingers, for a clip made with open hands."""
    arm = bpy.data.objects[root["armature"]]
    act = next(a for a in bpy.data.actions if a.name.startswith(clip))
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if hasattr(ad, "action_slot") and ad.action_slot is None and getattr(act, "slots", None):
        ad.action_slot = act.slots[0]
    sc = bpy.context.scene
    snaps = []
    for f in range(end + 1):
        sc.frame_set(f)
        snaps.append({pb.name: (pb.location.copy(), pb.rotation_quaternion.copy()) for pb in arm.pose.bones})
    if grip:
        curl = Quaternion((1, 0, 0), math.radians(grip))
        for snap in snaps:
            for name, (loc, rot) in snap.items():
                if "Hand" in name and any(d in name for d in ("Index", "Middle", "Ring", "Pinky")):
                    snap[name] = (loc, rot @ curl)
    ad.action = None
    def mix(a, b, u):
        return {k: (a[k][0].lerp(b[k][0], u), a[k][1].slerp(b[k][1], u)) for k in a}
    period = loop // n
    play = period - recover
    for c in range(n):
        for i in range(period + 1):
            if i < play:
                s = i / play * end
                pose_now = mix(snaps[int(s)], snaps[min(int(s) + 1, end)], s - int(s))
            else:
                u = (i - play) / recover
                pose_now = mix(snaps[end], snaps[0], u * u * (3 - 2 * u))
            for pb in arm.pose.bones:
                pb.location, pb.rotation_quaternion = pose_now[pb.name]
                pb.keyframe_insert("location", frame=1 + c * period + i)
                pb.keyframe_insert("rotation_quaternion", frame=1 + c * period + i)
    return 1 + play  # the first strike's scene frame


def hold(root, prop, clip, frame, gun=False, axis=(0, 1, 0), side=(0, 1, 0), grip=(0, 0, 0), k=1.0, want=None, palm=False):
    """Put a prop in a rigged character's right hand the way the game does (render-3d rigged.ts
    calibrate): lined up between the hands at `frame` of `clip`. axis, side and grip are in the
    prop file's glTF coordinates, as in meshy.json; `side` turns toward world direction `want` if
    given; palm lines it up through the palms rather than the wrists. Call before animating. Returns
    the prop's holder."""
    g2b = lambda v: Vector((v[0], -v[2], v[1]))
    sc = bpy.context.scene
    arm = bpy.data.objects[root["armature"]]
    act = next(a for a in bpy.data.actions if a.name.startswith(clip))
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = act
    if hasattr(ad, "action_slot") and ad.action_slot is None and getattr(act, "slots", None):
        ad.action_slot = act.slots[0]
    sc.frame_set(int(frame))
    bpy.context.view_layer.update()
    rh = arm.pose.bones["mixamorig:RightHand"]
    bones = ("mixamorig:RightHandMiddle1", "mixamorig:LeftHandMiddle1") if palm else ("mixamorig:RightHand", "mixamorig:LeftHand")
    R = arm.matrix_world @ arm.pose.bones[bones[0]].head
    L = arm.matrix_world @ arm.pose.bones[bones[1]].head
    d = ((L - R) if gun else (R - L)).normalized()
    want = Vector(want) if want else Vector((0, 0, 1)) if gun else root.matrix_world.to_3x3().normalized() @ Vector((0, -1, 0))
    want = (want - d * want.dot(d)).normalized()
    a = g2b(axis).normalized()
    s = g2b(side)
    s = (s - a * s.dot(a)).normalized()
    from mathutils import Matrix
    basis = lambda x, y: Matrix((x, y, x.cross(y))).transposed()
    rot = basis(d, want) @ basis(a, s).transposed()
    at = (R if gun else L) - rot @ (g2b(grip) * k)
    M = Matrix.Translation(at) @ rot.to_4x4() @ Matrix.Diagonal((k, k, k, 1))
    new, roots = _import(os.path.join(MODELS, prop + ".glb"))
    holder = bpy.data.objects.new(prop, None)
    sc.collection.objects.link(holder)
    for r in roots:
        r.parent = holder
    holder.parent = arm
    holder.parent_type = "BONE"
    holder.parent_bone = rh.name
    bpy.context.view_layer.update()
    holder.matrix_world = M
    bpy.context.view_layer.update()
    ad.action = None
    return holder


STAND = {"LeftArm": (0, 0, -32), "RightArm": (0, 0, 32), "LeftForeArm": (0, 0, -8), "RightForeArm": (0, 0, 8)}


def ground(size=1200, seed=0):
    bpy.ops.mesh.primitive_plane_add(size=size)
    g = bpy.context.object
    g.name = "ground"
    m = bpy.data.materials.new("sand")
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    n1 = nt.nodes.new("ShaderNodeTexNoise"); n1.inputs["Scale"].default_value = 0.08; n1.inputs["Detail"].default_value = 6
    n2 = nt.nodes.new("ShaderNodeTexNoise"); n2.inputs["Scale"].default_value = 3.0; n2.inputs["Detail"].default_value = 8
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = rgb(PAL["groundDark"])
    ramp.color_ramp.elements[1].color = rgb("#8a7a63")
    nt.links.new(tc.outputs["Object"], n1.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], n2.inputs["Vector"])
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.25
    nt.links.new(n2.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.95
    g.data.materials.append(m)
    return g


def ridge(at=(0, 300, 0), length=900, depth=120, height=45, seed=3, color="#5a4a3c"):
    """A broken ridge line: a displaced grid, tallest along its middle, fading into the ground."""
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=220, y_subdivisions=60, size=1)
    r = bpy.context.object
    r.name = f"ridge{seed}"
    r.scale = (length, depth, 1)
    bpy.ops.object.transform_apply(scale=True)
    # Skyline: a few seeded sine octaves along the ridge, flattened on top into mesas, falling
    # off across it with a steep front face. Deterministic: same seed, same skyline.
    import random
    rng = random.Random(seed)
    waves = [(rng.uniform(0.5, 1.0) / (i + 1), rng.uniform(1.5, 3.0) * (i + 1) ** 1.7, rng.uniform(0, 6.28)) for i in range(5)]
    for v in r.data.vertices:
        u = v.co.x / length + 0.5
        sky_h = 0.55 + sum(a * math.sin(f * u * 6.283 + ph) for a, f, ph in waves) * 0.45
        sky_h = min(1.0, max(0.15, sky_h))
        sky_h = min(sky_h, 0.82) + max(0, sky_h - 0.82) * 0.2  # mesa tops
        y = v.co.y / (depth / 2)  # -1 front .. 1 back
        across = max(0.0, 1 - abs(y + 0.2) ** 2.5) if y > -0.2 else max(0.0, 1 - ((-0.2 - y) / 0.8) ** 0.7)
        v.co.z = sky_h * across * height
    r.location = at
    r.data.materials.append(mat("rock", color, rough=0.95))
    bpy.ops.object.shade_smooth()
    return r


def rocks(n=60, x=(-20, 20), y=(-14, 10), size=(0.08, 0.5), seed=7, color="#5b4d40"):
    """Seeded scatter of low, flattened stones so near ground has texture and depth."""
    import random
    rng = random.Random(seed)
    m = mat("stone", color, rough=0.9)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=1)
    proto = bpy.context.object
    proto.data.materials.append(m)
    tex = bpy.data.textures.new("stone", "VORONOI")
    d = proto.modifiers.new("disp", "DISPLACE")
    d.texture, d.strength = tex, 0.3
    bpy.ops.object.shade_smooth()
    for i in range(n):
        o = proto.copy()
        bpy.context.scene.collection.objects.link(o)
        s = rng.uniform(*size) * (1 + 2 * rng.random() ** 6)
        o.scale = (s * rng.uniform(0.8, 1.6), s * rng.uniform(0.8, 1.4), s * rng.uniform(0.35, 0.7))
        o.location = (rng.uniform(*x), rng.uniform(*y), -s * 0.15)
        o.rotation_euler = (rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0, 6.28))
    bpy.data.objects.remove(proto)


def fcurves(obj):
    """F-curves of an object's action (Blender 5 keeps them in a slot's channel bag)."""
    act = obj.animation_data.action
    try:
        from bpy_extras import anim_utils
        return anim_utils.action_get_channelbag_for_slot(act, obj.animation_data.action_slot).fcurves
    except Exception:
        return act.fcurves


def dust(n=150, x=(-8, 8), y=(-12, 4), z=(0.05, 3), loop=180, fps=30, wind=(2.0, 0.3, 0.1), seed=11, color="#cdb998"):
    """Wind-blown dust motes that loop seamlessly: each crosses its span exactly once per loop
    and wraps where the frame can't see it (the span is centred on x and as long as the wind
    carries a mote in one loop)."""
    import random
    rng = random.Random(seed)
    m = mat("dust", color, rough=1.0)
    secs = loop / fps
    span = Vector(wind) * secs
    xc = (x[0] + x[1]) / 2
    for i in range(n):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=rng.uniform(0.003, 0.009))
        o = bpy.context.object
        o.data.materials.append(m)
        start = Vector((xc - span.x / 2, rng.uniform(*y), rng.uniform(*z)))
        phase = rng.random()
        fa = 1 - phase * loop
        o.location = start
        o.keyframe_insert("location", frame=fa)
        o.location = start + span
        o.keyframe_insert("location", frame=fa + loop)
        for fc in fcurves(o):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
            fc.modifiers.new("CYCLES")


def sky(horizon="#e2b98f", zenith="#4c4658", haze=0.0025, haze_color=None, sun_dir=None):
    w = bpy.data.worlds.new("sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes["Background"]
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    mr = nt.nodes.new("ShaderNodeMapRange")
    mr.inputs["From Min"].default_value, mr.inputs["From Max"].default_value = -0.05, 0.6
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = rgb(horizon)
    ramp.color_ramp.elements[1].color = rgb(zenith)
    nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
    nt.links.new(mr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    bg.inputs["Strength"].default_value = 1.0
    if haze:
        # A bounded box of haze over the set: a world volume would also swallow the sky.
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 200, 12))
        box = bpy.context.object
        box.name = "haze"
        box.scale = (2400, 700, 24)
        m = bpy.data.materials.new("haze")
        m.use_nodes = True
        mt = m.node_tree
        mt.nodes.remove(mt.nodes["Principled BSDF"])
        vol = mt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Density"].default_value = haze
        vol.inputs["Color"].default_value = rgb(haze_color or horizon)
        mt.links.new(vol.outputs["Volume"], mt.nodes["Material Output"].inputs["Volume"])
        box.data.materials.append(m)
    return w


def sun(elevation=8, azimuth=-60, strength=4.0, color="#ffb27a", angle=2.0):
    d = bpy.data.lights.new("sun", "SUN")
    d.energy, d.color, d.angle = strength, rgb(color)[:3], math.radians(angle)
    o = bpy.data.objects.new("sun", d)
    bpy.context.scene.collection.objects.link(o)
    o.rotation_euler = (math.radians(90 - elevation), 0, math.radians(azimuth))
    return o


def point(at, color, power, radius=0.5, name="light"):
    d = bpy.data.lights.new(name, "POINT")
    d.energy, d.color, d.shadow_soft_size = power, rgb(color)[:3], radius
    d.volume_factor = 0.05
    o = bpy.data.objects.new(name, d)
    bpy.context.scene.collection.objects.link(o)
    o.location = at
    return o


def reactor_glow(root, diameter, power=60000, color="#ff8a2e"):
    """Orange plasma in the reactor's open well plus the light it throws."""
    loc = root.location
    h = diameter * 0.44
    bpy.ops.mesh.primitive_cylinder_add(radius=diameter * 0.2, depth=0.4, location=(loc.x, loc.y, loc.z + h * 0.92))
    c = bpy.context.object
    c.name = "plasma"
    c.data.materials.append(mat("plasma", "#ff7a1c", emit="#ff8a2e", strength=60))
    return point((loc.x, loc.y, loc.z + h * 1.4), color, power, radius=diameter * 0.15, name="reactor_light")


def camera(at, look, lens=35, name="cam"):
    c = bpy.data.cameras.new(name)
    c.lens = lens
    c.clip_end = 5000
    o = bpy.data.objects.new(name, c)
    bpy.context.scene.collection.objects.link(o)
    o.location = at
    aim(o, look)
    bpy.context.scene.camera = o
    return o


def aim(obj, look):
    d = Vector(look) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def game_camera(look, view_w=24.0, aspect=9 / 16, dist=400.0):
    """The in-game camera (render-3d units.ts: 30° pitch, 45° yaw, near-orthographic) framing
    `view_w` metres across, so a shot can end exactly where live play begins."""
    p, y = math.radians(30), math.radians(45)
    lx, ly, lz = look
    at = (lx + math.sin(y) * math.cos(p) * dist, ly - math.cos(y) * math.cos(p) * dist, lz + math.sin(p) * dist)
    o = camera(at, look, lens=50)
    o.data.sensor_fit = "HORIZONTAL"
    o.data.lens = o.data.sensor_width * dist / view_w
    return o


def bloom(threshold=1.0, size=7, mix=0.0):
    """Soft glow around bright lights (reactor, pulse) via the compositor's Glare node."""
    sc = bpy.context.scene
    try:  # Blender 5: the compositor is a node group on the scene
        tree = bpy.data.node_groups.new("comp", "CompositorNodeTree")
        sc.compositing_node_group = tree
        rl = tree.nodes.new("CompositorNodeRLayers")
        out = tree.nodes.new("NodeGroupOutput")
        tree.interface.new_socket("Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    except Exception:
        sc.use_nodes = True
        tree = sc.node_tree
        for n in list(tree.nodes): tree.nodes.remove(n)
        rl = tree.nodes.new("CompositorNodeRLayers")
        out = tree.nodes.new("CompositorNodeComposite")
    g = tree.nodes.new("CompositorNodeGlare")
    for attr, val in (("glare_type", "BLOOM"), ("glare_type", "FOG_GLOW"), ("threshold", threshold), ("size", size), ("mix", mix)):
        try: setattr(g, attr, val)
        except Exception: pass
    for name, val in (("Type", "Bloom"), ("Threshold", threshold), ("Size", size / 10), ("Strength", 0.7)):
        if name in g.inputs:
            try: g.inputs[name].default_value = val
            except Exception: pass
    tree.links.new(rl.outputs["Image"], g.inputs["Image"])
    tree.links.new(g.outputs["Image"], out.inputs[0])


def render_still(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    sc = bpy.context.scene
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("wrote", path)


def render_frames(folder, start, end):
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = start, end
    sc.render.filepath = os.path.join(folder, "f_")
    bpy.ops.render.render(animation=True)
    print("wrote frames", folder)
