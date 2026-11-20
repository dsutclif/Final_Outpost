# Summarise out/s258/measure.json into the checks reported to Doug.
import json, sys, math
d = json.load(open(sys.argv[sys.argv.index("--") + 1]))["frames"]; g = lambda f, k: d[str(f)][k]
print("minz (lowest mesh vertex) by frame:", {f: g(f, "minz") for f in (1, 9, 17, 22, 25, 30, 33, 36, 40, 46, 64, 80, 96)})
print("minz range all frames: %.4f .. %.4f" % (min(v["minz"] for v in d.values()), max(v["minz"] for v in d.values())))
fl = [d[str(f)]["footL"] for f in range(22, 97)]; print("left foot drift f22-96 (m):", round(max(math.dist(a, fl[0]) for a in fl), 4))
fr = [d[str(f)]["footR"] for f in range(46, 97)]; print("right foot drift f46-96 (m):", round(max(math.dist(a, fr[0]) for a in fr), 4))
print("right knee z f46-96: %.3f..%.3f; toeR z %.3f..%.3f" % (min(g(f, "knee_R_z") for f in range(46, 97)), max(g(f, "knee_R_z") for f in range(46, 97)), min(g(f, "toeR_z") for f in range(46, 97)), max(g(f, "toeR_z") for f in range(46, 97))))
print("heading deg (head front vs head) min/max:", min(v["heading"] for v in d.values()), max(v["heading"] for v in d.values()))
print("heading step max/frame:", max(abs(d[str(f+1)]["heading"] - d[str(f)]["heading"]) for f in range(1, 96)))
print("hand gap to helmet surface (nearest hand bone, m) f64..96 max L/R:", max(g(f, "handL_gap") for f in range(64, 97)), max(g(f, "handR_gap") for f in range(64, 97)))
print("wrist to hold target f70..96 max L/R:", max(g(f, "hand_to_tgtL") for f in range(70, 97)), max(g(f, "hand_to_tgtR") for f in range(70, 97)))
print("end helmet centre", g(96, "helm"), "head", g(96, "head"))
print("per-frame knee/foot z at 25..40:", [(f, g(f, "minz"), g(f, "knee_R_z"), g(f, "lowpos")) for f in (25, 29, 33, 37, 41)])

for k in ("shoulder_yaw","hip_yaw"): print(k, "min/max deg (0 = facing -Y as in the rest pose):", min(v[k] for v in d.values()), max(v[k] for v in d.values()), "max step/frame", max(abs(d[str(f+1)][k]-d[str(f)][k]) for f in range(1,96)))
