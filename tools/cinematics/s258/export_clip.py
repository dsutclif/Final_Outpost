# Bake the IK/constraint pose to plain bone keys and export the commander with the clip as a glb action.
# blender -b out/s258/kneel_lift.blend -P export_clip.py -- OUT.glb
import bpy, sys
out = sys.argv[sys.argv.index("--") + 1]
arm = bpy.data.objects["target_character"] if "target_character" in bpy.data.objects else next(o for o in bpy.data.objects if o.type == "ARMATURE")
for o in bpy.data.objects: o.select_set(False)
bpy.context.view_layer.objects.active = arm; arm.select_set(True)
bpy.ops.object.mode_set(mode="POSE"); bpy.ops.pose.select_all(action="SELECT")
bpy.ops.nla.bake(frame_start=1, frame_end=96, only_selected=True, visual_keying=True, clear_constraints=True, use_current_action=True, bake_types={"POSE"})
bpy.ops.object.mode_set(mode="OBJECT")
arm.animation_data.action.name = "Kneel_Lift_Helmet"
for o in bpy.data.objects: o.select_set(False)
keep = [arm] + [o for o in bpy.data.objects if o.type == "MESH" and o.parent and o.parent.name != "anchor" and o.name in ("output_unwrapped",)]
for o in keep: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_animations=True, export_current_frame=False, export_force_sampling=True, export_frame_range=True)
print("exported", out, [(a.name, tuple(a.frame_range)) for a in bpy.data.actions if a.name.startswith("Kneel")])
