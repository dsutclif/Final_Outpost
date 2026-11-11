# The film's full-detail wreck that matches the game's (Doug 2026-11-10: "the highest-quality version of the ship wreckage").
# The game's decor.halcyon_wreck is a decimated copy (100 k triangles) of Doug's Meshy Halcyon_Wreck.glb (6.1 M) with the
# loose debris near the camp removed. This keeps every loose part of the original whose surface lies on the game copy's
# (so the same pieces, at full detail and the original textures) and drops the rest; saved to cache/halcyon_wreck_full.glb,
# which game_set.py uses for final renders (GAME_LOOK=1).
# blender -b --factory-startup -P tools/cinematics/wreck_prep.py
import os, sys, random
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
import lib, game_set

OUT = os.path.join(lib.CACHE, "halcyon_wreck_full.glb")
NEAR = float(os.environ.get("WRECK_NEAR", 0.25))   # metres (at the game's 27 m size): a sample this close to the game copy is on it
KEEP = float(os.environ.get("WRECK_KEEP", 0.6))    # share of a part's samples that must be on the game copy

lib.reset(64, 64)
game = lib.place(os.path.join(lib.MODELS, "decor.halcyon_wreck.glb"), size=game_set.WRECK_M, name="game")
orig = lib.place(game_set.ORIGINAL_WRECK, size=game_set.WRECK_M, name="orig")
orig["ext"] = game_set.WRECK_M / orig.scale.x  # the original's largest horizontal extent in its own units
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
gv, gp = [], []
for name in game["meshes"]:
    o = bpy.data.objects[name]; me = o.evaluated_get(dg).to_mesh(); me.calc_loop_triangles(); b = len(gv)
    gv += [o.matrix_world @ v.co for v in me.vertices]; gp += [tuple(b + i for i in t.vertices) for t in me.loop_triangles]
gbvh = BVHTree.FromPolygons(gv, gp)
om = bpy.data.objects[orig["meshes"][0]]
mw = om.matrix_world.copy()
bm = bmesh.new(); bm.from_mesh(om.data)
bm.verts.ensure_lookup_table()
# loose parts by flood fill over edges
seen, parts = set(), []
for v in bm.verts:
    if v.index in seen: continue
    stack, part = [v], []
    seen.add(v.index)
    while stack:
        a = stack.pop(); part.append(a.index)
        for e in a.link_edges:
            b = e.other_vert(a)
            if b.index not in seen: seen.add(b.index); stack.append(b)
    parts.append(part)
rng = random.Random(1)
drop = set()
kept_t = dropped_t = 0
for part in parts:
    smp = part if len(part) <= 60 else rng.sample(part, 60)
    on = sum(1 for i in smp if gbvh.find_nearest(mw @ bm.verts[i].co, NEAR)[0] is not None)
    if on / len(smp) < KEEP:
        drop.update(part); dropped_t += len(part)
    else: kept_t += len(part)
print(f"WRECKPREP parts {len(parts)}: kept {len(parts) - sum(1 for p in parts if p[0] in drop)} ({kept_t} verts), dropped {sum(1 for p in parts if p[0] in drop)} ({dropped_t} verts)")
bmesh.ops.delete(bm, geom=[bm.verts[i] for i in drop], context="VERTS")
bm.to_mesh(om.data); bm.free()
for name in game["meshes"]: bpy.data.objects.remove(bpy.data.objects[name])
bpy.data.objects.remove(game)
# back to the original's own frame (unscaled, as authored) so lib.place fits it exactly as it fits the original
orig.scale = (1, 1, 1); orig.location = (0, 0, 0)
for o in bpy.data.objects: o.select_set(o.type == "MESH")
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_format="GLB")
print("WRECKPREP saved", OUT, os.path.getsize(OUT) // 1_000_000, "MB")
import json
# the fit lib.place gave the whole original (largest horizontal extent, as authored): game_set.py scales the pruned copy by it,
# since dropping parts may shrink the copy's own box
json.dump({"ext": orig["ext"]}, open(OUT.replace(".glb", ".json"), "w"))
