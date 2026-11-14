import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GATE_OPENING, gateDoorFit } from "../src/assets/meshy.js";
import built from "../src/assets/meshy.built.json";

// Doors must fill the airlock frame's whole opening (gap under 3% a side), at every gate size.

const dir = new URL("../../client/public/models/", import.meta.url);
function verts(file: string): number[][] {
  const b = readFileSync(new URL(file, dir));
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  const bin = b.subarray(20 + jl + 8);
  const nd = j.nodes[0], T = nd.translation ?? [0, 0, 0], S = nd.scale ?? [1, 1, 1];
  const a = j.accessors[j.meshes[0].primitives[0].attributes.POSITION], bv = j.bufferViews[a.bufferView];
  const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), st = bv.byteStride ?? 6;
  const out: number[][] = [];
  for (let i = 0; i < a.count; i++) out.push([0, 1, 2].map((k) => (bin.readInt16LE(off + i * st + 2 * k) / 32767) * S[k] + T[k]));
  return out;
}
const median = (a: number[]) => a.sort((x, y) => x - y)[a.length >> 1]!;

describe("airlock doors fill the gate frame", () => {
  const p = verts("struct.gate.glb");
  // measure the opening: at x in the middle of the frame the largest vertical gap is sill..lintel; at heights
  // between the sill and the lintel the largest horizontal gap is the opening width
  const gaps = (vals: number[]) => { vals.sort((x, y) => x - y); let g = [0, 0, 0]; for (let i = 1; i < vals.length; i++) if (vals[i]! - vals[i - 1]! > g[0]!) g = [vals[i]! - vals[i - 1]!, vals[i - 1]!, vals[i]!]; return g; };
  const sills: number[] = [], tops: number[] = [], lefts: number[] = [], rights: number[] = [];
  for (let x = -0.6; x <= 0.61; x += 0.1) { const g = gaps(p.filter((q) => Math.abs(q[0]! - x) < 0.04).map((q) => q[1]!)); sills.push(g[1]!); tops.push(g[2]!); }
  for (let y = 0.6; y <= 1.5; y += 0.15) { const g = gaps(p.filter((q) => Math.abs(q[1]! - y) < 0.04).map((q) => q[0]!)); lefts.push(g[1]!); rights.push(g[2]!); }
  const open = { sill: median(sills), top: median(tops), left: median(lefts), right: median(rights) };

  it("GATE_OPENING matches the frame GLB", () => {
    expect(Math.abs(open.sill - GATE_OPENING.sill)).toBeLessThan(0.03);
    expect(Math.abs(open.top - GATE_OPENING.top)).toBeLessThan(0.03);
    expect(Math.abs(-open.left - GATE_OPENING.halfW)).toBeLessThan(0.03);
    expect(Math.abs(open.right - GATE_OPENING.halfW)).toBeLessThan(0.03);
  });

  it("the door leaf covers the measured opening with under 3% gap each side, at every gate width", () => {
    const door = (built as Record<string, { bounds: number[] }>)["struct.gate.door"]!.bounds;
    const fit = gateDoorFit(door)!;
    expect(fit).not.toBeNull();
    const w = open.right - open.left, h = open.top - open.sill;
    // sx is the gate squeeze the renderer applies to frame and door together (1 = the frame's own width)
    for (const sx of [1, 0.9, 0.75, 0.6]) {
      const dw = (door[3]! - door[0]!) * fit.sx * sx, dh = (door[4]! - door[1]!) * fit.sy;
      const dBottom = fit.y0 + door[1]! * fit.sy, dTop = dBottom + dh;
      const gapSide = (w * sx - dw) / 2 / (w * sx);
      expect(Math.abs(gapSide), `width gap at squeeze ${sx}`).toBeLessThan(0.03);
      expect(Math.abs(dBottom - open.sill) / h, "gap at the sill").toBeLessThan(0.03);
      expect(Math.abs(open.top - dTop) / h, "gap at the lintel").toBeLessThan(0.03);
    }
    // the open sink still hides the whole leaf below the ground
    expect(fit.y0 + (door[4]! * fit.sy) - fit.sink).toBeLessThan(0);
  });
});
