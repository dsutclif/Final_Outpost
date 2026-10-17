import { CanvasTexture, LinearFilter, MeshBasicMaterial, SRGBColorSpace, Sprite, SpriteMaterial } from "three";
import { LABEL_K } from "../units.js";

// World-space text and icons as cached canvas sprites: rounded heavy font, white with a dark
// outline (ART-DIRECTION.md typography). Every texture is keyed by what it shows, so a
// label that does not change is drawn once and shared; the cache evicts least-recently used.

export const FONT = '"Barlow Condensed", "Arial Narrow", system-ui, sans-serif';

type Ctx2D = CanvasRenderingContext2D;
export type CanvasMaker = (w: number, h: number) => HTMLCanvasElement | null;

interface Entry { tex: CanvasTexture; mat: SpriteMaterial; meshMat?: MeshBasicMaterial; aspect: number; used: number }

export interface LabelArt {
  /** Canvas size in px (drawn at 2x for crispness). */
  w: number;
  h: number;
  draw: (g: Ctx2D, w: number, h: number) => void;
}

const MAX = 260;

export class Labels {
  private cache = new Map<string, Entry>();
  private clock = 0;
  private measureCanvas: HTMLCanvasElement | null = null;

  constructor(private readonly make: CanvasMaker | null, readonly ink: string) {}

  get enabled(): boolean {
    return this.make !== null;
  }

  /** Cached sprite material for a key; null when no canvas is available (headless). */
  material(key: string, art: () => LabelArt): { mat: SpriteMaterial; aspect: number } | null {
    const hit = this.cache.get(key);
    this.clock++;
    if (hit) { hit.used = this.clock; return hit; }
    if (!this.make) return null;
    const a = art();
    const c = this.make(Math.max(2, Math.ceil(a.w)), Math.max(2, Math.ceil(a.h)));
    const g = c?.getContext("2d");
    if (!c || !g) return null;
    a.draw(g, c.width, c.height);
    const tex = new CanvasTexture(c);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    const mat = new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false });
    const e: Entry = { tex, mat, aspect: c.width / c.height, used: this.clock };
    this.cache.set(key, e);
    if (this.cache.size > MAX) this.evict();
    return e;
  }

  /** Cached flat material (ground decals) for a key; null when headless. */
  meshMaterial(key: string, art: () => LabelArt): MeshBasicMaterial | null {
    this.material(key, art);
    const e = this.cache.get(key);
    if (!e) return null;
    if (!e.meshMat) e.meshMat = new MeshBasicMaterial({ map: e.tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    return e.meshMat;
  }

  /** Apply a cached label to a sprite; `height` is the world height of the sprite. */
  apply(sprite: Sprite, key: string, art: () => LabelArt, height: number): boolean {
    const m = this.material(key, art);
    if (!m) { sprite.visible = false; return false; }
    if (sprite.material !== m.mat) sprite.material = m.mat;
    const h = height * LABEL_K;
    sprite.scale.set(h * m.aspect, h, 1);
    return true;
  }

  textWidth(text: string, px: number): number {
    if (!this.measureCanvas && this.make) this.measureCanvas = this.make(4, 4);
    const g = this.measureCanvas?.getContext("2d");
    if (!g) return text.length * px * 0.6;
    g.font = `800 ${px}px ${FONT}`;
    return g.measureText(text).width;
  }

  /** Plain outlined text. */
  text(text: string, fill: string, px = 44): LabelArt {
    const pad = px * 0.35;
    return {
      w: this.textWidth(text, px) + pad * 2,
      h: px * 1.45,
      draw: (g, w, h) => {
        g.font = `800 ${px}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineJoin = "round";
        g.lineWidth = px * 0.22;
        g.strokeStyle = this.ink;
        g.strokeText(text, w / 2, h / 2 + px * 0.05);
        g.fillStyle = fill;
        g.fillText(text, w / 2, h / 2 + px * 0.05);
      },
    };
  }

  private evict(): void {
    const old = [...this.cache.entries()].sort((a, b) => a[1].used - b[1].used).slice(0, this.cache.size - MAX + 40);
    for (const [k, e] of old) {
      // a material still on screen is re-created on its next apply()
      e.tex.dispose();
      e.mat.dispose();
      e.meshMat?.dispose();
      this.cache.delete(k);
    }
  }

  dispose(): void {
    for (const e of this.cache.values()) { e.tex.dispose(); e.mat.dispose(); e.meshMat?.dispose(); }
    this.cache.clear();
  }
}

// ------------------------------------------------------------------ drawing helpers

export function roundRect(g: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
}

/** Chunky resource icon: a coloured disc with a highlight and a dark rim. */
export function drawIcon(g: Ctx2D, x: number, y: number, r: number, color: string, ink: string): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = r * 0.22;
  g.strokeStyle = ink;
  g.stroke();
  g.beginPath();
  g.arc(x - r * 0.3, y - r * 0.32, r * 0.32, 0, Math.PI * 2);
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.fill();
}
