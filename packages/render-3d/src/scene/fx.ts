import { BoxGeometry, Color, Euler, Matrix4, Quaternion, Sprite, SpriteMaterial, Vector3, type Material, type Object3D } from "three";
import type { Items } from "./items.js";
import { Batch } from "./instancing.js";
import type { Labels } from "./labels.js";
import { TEXT } from "../units.js";
import { Bolts, Kind, SoftParticles } from "./softfx.js";

// Juice: particles (dust rings, sparks, confetti), "+N" floaters, items arcing onto the back
// stack or into a sink, coins flying to the HUD, hit flashes and pop timers. Events start
// effects; sync advances them. Nothing here reads sim state.

export type Target = Vector3 | (() => Vector3);

interface Particle { p: Vector3; v: Vector3; g: number; life: number; age: number; size: number; color: Color; spin: number; drag: number; kind: Kind }
interface Floater { sprite: Sprite; mat: SpriteMaterial; age: number; life: number; base: Vector3; on: boolean; size?: [number, number] }
interface Flight { res: string; from: Vector3; to: Target; age: number; dur: number; h: number; toPlayer: boolean; done?: () => void; spin: number; hud?: boolean }

const MAX_PARTICLES = 700;
/** Friendly laser glow (BACKLOG-R6 N5: blue for friendlies, red for enemies). */
const BOLT_FRIENDLY = new Color("#4da6ff");
const tmpM = new Matrix4(), tmpQ = new Quaternion(), tmpE = new Euler(), tmpS = new Vector3(), tmpV = new Vector3();

export class Fx {
  private parts: Particle[] = [];
  private shells: { delay: number; age: number; x: number; z: number; y0: number; apex: number; fuse: number; c: string[]; done: boolean }[] = [];
  private floaters: Floater[] = [];
  private flights: Flight[] = [];
  private flashes = new Map<string, number>();
  private pops = new Map<string, number>();
  private readonly batch: Batch;
  private readonly cube = new BoxGeometry(1, 1, 1);
  now = 0;
  shake = 0;
  particleScale = 1;
  onCoinLanded: (() => void) | null = null;
  /** Size multiplier for an item flying to the HUD at `at` (the renderer knows the camera); 1 when unset. */
  hudScale: ((at: Vector3, from: Vector3, k: number, res: string) => number) | null = null;
  /** Look test: soft sprites and bolts of light instead of cubes. */
  private soft: SoftParticles | null = null;
  private bolts: Bolts | null = null;

  constructor(particleMat: Material, private readonly parent: Object3D, private readonly labels: Labels) {
    this.batch = new Batch(this.cube, particleMat, parent, 128, "particles");
  }

  /** Look test: draw particles as soft sprites and shots as bolts of light from now on. */
  enableSoft(): void {
    if (this.soft) return;
    this.soft = new SoftParticles(this.parent, MAX_PARTICLES);
    this.bolts = new Bolts(this.parent);
  }

  // ---------------------------------------------------------------- timers

  flash(key: string, sec = 0.18): void { this.flashes.set(key, this.now + sec); }
  /** 0..1 hit flash intensity. */
  flashK(key: string): number {
    const until = this.flashes.get(key);
    if (until === undefined) return 0;
    const k = (until - this.now) / 0.18;
    if (k <= 0) { this.flashes.delete(key); return 0; }
    return Math.min(1, k);
  }
  pop(key: string): void { this.pops.set(key, this.now); }
  popAge(key: string): number {
    const t = this.pops.get(key);
    return t === undefined ? Infinity : this.now - t;
  }

  // ---------------------------------------------------------------- particles

  burst(at: Vector3, colors: readonly string[], n: number, speed: number, up: number, size: number, life = 0.7, g = 420): void {
    n = Math.max(1, Math.round(n * this.particleScale));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
      this.spawn(at, new Vector3(Math.cos(a) * s, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s), g, life * (0.7 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.7), colors[i % colors.length]!, 0.6, Kind.Chip);
    }
  }

  /** Short visible shot: a streak of still particles from `from` to `to`, fading fast. */
  tracer(from: Vector3, to: Vector3, color: string, n = 7, life = 0.16, size = 3): void {
    // look test: friendly fire is blue light with a white-hot core (BACKLOG-R6 N5)
    if (this.bolts) { this.bolts.fire(from, to, BOLT_FRIENDLY); return; }
    n = Math.max(3, Math.round(n * Math.max(0.5, this.particleScale)));
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / n;
      this.spawn(tmpV.lerpVectors(from, to, k), new Vector3(), 0, life * (0.6 + 0.4 * k), size * (0.7 + 0.5 * k), color, 0);
    }
  }

  /** Expanding ring of dust on the ground (builds, landings). */
  dustRing(at: Vector3, color: string, n: number, speed: number, size = 7): void {
    n = Math.max(4, Math.round(n * this.particleScale));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      this.spawn(new Vector3(at.x + Math.cos(a) * 6, at.y + 2, at.z + Math.sin(a) * 6), new Vector3(Math.cos(a) * speed, 18 + Math.random() * 20, Math.sin(a) * speed), 30, 0.8 + Math.random() * 0.3, size * (0.7 + Math.random() * 0.6), color, 2.2, Kind.Dust);
    }
  }

  confetti(at: Vector3, colors: readonly string[], n: number): void {
    n = Math.round(n * this.particleScale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 150;
      this.spawn(at, new Vector3(Math.cos(a) * s, 220 + Math.random() * 220, Math.sin(a) * s), 260, 2 + Math.random(), 3 + Math.random() * 3, colors[i % colors.length]!, 1.2, Kind.Confetti);
    }
  }

  /** Level-win fireworks: rockets climb with a spark trail and burst into a sphere of falling embers, staggered over about three seconds. */
  fireworks(at: Vector3, colors: readonly string[], shells = 7): void {
    for (let i = 0; i < shells; i++) {
      const a = Math.random() * Math.PI * 2, r = 20 + Math.random() * 90;
      this.shells.push({ delay: i * 0.38 + Math.random() * 0.25, age: 0, x: at.x + Math.cos(a) * r, z: at.z + Math.sin(a) * r, y0: at.y, apex: 110 + Math.random() * 90, fuse: 0.75 + Math.random() * 0.2, c: [colors[i % colors.length]!, colors[(i + 2) % colors.length]!], done: false });
    }
  }

  private stepShells(dt: number): void {
    for (const s of this.shells) {
      if (s.delay > 0) { s.delay -= dt; continue; }
      s.age += dt;
      const k = Math.min(1, s.age / s.fuse), y = s.y0 + s.apex * (1 - (1 - k) * (1 - k));
      if (s.age < s.fuse) {
        this.spawn(tmpV.set(s.x + (Math.random() - 0.5) * 3, y, s.z + (Math.random() - 0.5) * 3), new Vector3((Math.random() - 0.5) * 14, -20, (Math.random() - 0.5) * 14), 40, 0.35, 2.4, "#ffe9b0", 0.6);
        continue;
      }
      s.done = true;
      const n = Math.max(8, Math.round(70 * this.particleScale));
      for (let i = 0; i < n; i++) {
        // even-ish points on a sphere, speed varied so the burst has depth
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, rr = Math.sqrt(1 - u * u), sp = 60 + Math.random() * 55;
        this.spawn(tmpV.set(s.x, y, s.z), new Vector3(rr * Math.cos(th) * sp, u * sp, rr * Math.sin(th) * sp), 85, 1.3 + Math.random() * 0.7, 3.4 + Math.random() * 2, i % 5 === 0 ? "#ffffff" : s.c[i % 2]!, 1.3, Kind.Chip);
      }
    }
    if (this.shells.some((s) => s.done)) this.shells = this.shells.filter((s) => !s.done);
  }

  /** Slow rising puffs (chimney smoke, steam). */
  puff(at: Vector3, color: string): void {
    if (Math.random() > this.particleScale) return;
    this.spawn(at, new Vector3((Math.random() - 0.5) * 8, 26 + Math.random() * 10, (Math.random() - 0.5) * 8), -6, 1.4, 6 + Math.random() * 4, color, 0.8, Kind.Dust);
  }

  private spawn(p: Vector3, v: Vector3, g: number, life: number, size: number, color: string, drag: number, kind = Kind.Chip): void {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push({ p: p.clone(), v, g, life, age: 0, size, color: new Color(color), spin: Math.random() * 10, drag, kind });
  }

  // ---------------------------------------------------------------- floaters

  /** Floating text; `textH` is the letter height on screen (units.ts TEXT), px only sets the drawing resolution. */
  floater(text: string, color: string, at: Vector3, px = 44, textH: number = TEXT.main): void {
    // Labels.text draws on a canvas 1.45 x px tall
    const height = textH * 1.45;
    let f = this.floaters.find((x) => !x.on);
    if (!f) {
      if (this.floaters.length >= 28) f = this.floaters.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
      else {
        const mat = new SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
        const sprite = new Sprite(mat);
        sprite.renderOrder = 20;
        this.parent.add(sprite);
        f = { sprite, mat, age: 0, life: 1.2, base: new Vector3(), on: false };
        this.floaters.push(f);
      }
    }
    const m = this.labels.material(`fl|${text}|${color}|${px}`, () => this.labels.text(text, color, px));
    f.on = m !== null;
    f.sprite.visible = f.on;
    if (m) {
      if (f.mat.map !== m.mat.map) { f.mat.needsUpdate = f.mat.map === null; f.mat.map = m.mat.map; }
      f.mat.opacity = 1;
      f.size = [height * m.aspect, height];
      const k = this.labels.screenK * this.labels.textK;
      f.sprite.scale.set(height * m.aspect * k, height * k, 1);
    }
    f.age = 0;
    f.base.copy(at);
    f.sprite.position.copy(at);
  }

  // ---------------------------------------------------------------- item flights

  arc(res: string, from: Vector3, to: Target, dur: number, toPlayer = false, done?: () => void): void {
    this.flights.push({ res, from: from.clone(), to, age: 0, dur, h: 22 + Math.random() * 10, toPlayer, spin: Math.random() * 6, ...(done ? { done } : {}) });
  }

  inFlightToPlayer(res: string): number {
    let n = 0;
    for (const f of this.flights) if (f.toPlayer && f.res === res) n++;
    return n;
  }

  /** Coins fly from a world point toward a target that tracks the HUD chip. */
  coins(from: Vector3, to: () => Vector3, n: number, res: string, toHud = false): void {
    for (let i = 0; i < n; i++) {
      const f0 = from.clone().add(new Vector3((Math.random() - 0.5) * 16, Math.random() * 6, (Math.random() - 0.5) * 16));
      this.flights.push({ res, from: f0, to, age: -i * 0.05, dur: 0.55 + Math.random() * 0.15, h: 40, toPlayer: false, hud: toHud, spin: Math.random() * 6, done: () => this.onCoinLanded?.() });
    }
  }

  // ---------------------------------------------------------------- frame

  update(dt: number): void {
    for (const p of this.parts) {
      p.age += dt;
      p.v.y -= p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.v.x *= d; p.v.z *= d;
      p.p.addScaledVector(p.v, dt);
      if (p.p.y < 0.5) { p.p.y = 0.5; p.v.y *= -0.3; p.v.x *= 0.7; p.v.z *= 0.7; }
    }
    this.parts = this.parts.filter((p) => p.age < p.life);
    for (const f of this.floaters) {
      if (!f.on) continue;
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) { f.on = false; f.sprite.visible = false; continue; }
      f.sprite.position.set(f.base.x, f.base.y + 26 * this.labels.screenK * (1 - (1 - k) * (1 - k)), f.base.z);
      if (f.size) f.sprite.scale.set(f.size[0] * this.labels.screenK, f.size[1] * this.labels.screenK, 1);
      f.mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
    for (const f of this.flights) f.age += dt;
    const landed = this.flights.filter((f) => f.age >= f.dur);
    if (landed.length) {
      this.flights = this.flights.filter((f) => f.age < f.dur);
      for (const f of landed) f.done?.();
    }
    this.shake = Math.max(0, this.shake - dt * 18);
    this.stepShells(dt);
    this.bolts?.update(dt);
  }

  /** Write particles into their batch and flights into the item batches. */
  draw(items: Items): void {
    this.batch.begin();
    if (this.soft) this.drawSoft();
    else for (const p of this.parts) {
      const k = 1 - p.age / p.life;
      const s = p.size * Math.min(1, k * 2.5);
      tmpQ.setFromEuler(tmpE.set(p.spin * p.age, p.spin * p.age * 0.7, 0));
      tmpM.compose(p.p, tmpQ, tmpS.setScalar(Math.max(0.01, s)));
      this.batch.push(tmpM, p.color);
    }
    this.batch.end();
    for (const f of this.flights) {
      if (f.age < 0) continue;
      const k = Math.min(1, f.age / f.dur);
      const to = typeof f.to === "function" ? f.to() : f.to;
      tmpV.lerpVectors(f.from, to, k);
      tmpV.y += Math.sin(k * Math.PI) * f.h;
      // flying to the HUD, a coin shrinks on screen to the counter's icon size (Doug, 2026-11-04)
      const ks = f.hud && this.hudScale ? this.hudScale(tmpV, f.from, k, f.res) : 1;
      items.add(f.res, tmpV.x, tmpV.y, tmpV.z, f.spin + k * 6, ks, Math.sin(k * Math.PI) * 0.6);
    }
  }

  /** Look test: dust grows and thins as it spreads; chips stretch and fade; confetti cards flutter down. */
  private drawSoft(): void {
    const out = this.parts.map((p) => {
      const a = p.age / p.life, k = 1 - a;
      const spin = p.spin + p.spin * p.age * 0.35;
      if (p.kind === Kind.Dust) return { p: p.p, v: p.v, color: p.color, kind: p.kind, rot: spin, size: p.size * 2.4 * (0.6 + 0.9 * a), alpha: k * Math.min(1, p.age * 10) };
      if (p.kind === Kind.Confetti) return { p: p.p, v: p.v, color: p.color, kind: p.kind, rot: p.spin + p.age * (2 + p.spin * 0.3), size: p.size, alpha: Math.min(1, k * 5) };
      return { p: p.p, v: p.v, color: p.color, kind: p.kind, rot: spin, size: p.size * 1.1 * Math.min(1, k * 2.5), alpha: Math.min(1, k * 3) };
    });
    this.soft!.draw(out);
    this.bolts!.draw();
  }

  clear(): void {
    this.bolts?.clear();
    this.parts = [];
    this.shells = [];
    this.flights = [];
    this.flashes.clear();
    this.pops.clear();
    for (const f of this.floaters) { f.on = false; f.sprite.visible = false; }
  }

  dispose(): void {
    this.batch.dispose();
    this.cube.dispose();
    this.soft?.dispose();
    this.bolts?.dispose();
    for (const f of this.floaters) { this.parent.remove(f.sprite); f.mat.dispose(); }
    this.floaters = [];
  }
}
