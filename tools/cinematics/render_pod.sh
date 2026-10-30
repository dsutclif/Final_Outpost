#!/bin/bash
# Render crash.py's pod sequence in short Blender sessions, then redo whatever glitch.py flags (see there).
# Run from tools/cinematics. Frames already on disk are kept.
B="/c/Program Files/Blender Foundation/Blender 5.2/blender.exe"
LAST=709; STEP=100
for round in 1 2 3 4; do
  for ((a = 1; a <= LAST; a += STEP)); do
    b=$((a + STEP - 1)); missing=0
    for ((f = a; f <= b && f <= LAST; f++)); do [ -f "$(printf 'out/crash_pod/f_%04d.png' "$f")" ] || missing=1; done
    if [ "$missing" = 1 ]; then "$B" -b --factory-startup -P crash.py -- --shot 4 --range "$a,$b" > out/render_pod.log 2>&1; echo "range $a-$b exit $?"; fi
  done
  [ "$round" = 4 ] && break
  "$B" -b --factory-startup -P glitch.py -- out/crash_pod --delete 2>&1 | grep GLITCH | cut -c1-400
done
"$B" -b --factory-startup -P crash.py -- --shot 4 --range 1,1 > out/render_pod.log 2>&1
grep "crash_open frames" out/render_pod.log
"$B" -b --factory-startup -P glitch.py -- out/crash_pod 2>&1 | grep GLITCH
