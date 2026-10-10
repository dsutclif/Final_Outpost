import { BoxGeometry, Color, Euler, Matrix4, Quaternion, Sprite, SpriteMaterial, Vector3, type Material, type Object3D } from "three";
import type { Items } from "./items.js";
import { Batch } from "./instancing.js";
import type { Labels } from "./labels.js";

// Juice: particles (dust rings, sparks, confetti), "+N" floaters, items arcing onto the back
// stack or into a sink, coins flying to the HUD, hit flashes and pop timers. Events start
// effects; sync advances them. Nothing here reads sim state.

export type Target = Vector3 | (() => Vector3);

interface Particle { p: Vector3; v: Vector3; g: number; life: number; age: number; size: number; color: Color; spin: number; drag: number }
interface Floater { sprite: Sprite; mat: SpriteMaterial; age: number; life: number; base: Vector3; on: boolean }
interface Flight { res: string; from: Vector3; to: Target; age: number; dur: number; h: number; toPlayer: boolean; done?: () => void; spin: number }

const MAX_PARTICLES = 700;
const tmpM = new Matrix4(), tmpQ = new Quaternion(), tmpE = new Euler(), tmpS = new Vector3(), tmpV = new Vector3();

export class Fx {
  private parts: Particle[] = [];
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

  constructor(particleMat: Material, private readonly parent: Object3D, private readonly labels: Labels) {
    this.batch = new Batch(this.cube, particleMat, parent, 128, "particles");
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
      this.spawn(at, new Vector3(Math.cos(a) * s, up * (0.6 + Math.random() * 0.6), Math.sin(a) * s), g, life * (0.7 + Math.random() * 0.5), size * (0.6 + Math.random() * 0.7), colors[i % colors.length]!, 0.6);
    }
  }

  /** Expanding ring of dust on the ground (builds, landings). */
  dustRing(at: Vector3, color: string, n: number, speed: number, size = 7): void {
    n = Math.max(4, Math.round(n * this.particleScale));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      this.spawn(new Vector3(at.x + Math.cos(a) * 6, at.y + 2, at.z + Math.sin(a) * 6), new Vector3(Math.cos(a) * speed, 18 + Math.random() * 20, Math.sin(a) * speed), 30, 0.8 + Math.random() * 0.3, size * (0.7 + Math.random() * 0.6), color, 2.2);
    }
  }

  confetti(at: Vector3, colors: readonly string[], n: number): void {
    n = Math.round(n * this.particleScale);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 150;
      this.spawn(at, new Vector3(Math.cos(a) * s, 220 + Math.random() * 220, Math.sin(a) * s), 260, 2 + Math.random(), 3 + Math.random() * 3, colors[i % colors.length]!, 1.2);
    }
  }

  /** Slow rising puffs (chimney smoke, steam). */
  puff(at: Vector3, color: string): void {
    if (Math.random() > this.particleScale) return;
    this.spawn(at, new Vector3((Math.random() - 0.5) * 8, 26 + Math.random() * 10, (Math.random() - 0.5) * 8), -6, 1.4, 6 + Math.random() * 4, color, 0.8);
  }

  private spawn(p: Vector3, v: Vector3, g: number, life: number, size: number, color: string, drag: number): void {
    if (this.parts.length >= MAX_PARTICLES) this.parts.shift();
    this.parts.push({ p: p.clone(), v, g, life, age: 0, size, color: new Color(color), spin: Math.random() * 10, drag });
  }

  // ---------------------------------------------------------------- floaters

  floater(text: string, color: string, at: Vector3, px = 44, height = 13): void {
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
      f.sprite.scale.set(height * m.aspect, height, 1);
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
  coins(from: Vector3, to: () => Vector3, n: number, res: string): void {
    for (let i = 0; i < n; i++) {
      const f0 = from.clone().add(new Vector3((Math.random() - 0.5) * 16, Math.random() * 6, (Math.random() - 0.5) * 16));
      this.flights.push({ res, from: f0, to, age: -i * 0.05, dur: 0.55 + Math.random() * 0.15, h: 40, toPlayer: false, spin: Math.random() * 6, done: () => this.onCoinLanded?.() });
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
      f.sprite.position.set(f.base.x, f.base.y + 26 * (1 - (1 - k) * (1 - k)), f.base.z);
      f.mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }
    for (const f of this.flights) f.age += dt;
    const landed = this.flights.filter((f) => f.age >= f.dur);
    if (landed.length) {
      this.flights = this.flights.filter((f) => f.age < f.dur);
      for (const f of landed) f.done?.();
    }
    this.shake = Math.max(0, this.shake - dt * 18);
  }

  /** Write particles into their batch and flights into the item batches. */
  draw(items: Items): void {
    this.batch.begin();
    for (const p of this.parts) {
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
      items.add(f.res, tmpV.x, tmpV.y, tmpV.z, f.spin + k * 6, 1, Math.sin(k * Math.PI) * 0.6);
    }
  }

  clear(): void {
    this.parts = [];
    this.flights = [];
    this.flashes.clear();
    this.pops.clear();
    for (const f of this.floaters) { f.on = false; f.sprite.visible = false; }
  }

  dispose(): void {
    this.batch.dispose();
    this.cube.dispose();
    for (const f of this.floaters) { this.parent.remove(f.sprite); f.mat.dispose(); }
    this.floaters = [];
  }
}
