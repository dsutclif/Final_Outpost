import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FP, createSim, type State } from "@fo/sim";
import { HUMAN, LADDER, PROFILES, Perception, VIEW, playBot } from "../src/index.js";
import level1 from "../../../levels/golden/proto-L001.json";
import level4 from "../../../levels/golden/proto-L004.json";

// The view box is copied from the 3D renderer's camera constants (bots never import render code).
const units = readFileSync(new URL("../../render-3d/src/units.ts", import.meta.url), "utf8");
const unit = (name: string): number => Number(new RegExp(`export const ${name} = ([\\d.]+);`).exec(units)![1]);

const fresh = (): State => structuredClone(createSim({ ...(level1 as object), seed: 1 }).state);
/** A ground point `ahead` world units along screen right (+) or screen down (+) from the hero. */
const along = (st: State, right: number, down: number) => {
  const c = Math.SQRT1_2, sinP = Math.sin((VIEW.pitchDeg * Math.PI) / 180);
  const dn = down / sinP; // screen-plane depth back to ground depth
  return { x: st.player.pos.x + Math.round((right * c + dn * c) * FP), y: st.player.pos.y + Math.round((-right * c + dn * c) * FP) };
};

describe("human-view perception", () => {
  it("matches the 3D camera in units.ts", () => {
    expect(VIEW.pitchDeg).toBe(unit("PITCH_DEG"));
    expect(VIEW.yawDeg).toBe(unit("YAW_DEG"));
    expect(VIEW.viewW).toBe(Math.round(unit("VIEW_W") * (VIEW as unknown as { groundK: number }).groundK));
  });

  it("sees the screen box around the hero and nothing beyond its sides", () => {
    const st = fresh(), eye = new Perception();
    const half = VIEW.viewW / 2;
    expect(eye.visible(st.player.pos, along(st, half - 2, 0))).toBe(true);
    expect(eye.visible(st.player.pos, along(st, -(half - 2), 0))).toBe(true);
    expect(eye.visible(st.player.pos, along(st, half + 2, 0))).toBe(false);
    expect(eye.visible(st.player.pos, along(st, 0, VIEW.viewW * VIEW.aspect))).toBe(false);
    // the hero sits below the centre: more of the screen is above than below
    const h = VIEW.viewW * VIEW.aspect;
    expect(eye.visible(st.player.pos, along(st, 0, -(h / 2 + 1)))).toBe(true);
    expect(eye.visible(st.player.pos, along(st, 0, h / 2 - 1))).toBe(false);
  });

  it("remembers off-screen stock as last seen and updates it once back on screen", () => {
    const st = fresh(), eye = new Perception();
    eye.overview(st);
    const i = st.nodes.findIndex((n) => n.stock !== null && n.stock > 0);
    expect(i).toBeGreaterThanOrEqual(0);
    st.player.pos = along(st, 0, 0);
    st.nodes[i]!.pos = along(st, VIEW.viewW, 0);
    const before = st.nodes[i]!.stock;
    eye.see(st);
    st.nodes[i]!.stock = 0;
    expect(eye.see(st).nodes[i]!.stock).toBe(before);
    st.nodes[i]!.pos = along(st, 10, 0);
    expect(eye.see(st).nodes[i]!.stock).toBe(0);
  });

  it("freezes the shop's queue while the shop is off screen", () => {
    const st = fresh(), eye = new Perception();
    expect(st.sales).not.toBeNull();
    st.sales!.pos = along(st, VIEW.viewW, 0);
    st.sales!.register = st.sales!.pos;
    eye.see(st);
    st.sales!.queue.push({ id: 99, kind: "unit.customer", res: st.sales!.sells[0]!, want: 1, patience: 10, patienceMax: 300, pos: st.sales!.pos, angry: false, leg: 0 });
    expect(eye.see(st).sales!.queue.some((q) => q.id === 99)).toBe(false);
    st.sales!.pos = st.player.pos;
    expect(eye.see(st).sales!.queue.some((q) => q.id === 99)).toBe(true);
  });

  it("shows off-screen attackers only as the nearest one per edge pointer", () => {
    const st = fresh(), eye = new Perception();
    const h = (id: number, right: number) => ({ id, type: "unit.hostile", pos: along(st, right, 0), hp: 1, hpMax: 1, side: "e" as const, target: "core" as const, acc: 0 });
    st.hostiles = [h(1, 20), h(2, VIEW.viewW), h(3, VIEW.viewW * 1.5), h(4, -VIEW.viewW)];
    expect(eye.see(st).hostiles.map((x) => x.id).sort()).toEqual([1, 2, 4]);
  });

  it("never changes the sim: the good bot replays identically and the sim state stays whole", () => {
    expect(LADDER.map((p) => p.name)).not.toContain("human");
    expect(PROFILES["human"]).toBe(HUMAN);
    const a = playBot(level1, PROFILES["good"]!, 2), b = playBot(level1, PROFILES["good"]!, 2);
    expect(a.hash).toBe(b.hash);
  });
});

describe("human-view bot", () => {
  it("plays at human speed and is deterministic per seed", () => {
    expect(HUMAN.reactionTicks).toBeGreaterThanOrEqual(12);
    expect(HUMAN.routeNoise).toBeGreaterThan(0);
    expect(HUMAN.priorityErr).toBeGreaterThan(0);
    const a = playBot(level1, HUMAN, 3), b = playBot(level1, HUMAN, 3);
    expect(a.hash).toBe(b.hash);
    expect(a.profile).toBe("human");
  });

  it("wins the golden levels it is shown, and is not faster than the omniscient good bot on average", () => {
    for (const lv of [level1, level4]) {
      const hs = [1, 2, 3].map((s) => playBot(lv, HUMAN, s));
      const gs = [1, 2, 3].map((s) => playBot(lv, PROFILES["good"]!, s));
      expect(hs.filter((r) => r.won).length).toBeGreaterThanOrEqual(2);
      const mean = (rs: typeof hs) => rs.reduce((x, r) => x + r.goalTicks, 0) / rs.length;
      expect(mean(hs)).toBeGreaterThanOrEqual(mean(gs) * 0.95);
    }
  }, 120_000);
});
