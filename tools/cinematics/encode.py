# Encode a rendered frame folder to an H.264 MP4 for iOS (yuv420p, 30 fps) plus a poster PNG,
# with Blender's own FFmpeg.
# blender -b --factory-startup -P tools/cinematics/encode.py -- out/title_loop out/title_loop.mp4 [kbps]
import os, shutil, sys, bpy

HERE = os.path.dirname(os.path.abspath(__file__))
args = sys.argv[sys.argv.index("--") + 1:]
src, dst = os.path.join(HERE, args[0]), os.path.join(HERE, args[1])
kbps = int(args[2]) if len(args) > 2 else 1800

frames = sorted(f for f in os.listdir(src) if f.endswith(".png"))
first = bpy.data.images.load(os.path.join(src, frames[0]))
w, h = first.size

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
sc.render.fps = 30
sc.frame_start, sc.frame_end = 1, len(frames)
sc.view_settings.view_transform = "Standard"  # frames are already display-referred
seq = sc.sequence_editor_create()
strips = seq.strips if hasattr(seq, "strips") else seq.sequences
s = strips.new_image("frames", os.path.join(src, frames[0]), channel=1, frame_start=1)
for f in frames[1:]:
    s.elements.append(f)

r = sc.render
if hasattr(r.image_settings, "media_type"):  # Blender 5: video is its own media type
    r.image_settings.media_type = "VIDEO"
r.image_settings.file_format = "FFMPEG"
r.ffmpeg.format = "MPEG4"
r.ffmpeg.codec = "H264"
r.ffmpeg.constant_rate_factor = "NONE"
r.ffmpeg.video_bitrate = kbps
r.ffmpeg.maxrate = int(kbps * 1.5)
r.ffmpeg.gopsize = 30
r.ffmpeg.ffmpeg_preset = "BEST"
r.ffmpeg.audio_codec = "NONE"
r.use_sequencer = True
r.filepath = dst
bpy.ops.render.render(animation=True)
# Blender appends the frame range to the name; settle on the requested one
base, ext = os.path.splitext(dst)
for f in os.listdir(os.path.dirname(dst)):
    p = os.path.join(os.path.dirname(dst), f)
    if f.startswith(os.path.basename(base)) and f.endswith(ext) and p != dst:
        shutil.move(p, dst)
shutil.copy(os.path.join(src, frames[0]), base + ".poster.png")
print("wrote", dst, os.path.getsize(dst) // 1024, "KB")
