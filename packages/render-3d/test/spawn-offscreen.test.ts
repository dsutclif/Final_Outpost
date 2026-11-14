import { existsSync, readFileSync, readdirSync } from "node:fs";
import { CONTENT_VERSION, content } from "@fo/content";
import { ENGINE_VERSION, FP, compile } from "@fo/sim";
import { PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { ART_M, CHAR_K, FOV_DEG, PITCH_DEG, YAW_DEG, viewWFor } from "../src/units.js";

// #83 (Doug): attackers appear outside the camera's view. For every level family with waves and every map size in the
// shipped levels, no spawn point (the closest an attacker ever appears: defense.spawnDistance beyond a map edge, anywhere
// along it) is on screen from any place the game camera can look (renderer followCamera keeps its look point on the map),
// on any phone shape, tall phones included, nor is any part of a body up to TOP tall standing there.

const root = new URL("../../../levels/", import.meta.url);
const dirs = ["golden", "story", ...readdirSync(new URL("packs/", root), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `packs/${d.name}`)];
/** Screen width over height: tall phones (21:9, 19.5:9), 16:9, tablets, square, landscape. */
const ASPECTS = [9 / 21, 9 / 19.5, 9 / 16, 3 / 4, 1, 16 / 9, 19.5 / 9];
/** Tallest attacker drawn (art metres before charScale), with room to spare. */
const TOP = 4 * ART_M * CHAR_K;

type Loose = Record<string, any>;
const maps = new Map<string, Loose>();
for (const d of dirs) {
  const dir = new URL(`${d}/`, root);
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((x) => /\.json$/.test(x) && x !== "pack.json" && x !== "index.json" && x !== "build-log.json")) {
    const m = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Loose;
    if (!Array.isArray(m.waves) || m.waves.length === 0 || !m.map) continue;
    const key = `${m.family} ${m.map.w}x${m.map.h}`;
    if (!maps.has(key)) maps.set(key, { ...m, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION });
  }
}

/** True when a world point (sim x, height, sim y) lands inside the picture of the game camera looking at (lx, ly). */
function viewer(viewW: number, aspect: number) {
  const cam = new PerspectiveCamera(FOV_DEG, aspect, 1, 1e6), pitch = (PITCH_DEG * Math.PI) / 180, yaw = (YAW_DEG * Math.PI) / 180;
  const hfov = 2 * Math.atan(Math.tan((FOV_DEG * Math.PI) / 360) * aspect), d = viewW / 2 / Math.tan(hfov / 2);
  const v = new Vector3(), look = new Vector3();
  return {
    at(lx: number, ly: number): void { // as renderer followCamera, zoom 1
      look.set(lx, 0, ly);
      cam.position.set(lx + Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, ly + Math.cos(yaw) * Math.cos(pitch) * d);
      cam.lookAt(look);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
    },
    sees(x: number, h: number, y: number): boolean {
      v.set(x, h, y).applyMatrix4(cam.matrixWorldInverse);
      if (v.z >= 0) return false; // behind the camera
      v.applyMatrix4(cam.projectionMatrix);
      return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    },
  };
}

describe("attackers spawn out of the camera's view (#83)", () => {
  it("covers every family and map size that has waves", () => {
    expect([...maps.keys()].length).toBeGreaterThan(0);
    expect([...maps.keys()].some((k) => k.startsWith("defend "))).toBe(true);
  });

  for (const [key, m] of maps) {
    it(`${key}: no spawn point is on screen from any look point, any phone shape`, () => {
      const cp = compile(m);
      const W = m.map.w as number, H = m.map.h as number, s = cp.defense.spawnDist / FP;
      expect(s).toBeGreaterThan(Math.abs(cp.defense.spawnY / FP));
      const spots: [number, number][] = [];
      for (let i = 0; i <= 24; i++) {
        const x = (W * i) / 24, y = (H * i) / 24;
        spots.push([x, -s], [x, H + s], [-s, y], [W + s, y]);
      }
      const looks: [number, number][] = [];
      const nx = Math.ceil(W / 40), ny = Math.ceil(H / 40);
      for (let i = 0; i <= nx; i++) for (let j = 0; j <= ny; j++) looks.push([(W * i) / nx, (H * j) / ny]);
      const seen: string[] = [];
      for (const aspect of ASPECTS) {
        const cam = viewer(viewWFor(m.family), aspect);
        for (const [lx, ly] of looks) {
          cam.at(lx, ly);
          for (const [x, y] of spots) for (let k = 0; k <= 8; k++) {
            if (cam.sees(x, (TOP * k) / 8, y)) { seen.push(`aspect ${aspect.toFixed(2)} look (${lx},${ly}) sees (${x},${y})`); break; }
          }
          if (seen.length > 3) break;
        }
      }
      expect(seen).toEqual([]);
    });
  }

  it("the sim's world metre is the renderer's", () => {
    expect(content.defaults["world.metre"]).toBe(ART_M);
  });
});
