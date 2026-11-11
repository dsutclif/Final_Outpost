# crash_open rework, stage 1: the crash site built from level 1's own placements (levels/story/story-L001.json),
# with a stand-in commander, rendered as fast Workbench stills from each planned camera, so Doug can approve the
# set and framing before any animation or full render. Origin = the commander's pod; metres; x east, y north.
# blender -b --factory-startup -P tools/cinematics/game_set.py -- [--out out/game_set]
import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy
from mathutils import Matrix, Vector
import lib

M = 28.0  # world units per metre (ART_M)
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = os.path.join(lib.HERE, args[args.index("--out") + 1] if "--out" in args else "out/game_set")
LEVEL = os.path.join(lib.ROOT, "levels", "story", "story-L001.json")

# sizes in metres (docs/SCALE.md, render-3d/src/sizes.ts)
SCRAP_DX = -100 / M  # the held level edit (#48): the tube scrap moves 100 units west, off the commander's end spot
POD_BURY = float(os.environ.get("POD_BURY", 0.30))  # metres of the pod's base below the sand (docs/SCALE.md: 0.80; Doug 2026-11-08: too deep)
WRECK_M, POD_M, TUBE_M_PER_SCALE, CORE_H, ORE_M, CMD_H = 27.0, 2.66, 2.8, 1.70, 0.95, 1.98


def load():
    lv = json.load(open(LEVEL, encoding="utf-8"))
    by = {e.get("id"): e for e in lv["entities"] if e.get("id")}
    o = by["pod0"]["at"]
    to_m = lambda at: Vector(((at[0] - o[0]) / M, -(at[1] - o[1]) / M, 0))
    return lv, by, to_m


def build(scenery=True):
    lv, by, to_m = load()
    S = {}
    # final renders (GAME_LOOK=1): the original Meshy wreck at full detail (6.1 M triangles, the source of the game's 100 k copy,
    # pruned to the pieces the game copy keeps: wreck_prep.py) and the game's own sand over the far ground
    hi = os.environ.get("GAME_LOOK") == "1"
    if hi:
        S["sand"] = game_sand(lv, by["pod0"]["at"])
        for g in [ob for ob in bpy.data.objects if ob.name.startswith("ground")]:
            g.location.z -= 0.25  # the far ground stays as the horizon, under the game's sand (which falls 0.2 m at its edges)
    full = os.path.join(lib.CACHE, "halcyon_wreck_full.glb")  # wreck_prep.py: the original, pruned to the game copy's pieces
    w_at, w_yaw = tuple(to_m(by["wreck"]["at"])), by["wreck"].get("yaw", 0)
    if hi and os.path.exists(full):
        print("WRECK model", full, "(from", ORIGINAL_WRECK + ")")
        S["wreck"] = lib.place(full, at=w_at, yaw=w_yaw, exact=True, name="wreck")
        k = WRECK_M / json.load(open(full.replace(".glb", ".json")))["ext"]
        S["wreck"].scale = (k, k, k)
    else:
        if hi: print("WRECK model: run wreck_prep.py first; using the game's copy")
        S["wreck"] = lib.place("decor.halcyon_wreck", at=w_at, yaw=w_yaw, size=WRECK_M, name="wreck")
    # pods: the game sinks each 0.80 m (lift); the glass shares the pod's scale and sits at its own lift/roll
    pods = []
    for i in range(3):
        p, g = by[f"pod{i}"], by[f"lid{i}"]
        pod = lib.place("decor.stasis_pod", at=tuple(to_m(p["at"])), yaw=p.get("yaw", 0), size=POD_M, name=f"pod{i}")
        pod.location.z = -POD_BURY
        k = pod.scale.x
        lid = lib.place("decor.stasis_glass", at=tuple(to_m(g["at"])), yaw=g.get("yaw", 0), name=f"lid{i}")
        lid.scale = (k, k, k)
        lid.location.z = g.get("lift", 0) / M + (0.80 - POD_BURY)
        if g.get("roll"):
            lid.rotation_euler = (0, math.radians(g["roll"]), math.radians(g.get("yaw", 0)))
        pods.append(pod)
    S["pods"] = pods
    for sid in ("scrap", "scrap2"):
        e = by.get(sid)
        if e: lib.place(e["type"], at=tuple(to_m(e["at"]) + Vector((SCRAP_DX, 0, 0))), yaw=e.get("yaw", 0), size=TUBE_M_PER_SCALE * e.get("scale", 1), name=sid)
    core = next(e for e in lv["entities"] if e["type"] == "sink.core")
    S["core_at"] = to_m(core["at"])  # where the light is; the film keeps the reactor and ore out of shot (level 1 lets you find them)
    if scenery:
        S["core"] = lib.place("sink.core.l1", at=tuple(to_m(core["at"])), height=CORE_H, name="reactor")
        for e in [e for e in lv["entities"] if e["type"] == "node.fuel_scrap"][:6]:
            lib.place("node.fuel_scrap", at=tuple(to_m(e["at"])), size=ORE_M)
    terrain = [e for e in lv["entities"] if e["type"] == "zone.terrain" and e.get("rect")]
    if os.environ.get("RIDGE_ONLY"):  # a shot can keep just some ridges (id prefixes, comma separated)
        keep = tuple(os.environ["RIDGE_ONLY"].split(","))
        terrain = [e for e in terrain if e["id"].startswith(keep)]
    if os.environ.get("RIDGE_ROCKS", "1") == "1":
        S["rocks"] = ridge_rocks(terrain, to_m)
    else:  # the old stand-in: level 1's terrain rects as low raised blocks (1.5 m)
        for e in terrain:
            x, y, w, h = e["rect"]
            c = to_m([x + w / 2, y + h / 2])
            bpy.ops.mesh.primitive_cube_add(size=1, location=(c.x, c.y, 0.75))
            b = bpy.context.object
            b.scale = (w / M, h / M, 1.5)
            b.data.materials.append(lib.mat("ridge", "#5a4a3c"))
    return S


SAND_TOKENS = ("#645849", "#706352", "#544a3e")  # skins mars_greenhouse ground, groundAlt, groundDark
MODEL_BRIGHTNESS = 2.0  # content/data/look.json modelBrightness (the sand takes half of it: environment.ts sandColors)
ORIGINAL_WRECK = os.path.normpath(os.path.join(lib.ROOT, "..", "Asset workflow", "3D Models", "Halcyon_Wreck.glb"))


def _noise(x, y, seed):  # render-3d/src/scene/environment.ts noise: seeded value noise in [0, 1]
    xi, yi = math.floor(x), math.floor(y)
    xf, yf = x - xi, y - yi
    h = lambda a, b: _hash01(a * 57.1 + b * 113.3 + seed * 7.7)
    u, v = xf * xf * (3 - 2 * xf), yf * yf * (3 - 2 * yf)
    a, b, c, d = h(xi, yi), h(xi + 1, yi), h(xi, yi + 1), h(xi + 1, yi + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v


def game_sand(lv, o):
    """Doug 2026-11-10: the film's sand is the game's sand. The game draws no image texture: environment.ts buildGround
    colours a grid (one vertex every ~30 world units over the map and 900 units round it) from two octaves of seeded value
    noise between the skin's three sand tokens, darkening outside the map, and materials.ts addWear multiplies in a grain
    and blotch noise per pixel (wear 0.9). Same grid, same noise and colours here; the wear as Blender noise at the same
    scales (art metres). o: pod0's game position (the film's origin)."""
    import bmesh
    W, H, seed = lv["map"]["w"], lv["map"]["h"], lv.get("seed", 1)
    EDGE = 900
    gw, gh = W + EDGE * 2, H + EDGE * 2
    sx, sy = round(gw / 30), round(gh / 30)
    k = 1 + 0.5 * (MODEL_BRIGHTNESS - 1)
    g0, g1, g2 = [Vector(lib.rgb(h)[:3]) * k for h in SAND_TOKENS]  # three.js Color(hex): linear, then multiplyScalar
    bm = bmesh.new()
    col = bm.verts.layers.float_color.new("sand")
    grid = []
    for j in range(sy + 1):
        row = []
        for i in range(sx + 1):
            x, z = -EDGE + i * gw / sx, -EDGE + j * gh / sy
            n = _noise(x / 90, z / 90, seed) * 0.65 + _noise(x / 28, z / 28, seed + 3) * 0.35
            c = g0.lerp(g1, max(0, n - 0.35) * 1.6)
            if n < 0.3: c = c.lerp(g2, (0.3 - n) * 1.6)
            ox, oz = max(0, -x, x - W), max(0, -z, z - H)
            out = min(1, math.hypot(ox, oz) / 260)
            c = c.lerp(g2, out * 0.55)
            yv = -out * 6 + (n - 0.5) * 3 * out
            v = bm.verts.new(((x - o[0]) / M, -(z - o[1]) / M, yv / M))
            v[col] = (c.x, c.y, c.z, 1.0)
            row.append(v)
        grid.append(row)
    for j in range(sy):
        for i in range(sx):
            # three's PlaneGeometry splits each cell a-b-d / b-c-d; keep that diagonal (it shapes the colour blend)
            a, b, c_, d = grid[j][i], grid[j + 1][i], grid[j + 1][i + 1], grid[j][i + 1]
            bm.faces.new((a, d, b)); bm.faces.new((b, d, c_))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("game_sand"); bm.to_mesh(me); bm.free()
    me.color_attributes.active_color = me.color_attributes["sand"]; me.color_attributes.render_color_index = me.color_attributes.find("sand")
    for f in me.polygons:
        if f.normal.z < 0: f.flip()
    ob = bpy.data.objects.new("game_sand", me)
    bpy.context.scene.collection.objects.link(ob)
    m = bpy.data.materials.new("game_sand")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    at = nt.nodes.new("ShaderNodeVertexColor"); at.layer_name = "sand"
    tc = nt.nodes.new("ShaderNodeTexCoord")
    def nz(scale, offset=0.0):
        mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Location"].default_value = (offset, offset, offset)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        t = nt.nodes.new("ShaderNodeTexNoise"); t.inputs["Scale"].default_value = scale; t.inputs["Detail"].default_value = 0.0
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
        return t.outputs["Fac"]
    def math_(op, a, b):
        n_ = nt.nodes.new("ShaderNodeMath"); n_.operation = op
        for i_, x_ in enumerate((a, b)):
            if isinstance(x_, (int, float)): n_.inputs[i_].default_value = x_
            else: nt.links.new(x_, n_.inputs[i_])
        return n_.outputs[0]
    # k = 1 + 0.9 * (grain * 0.16 + blot * 0.22); grain = n(p 22) - 0.5; blot = n(p 2.6 + 7) 0.6 + n(p 6) 0.4 - 0.5
    grain = math_("SUBTRACT", nz(22.0), 0.5)
    blot = math_("SUBTRACT", math_("ADD", math_("MULTIPLY", nz(2.6, 7.0 / 2.6), 0.6), math_("MULTIPLY", nz(6.0), 0.4)), 0.5)
    kk = math_("ADD", 1.0, math_("MULTIPLY", math_("ADD", math_("MULTIPLY", grain, 0.16), math_("MULTIPLY", blot, 0.22)), 0.9))
    mix = nt.nodes.new("ShaderNodeVectorMath"); mix.operation = "SCALE"
    nt.links.new(at.outputs["Color"], mix.inputs[0]); nt.links.new(kk, mix.inputs["Scale"])
    nt.links.new(mix.outputs["Vector"], bsdf.inputs["Base Color"])
    me.materials.append(m)
    return ob


def _hash01(n):  # render-3d/src/assets/scatter.ts hash01
    v = math.sin(n * 127.1 + 311.7) * 43758.5453
    return v - math.floor(v)


def ridge_rocks(terrain, to_m):
    """The game's ridges exactly as renderer.ts draws them once the Rockslide model has loaded: tiles of zone.blocked along
    each rect's long axis, overlapping, each turned and sized from the same seeded hash (game units / M = film metres)."""
    src = lib.place("zone.blocked", name="rockslide_src", exact=True)
    if src is None: return []
    meshes = [bpy.data.objects[n] for n in src["meshes"]]
    bpy.context.view_layer.update()
    # the model in its own units (art metres), its footprint centred: renderer.ts scales x and depth to 1, keeps the height
    pts = [o.matrix_world @ v.co for o in meshes for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    bx, by_ = hi.x - lo.x, hi.y - lo.y
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    base = [(o, o.matrix_world.copy()) for o in meshes]
    made = []
    for e in terrain:
        kind = e.get("kind", "ridge")
        if kind == "chasm": continue
        x, y, w, h = e["rect"]
        seed = 3 + len(e["id"]) * 5 + round(x + y)
        along_x = w >= h
        long_, short = max(w, h), min(w, h)
        n = max(1, round(long_ / (M * 1.2)))
        seg = long_ / n
        for i in range(n):
            r = _hash01(seed + i * 7.3); q = _hash01(seed * 3 + i * 1.9)
            yaw = (0 if along_x else math.pi / 2) + (math.pi if i % 2 else 0) + (r - 0.5) * 0.3
            a = -long_ / 2 + (i + 0.5) * seg + (q - 0.5) * seg * 0.2
            gx, gy = x + w / 2 + (a if along_x else 0), y + h / 2 + (0 if along_x else a)
            c = to_m([gx, gy])
            sx = seg * (1.2 + r * 0.25) / M / bx
            sy = short * (1.05 + q * 0.2) / M / by_
            sz = 1.8 * (0.85 + q * 0.35)
            # three's rotation about up by yaw is a turn about the film's Z by +yaw (the film's Y is the game's -y)
            T = Matrix.Translation((c.x, c.y, -0.04)) @ Matrix.Rotation(yaw, 4, "Z") @ Matrix.Diagonal((sx, sy, sz, 1)) @ Matrix.Translation((-cx, -cy, -lo.z))
            for o, mw in base:
                t = bpy.data.objects.new(f"rock_{e['id']}_{i}", o.data)
                bpy.context.scene.collection.objects.link(t)
                t.matrix_world = T @ mw
                made.append(t)
    for o in meshes: o.hide_render = True; o.hide_viewport = True
    print(f"RIDGE ROCKS {len(made)} pieces from {sum(1 for e in terrain if e.get('kind', 'ridge') != 'chasm')} ridge rects")
    return made


def stand_in(at, yaw=0.0, name="commander"):
    cmd = lib.place("unit.player", at=tuple(at), yaw=yaw, height=CMD_H, name=name, rigged=True)
    lib.still(cmd)
    for o in cmd.children_recursive:
        if o.type != "MESH": o.hide_render = True
    return cmd


def main():
    sc = lib.reset(540, 960)
    sc.render.engine = "BLENDER_WORKBENCH"
    if sc.world is None: sc.world = bpy.data.worlds.new("sky")
    sc.world.color = (0.30, 0.27, 0.27)  # dim dusk-grey sky, never black
    sh = sc.display.shading
    sh.light, sh.color_type = "STUDIO", "TEXTURE"
    sh.show_shadows = True
    lib.ground()
    S = build()
    pod0 = S["pods"][0].location.copy(); pod0.z = 0
    # where the commander ends up: just out of the pod on its camera side (the game's start), facing the light
    end = pod0 + Vector((0.9, -0.9, 0))
    stand_in(end, yaw=-60)  # facing south-west, toward the reactor's light
    wreck = S["wreck"].location.copy()
    shots = {
        "1_impact_wide": lib.camera(wreck + Vector((-60, -85, 14)), wreck + Vector((0, 0, 3)), lens=30),
        "2_wreck_dawn": lib.camera(pod0 + Vector((-20, -26, 6)), (wreck + pod0) / 2 + Vector((0, 0, 2.5)), lens=30),
        "3_pod_close": lib.camera(pod0 + Vector((3.0, -2.2, 1.7)), pod0 + Vector((0, 0, 0.5)), lens=32),
        "4_step_out": lib.camera(pod0 + Vector((3.6, -3.4, 0.8)), end + Vector((0, 0, 1.0)), lens=30),
        "5_look_light": lib.camera(end + Vector((-3.2, -2.6, 1.5)), end + Vector((0, 0, 1.3)), lens=30),
    }
    for name, cam in shots.items():
        sc.camera = cam
        lib.render_still(os.path.join(OUT, name + ".png"))
    # the hand-off: level 1's openZoom.film framing, 170.3 x 302.8 world units across at the look point
    sc.camera = lib.game_camera(tuple(end + Vector((0, 0, 0.9))), view_w=170.3 / M)
    lib.render_still(os.path.join(OUT, "6_game_handoff.png"))


if __name__ == "__main__":
    main()
