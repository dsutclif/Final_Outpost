import {
  AdditiveBlending, Color, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, NormalBlending,
  PlaneGeometry, ShaderMaterial, Vector3, type Blending, type Object3D,
} from "three";

// Look test (?look=1): soft replacements for the code-drawn effects. Particles become camera-facing
// sprites (ragged dust puffs, velocity-stretched chips, fluttering confetti cards), turret shots
// become travelling bolts of light, and the dust storm becomes drifting dust sheets with wind
// streaks. All procedural (no textures); one draw per kind. Colours are linear and assume the
// look test's HDR composer (OutputPass tone-maps them).

// shared noise: the lattice index stays a whole number, so neighbouring cells agree on corners
const NOISE = /* glsl */ `
float h(vec2 p) { p = mod(p, 256.0); return fract(sin(p.x + p.y * 57.0) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y); }
`;

/** A growable instanced quad: one Mesh, per-instance attributes written each frame. */
class Quads {
  readonly mesh: Mesh;
  private readonly geo = new InstancedBufferGeometry();
  private readonly attrs: Record<string, InstancedBufferAttribute> = {};
  n = 0;

  constructor(parent: Object3D, readonly cap: number, layout: Record<string, number>, vert: string, frag: string, blending: Blending, order: number) {
    const q = new PlaneGeometry(1, 1);
    this.geo.index = q.index;
    this.geo.setAttribute("position", q.getAttribute("position"));
    this.geo.setAttribute("uv", q.getAttribute("uv"));
    for (const [k, size] of Object.entries(layout)) {
      const a = new InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(DynamicDrawUsage);
      this.geo.setAttribute(k, a);
      this.attrs[k] = a;
    }
    // double-sided: the velocity-aligned quads (chips, bolts) are built mirrored and would face away
    const mat = new ShaderMaterial({ vertexShader: vert, fragmentShader: frag, transparent: true, depthWrite: false, blending, side: DoubleSide });
    this.mesh = new Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = order;
    parent.add(this.mesh);
  }

  begin(): void { this.n = 0; }
  /** Values in layout order; returns false when full. */
  push(...vals: number[][]): boolean {
    if (this.n >= this.cap) return false;
    let j = 0;
    for (const a of Object.values(this.attrs)) { (a.array as Float32Array).set(vals[j++]!, this.n * a.itemSize); }
    this.n++;
    return true;
  }
  end(): void {
    for (const a of Object.values(this.attrs)) { a.needsUpdate = true; a.clearUpdateRanges(); a.addUpdateRange(0, this.n * a.itemSize); }
    this.geo.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
  }
  dispose(): void { this.mesh.removeFromParent(); this.geo.dispose(); (this.mesh.material as ShaderMaterial).dispose(); }
}

// ------------------------------------------------------------------ particles

export const enum Kind { Dust = 0, Chip = 1, Confetti = 2 }

const PART_VERT = /* glsl */ `
attribute vec3 aPos, aVel, aCol;
attribute vec4 aMisc; // size, alpha, kind, rot
varying vec2 vUv; varying vec3 vCol; varying float vA, vKind, vSeed;
void main() {
  vec4 c = modelViewMatrix * vec4(aPos, 1.0);
  float size = aMisc.x, kind = aMisc.z, rot = aMisc.w;
  vec2 p = position.xy, off;
  if (kind > 0.5 && kind < 1.5) {
    // chips and sparks stretch along their motion on screen
    vec2 d = (modelViewMatrix * vec4(aVel, 0.0)).xy;
    float L = length(d);
    vec2 dir = L > 0.001 ? d / L : vec2(0.0, 1.0);
    off = dir * p.y * size * (1.0 + min(L * 0.01, 2.0)) + vec2(-dir.y, dir.x) * p.x * size * 0.45;
  } else if (kind > 1.5) {
    // confetti: a card that flutters (its width swings as it turns)
    vec2 q = vec2(p.x * abs(sin(rot * 3.0)), p.y * 0.6) * size * 1.6;
    off = vec2(cos(rot) * q.x - sin(rot) * q.y, sin(rot) * q.x + cos(rot) * q.y);
  } else {
    off = vec2(cos(rot) * p.x - sin(rot) * p.y, sin(rot) * p.x + cos(rot) * p.y) * size;
  }
  c.xy += off;
  gl_Position = projectionMatrix * c;
  vUv = uv; vCol = aCol; vA = aMisc.y; vKind = kind; vSeed = rot;
}`;
const PART_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; varying vec3 vCol; varying float vA, vKind, vSeed;
${NOISE}
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float r = length(q);
  vec4 o;
  if (vKind < 0.5) {
    // dust: a ragged soft puff, denser in the middle
    float n = vn(q * 2.5 + vSeed * 7.0) * 0.6 + vn(q * 5.0 + vSeed * 3.0) * 0.4;
    float a = smoothstep(1.0, 0.15, r + (0.5 - n) * 0.7);
    o = vec4(vCol * (0.85 + 0.3 * n), a * vA * 0.55);
  } else if (vKind < 1.5) {
    float core = smoothstep(0.55, 0.0, r);
    o = vec4(vCol * (1.0 + core * 0.8), smoothstep(1.0, 0.1, r) * vA);
  } else {
    o = vec4(vCol * (0.75 + 0.35 * step(0.0, q.x)), vA);
  }
  if (o.a < 0.01) discard;
  gl_FragColor = o;
}`;

export interface SoftPart { p: Vector3; v: Vector3; size: number; alpha: number; kind: Kind; rot: number; color: Color }

export class SoftParticles {
  private readonly q: Quads;
  constructor(parent: Object3D, cap: number) {
    this.q = new Quads(parent, cap, { aPos: 3, aVel: 3, aCol: 3, aMisc: 4 }, PART_VERT, PART_FRAG, NormalBlending, 5);
  }
  draw(parts: Iterable<SoftPart>): void {
    this.q.begin();
    for (const p of parts) if (!this.q.push([p.p.x, p.p.y, p.p.z], [p.v.x, p.v.y, p.v.z], [p.color.r, p.color.g, p.color.b], [p.size, p.alpha, p.kind, p.rot])) break;
    this.q.end();
  }
  dispose(): void { this.q.dispose(); }
}

// ------------------------------------------------------------------ bolts of light

const BOLT_VERT = /* glsl */ `
attribute vec3 aA, aB, aCol;
attribute vec2 aW; // width, alpha
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main() {
  vec4 a = modelViewMatrix * vec4(aA, 1.0), b = modelViewMatrix * vec4(aB, 1.0);
  vec2 d = b.xy - a.xy;
  float L = max(length(d), 0.001);
  vec2 dir = d / L, perp = vec2(-dir.y, dir.x);
  float t = position.y + 0.5;
  // a little past each end so the rounded glow is not clipped
  vec4 c = mix(a, b, t);
  c.xy += dir * (t - 0.5) * aW.x + perp * position.x * aW.x;
  gl_Position = projectionMatrix * c;
  vUv = vec2(position.x * 2.0, t); vCol = aCol; vA = aW.y;
}`;
const BOLT_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main() {
  float x = vUv.x, y = vUv.y;
  // brightest at the head (y = 1), fading back along the tail
  float along = smoothstep(0.0, 0.85, y) * smoothstep(1.0, 0.9, y);
  float core = exp(-x * x * 60.0) * along;
  float halo = exp(-x * x * 5.0) * (0.25 + 0.75 * along);
  vec3 col = vec3(1.0, 0.98, 0.95) * core * 3.0 + vCol * halo * 1.4;
  gl_FragColor = vec4(col * vA, 1.0);
}`;

const GLOW_VERT = /* glsl */ `
attribute vec3 aPos, aCol;
attribute vec3 aMisc; // size, alpha, flat (1 = lies on the ground)
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main() {
  vec4 c;
  if (aMisc.z > 0.5) c = modelViewMatrix * vec4(aPos + vec3(position.x, 0.0, -position.y) * aMisc.x, 1.0);
  else { c = modelViewMatrix * vec4(aPos, 1.0); c.xy += position.xy * aMisc.x; }
  gl_Position = projectionMatrix * c;
  vUv = uv; vCol = aCol; vA = aMisc.y;
}`;
const GLOW_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv; varying vec3 vCol; varying float vA;
void main() {
  float r = length(vUv * 2.0 - 1.0);
  float a = exp(-r * r * 4.5) * smoothstep(1.0, 0.8, r);
  float core = exp(-r * r * 30.0);
  gl_FragColor = vec4((vCol * a + vec3(1.0) * core * 1.5) * vA, 1.0);
}`;

interface Shot { from: Vector3; to: Vector3; age: number; life: number; color: Color }

/** Turret shots as light: a travelling glow with a white-hot core, a muzzle flash, an impact flash and light on the ground. */
export class Bolts {
  private readonly segs: Quads;
  private readonly glows: Quads;
  private shots: Shot[] = [];
  private readonly tmp = new Vector3();
  private readonly tail = new Vector3();

  constructor(parent: Object3D) {
    this.segs = new Quads(parent, 48, { aA: 3, aB: 3, aCol: 3, aW: 2 }, BOLT_VERT, BOLT_FRAG, AdditiveBlending, 7);
    this.glows = new Quads(parent, 160, { aPos: 3, aCol: 3, aMisc: 3 }, GLOW_VERT, GLOW_FRAG, AdditiveBlending, 6);
  }

  fire(from: Vector3, to: Vector3, color: Color): void {
    if (this.shots.length > 40) this.shots.shift();
    // travel time from distance, so near and far shots move at one speed
    this.shots.push({ from: from.clone(), to: to.clone(), age: 0, life: Math.min(0.32, 0.08 + from.distanceTo(to) / 900), color: color.clone() });
  }

  update(dt: number): void {
    for (const s of this.shots) s.age += dt;
    this.shots = this.shots.filter((s) => s.age < s.life + 0.22);
  }

  draw(): void {
    this.segs.begin();
    this.glows.begin();
    for (const s of this.shots) {
      const k = s.age / s.life;
      const c = s.color;
      const hot = [c.r * 2.2, c.g * 2.2, c.b * 2.2];
      if (k < 1) {
        const head = this.tmp.lerpVectors(s.from, s.to, k);
        const len = Math.min(26, s.from.distanceTo(s.to));
        this.tail.copy(head).addScaledVector(this.tmp.clone().sub(s.from).normalize(), -len);
        if (k * s.from.distanceTo(s.to) < len) this.tail.copy(s.from);
        this.segs.push([this.tail.x, this.tail.y, this.tail.z], [head.x, head.y, head.z], hot, [9, 1]);
        // light spilling onto the ground under the bolt
        this.glows.push([head.x, 1.5, head.z], hot, [46, 0.35, 1]);
      }
      // muzzle flash: brightest at the shot, gone in a tenth of a second
      const m = 1 - s.age / 0.1;
      if (m > 0) this.glows.push([s.from.x, s.from.y, s.from.z], hot, [22, m, 0]);
      // impact flash and a pool of light where it lands
      const i = (s.age - s.life) / 0.22;
      if (i >= 0 && i < 1) {
        const f = (1 - i) * (1 - i);
        this.glows.push([s.to.x, s.to.y, s.to.z], hot, [26 * (0.7 + 0.5 * i), f, 0]);
        this.glows.push([s.to.x, 1.5, s.to.z], hot, [60, 0.5 * f, 1]);
      }
    }
    this.segs.end();
    this.glows.end();
  }

  clear(): void { this.shots = []; }
  dispose(): void { this.segs.dispose(); this.glows.dispose(); }
}

// ------------------------------------------------------------------ dust storm

const STORM_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); }`;
const STORM_FRAG = /* glsl */ `
precision highp float;
uniform float uTime, uStorm, uAspect;
uniform vec3 uCol, uGlow, uEmber;
varying vec2 vUv;
${NOISE}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { v += a * vn(p); p = p * 2.03 + 5.3; a *= 0.5; } return v; }
// layers composite front-over-back in premultiplied form, so one pass draws them all
void over(inout vec4 acc, vec3 c, float a) { acc.rgb = c * a + acc.rgb * (1.0 - a); acc.a = a + acc.a * (1.0 - a); }
void main() {
  vec2 p = vec2(vUv.x * uAspect, vUv.y);
  float t = uTime;
  vec4 acc = vec4(0.0);
  // 1. a dark rust vignette: the storm closes in from the edges and leaves the middle to play in
  vec2 d = (vUv - vec2(0.5, 0.45)) * vec2(1.1, 1.0);
  over(acc, uGlow * 0.08, uStorm * 0.75 * smoothstep(0.25, 0.8, length(d)));
  // 2. broad sheets of dust rolling across, finer billows riding them, and grit streaks in the wind
  float big = fbm(p * 1.6 - vec2(t * 0.22, t * 0.03));
  float mid = fbm(p * 4.5 - vec2(t * 0.55, -t * 0.05) + big * 1.5);
  float streak = vn(vec2(p.x * 2.2 - t * 2.4, p.y * 34.0)) * vn(vec2(p.x * 0.7 - t * 1.1, p.y * 9.0));
  streak = smoothstep(0.35, 0.75, streak);
  float a = uStorm * (0.42 * smoothstep(0.3, 0.75, big) + 0.22 * mid * big + 0.22 * streak + 0.12);
  over(acc, mix(uCol, uGlow, 0.5) * (0.45 + 0.35 * mid + 0.3 * streak), clamp(a, 0.0, 0.85) * 0.6);
  // 3. the far side of the view (top of the screen) sinks into a lit, billowing haze
  float far = smoothstep(0.45, 1.0, vUv.y);
  float bill = fbm(p * 2.2 - vec2(t * 0.12, -t * 0.02) + big);
  over(acc, uGlow * (1.1 + 0.9 * bill * far), uStorm * far * (0.45 + 0.4 * bill));
  // 4. embers: one per grid cell, blowing downwind and flickering; brighter than white so they bloom
  float em = 0.0;
  for (int k = 0; k < 2; k++) {
    float sc = 14.0 + float(k) * 9.0;
    vec2 q = p * sc + vec2(-t * (2.5 + float(k) * 1.5), t * 0.6);
    vec2 cell = floor(q), f = fract(q) - 0.5;
    float r = h(cell + float(k) * 17.0);
    vec2 o = vec2(h(cell + 3.1), h(cell + 7.7)) - 0.5;
    float flick = 0.5 + 0.5 * sin(t * (4.0 + r * 6.0) + r * 40.0);
    em += step(0.94, r) * flick * smoothstep(0.06, 0.0, length((f - o * 0.6) * vec2(0.35, 1.0)));
  }
  over(acc, uEmber * 3.0, clamp(uStorm * em, 0.0, 1.0));
  gl_FragColor = acc.a > 0.0 ? vec4(acc.rgb / acc.a, min(acc.a, 0.9)) : vec4(0.0);
}`;

export class StormDust {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  constructor(parent: Object3D, color: Color, glow: Color, ember: Color) {
    this.mat = new ShaderMaterial({
      vertexShader: STORM_VERT, fragmentShader: STORM_FRAG, transparent: true, depthWrite: false, depthTest: false,
      uniforms: {
        uTime: { value: 0 }, uStorm: { value: 0 }, uAspect: { value: 1 },
        uCol: { value: color.clone() }, uGlow: { value: glow.clone() }, uEmber: { value: ember.clone() },
      },
    });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 900;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  update(t: number, storm: number, aspect: number): void {
    this.mesh.visible = storm > 0.03;
    const u = this.mat.uniforms;
    u["uTime"]!.value = t;
    u["uStorm"]!.value = storm;
    u["uAspect"]!.value = aspect;
  }
  dispose(): void { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); this.mat.dispose(); }
}

