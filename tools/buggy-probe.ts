// Scratch: where do the body's axle discs sit? Prints, for each hub guess, the z range and the
// centroid of body vertices within `rad` of the guess in the xy plane (the brake discs and stubs).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { flatten, transformMesh } from "@gltf-transform/functions";

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]!);
await doc.transform(flatten());
const pts: number[][] = [];
for (const n of doc.getRoot().listNodes()) {
  const m = n.getMesh();
  if (!m) continue;
  transformMesh(m, n.getWorldMatrix());
  for (const pr of m.listPrimitives()) { const a = pr.getAttribute("POSITION")!; for (let i = 0; i < a.getCount(); i++) pts.push(a.getElement(i, [])); }
}
for (const [hx, hy] of [[-1.61, 0.225], [1.29, 0.225]] as const) {
  for (const side of [1, -1]) {
    const s = pts.filter((p) => p[2]! * side > 0.3 && Math.hypot(p[0]! - hx, p[1]! - hy) < 0.3);
    if (!s.length) { console.log(hx, side, "none"); continue; }
    const mean = (k: number): number => s.reduce((t, p) => t + p[k]!, 0) / s.length;
    const zs = s.map((p) => p[2]!).sort((a, b) => a - b);
    console.log("hub guess", hx, hy, "side", side, "n", s.length, "mean", [mean(0), mean(1), mean(2)].map((v) => +v.toFixed(3)), "z p5..p95", +zs[Math.floor(zs.length * 0.05)]!.toFixed(3), +zs[Math.floor(zs.length * 0.95)]!.toFixed(3));
  }
}
