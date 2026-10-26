# Pose lab: copies of the commander side-on, each with one trial pose, to learn the rig's axes.
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lib

lib.reset(1280, 400)
lib.sky(horizon="#cccccc", zenith="#999999", haze=0)
lib.sun(elevation=40, azimuth=180, strength=4, color="#ffffff")
lib.ground()
trials = [
    {},
    {"LeftUpLeg": (-60, 0, 0), "RightUpLeg": (-60, 0, 0)},
    {"LeftLeg": (90, 0, 0), "RightLeg": (90, 0, 0)},
    {"LeftUpLeg": (-90, 0, 0), "RightUpLeg": (-90, 0, 0), "LeftLeg": (100, 0, 0), "RightLeg": (100, 0, 0)},
    {"Spine": (40, 0, 0)},
    {"LeftArm": (0, 0, -32), "RightArm": (0, 0, 32), "LeftForeArm": (0, 0, -60), "RightForeArm": (0, 0, 60)},
    {"LeftArm": (60, 0, -32), "RightArm": (60, 0, 32)},
]
for i, t in enumerate(trials):
    c = lib.place("unit.player", at=(i * 1.7 - 5.1, 0, 0), yaw=-90, height=1.8)
    lib.still(c)
    lib.pose(c, t)
lib.camera((0, -14, 1.0), (0, 0, 0.9), lens=35)
lib.render_still(os.path.join(lib.OUT, "posetest.png"))
