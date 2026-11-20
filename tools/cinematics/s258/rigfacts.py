import os, sys, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import bpy, lib
lib.reset(360, 640)
c = lib.place("unit.player", at=(0,0,0), yaw=0, height=1.8, name="commander", rigged=True)
lib.still(c)
arm = bpy.data.objects[c["armature"]]
bpy.context.view_layer.update()
print("ROOT scale", c.scale[0], "arm scale", tuple(arm.scale), "arm rot", tuple(arm.rotation_euler), "parent", arm.parent.name if arm.parent else None)
for n in ["Hips","Spine2","Neck","Head","LeftShoulder","LeftArm","LeftForeArm","LeftHand","RightArm","RightForeArm","RightHand","LeftUpLeg","LeftLeg","LeftFoot","LeftToeBase","RightUpLeg","RightLeg","RightFoot","RightToeBase"]:
    b = arm.pose.bones.get("mixamorig:"+n)
    if b: print(n, [round(v,3) for v in (arm.matrix_world @ b.head)], "->", [round(v,3) for v in (arm.matrix_world @ b.tail)])
print("headfront", [round(v,3) for v in arm.matrix_world @ arm.pose.bones["headfront"].head])
print("meshes", c["meshes"], [a.name for a in bpy.data.actions][:3])
