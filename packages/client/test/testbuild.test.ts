import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSim } from "@fo/sim";
import { FixedStepper, TICK_MS } from "../src/loop.js";
import { GAME_SPEEDS, nextSpeed, runToWave, startWaveParam, testBuildOn } from "../src/testbuild.js";

// Test-build controls for defend checks (outpost-ops#248): a game speed (1x/2x/4x) and "start at wave N",
// which fast-forwards the sim with the reference bot until wave N starts, then hands control to the player.

const defend = JSON.parse(readFileSync(new URL("../../../levels/packs/s1/s1-L026.json", import.meta.url), "utf8")) as { waves: unknown[] };
const shelter = JSON.parse(readFileSync(new URL("../../../levels/packs/s1/s1-L006.json", import.meta.url), "utf8")) as object;

describe("game speed", () => {
  it("a speed factor scales the sim steps a frame runs", () => {
    const one = new FixedStepper(), four = new FixedStepper();
    four.speed = 4;
    let a = 0, b = 0;
    for (let i = 0; i < 60; i++) { a += one.advance(16.7); b += four.advance(16.7); }
    expect(a).toBeGreaterThan(25);
    expect(b).toBe(a * 4);
  });

  it("catch-up grows with the speed, so 4x on a slow frame still runs four times the ticks", () => {
    const s = new FixedStepper(); s.speed = 4;
    expect(s.advance(TICK_MS * 5)).toBe(20);
  });

  it("the button cycles 1x, 2x, 4x and back", () => {
    expect(GAME_SPEEDS).toEqual([1, 2, 4]);
    expect(nextSpeed(1)).toBe(2);
    expect(nextSpeed(2)).toBe(4);
    expect(nextSpeed(4)).toBe(1);
  });
});

describe("start at wave N", () => {
  it("reads ?wave=N (a whole number from 1)", () => {
    expect(startWaveParam("?wave=3")).toBe(3);
    expect(startWaveParam("?l=2&wave=5")).toBe(5);
    expect(startWaveParam("")).toBeNull();
    expect(startWaveParam("?wave=0")).toBeNull();
    expect(startWaveParam("?wave=x")).toBeNull();
  });

  it("begins a defend level at wave N: the bot plays the build-up and stops the tick wave N starts", () => {
    const sim = createSim({ ...(defend as object), seed: 1 });
    const n = sim.compiled.waves.length;
    expect(n).toBeGreaterThan(1);
    const r = runToWave(sim, n, (input) => { sim.step(input); });
    expect(r.reached).toBe(true);
    expect(sim.state.waves.idx).toBe(n);
    expect(r.ticks).toBe(sim.state.tick);
    // it stopped at once: one tick earlier wave N had not started
    const again = createSim({ ...(defend as object), seed: 1 });
    runToWave(again, n, (input) => { again.step(input); }, r.ticks - 1);
    expect(again.state.waves.idx).toBe(n - 1);
  });

  it("asks past the last wave go to the last wave; a level with no waves is left alone", () => {
    const sim = createSim({ ...(defend as object), seed: 1 });
    const r = runToWave(sim, 99, (input) => { sim.step(input); });
    expect(r.wave).toBe(sim.compiled.waves.length);
    expect(sim.state.waves.idx).toBe(sim.compiled.waves.length);
    const calm = createSim({ ...(shelter as object), seed: 1 });
    const c = runToWave(calm, 2, (input) => { calm.step(input); });
    expect(c).toEqual({ reached: false, ticks: 0, wave: 0 });
  });
});

describe("test builds only", () => {
  it("the controls are on in dev and preview builds, never in a release build", () => {
    expect(testBuildOn({ dev: true, env: "production" })).toBe(true);
    expect(testBuildOn({ dev: false, env: "preview" })).toBe(true);
    expect(testBuildOn({ dev: false, env: "production" })).toBe(false);
    expect(testBuildOn({ dev: false, env: undefined })).toBe(false);
  });
});
