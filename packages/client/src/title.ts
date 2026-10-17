import { alpha, mix, type Skin } from "@fo/skins";

// Animated title backdrop drawn on canvas from the skin palette: hazy sky, a low sun,
// three parallax dune bands, a lit outpost of domes on the middle ridge, a reactor glow
// and blowing dust. Runs its own rAF only while the title is showing.

interface Mote { x: number; y: number; s: number; v: number }

export class TitleBackdrop {
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D | null;
  private raf = 0;
  private t0 = 0;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private sky: CanvasGradient | null = null;
  private motes: Mote[] = [];
  private stars: { x: number; y: number; r: number }[] = [];

  constructor(private readonly host: HTMLElement, private skin: Skin) {
    const doc = host.ownerDocument;
    this.canvas = doc.createElement("canvas");
    this.canvas.className = "title-bg";
    host.prepend(this.canvas);
    this.g = this.canvas.getContext("2d");
    for (let i = 0; i < 60; i++) this.motes.push({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.8, v: 0.3 + Math.random() * 0.9 });
    for (let i = 0; i < 40; i++) this.stars.push({ x: Math.random(), y: Math.random() * 0.35, r: Math.random() * 1.1 + 0.3 });
  }

  setSkin(skin: Skin): void { this.skin = skin; this.sky = null; }

  /** Re-insert the canvas after the host's markup was replaced. */
  attach(): void { if (this.canvas.parentElement !== this.host || this.host.firstChild !== this.canvas) this.host.prepend(this.canvas); }

  start(): void {
    if (this.raf) return;
    this.t0 = performance.now();
    const loop = (now: number): void => {
      this.raf = requestAnimationFrame(loop);
      this.draw((now - this.t0) / 1000);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private fit(): boolean {
    const r = this.host.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width < 1 || r.height < 1) return false;
    if (r.width !== this.w || r.height !== this.h || dpr !== this.dpr) {
      this.w = r.width; this.h = r.height; this.dpr = dpr;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.sky = null;
    }
    return true;
  }

  private dune(g: CanvasRenderingContext2D, baseY: number, amp: number, freq: number, off: number, color: string): void {
    const w = this.w, h = this.h;
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w + 8; x += 8) {
      const y = baseY + Math.sin(x * freq + off) * amp + Math.sin(x * freq * 2.3 + off * 1.7) * amp * 0.35;
      g.lineTo(x, y);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }

  private draw(t: number): void {
    const g = this.g;
    if (!g || !this.fit()) return;
    const w = this.w, h = this.h, p = this.skin.palette;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.sky) {
      this.sky = g.createLinearGradient(0, 0, 0, h);
      this.sky.addColorStop(0, "#2a2b2e");
      this.sky.addColorStop(0.28, mix(p.sky, p.accent, 0.22));
      this.sky.addColorStop(0.55, mix(p.ground, p.sky, 0.45));
      this.sky.addColorStop(1, mix(p.groundDark, "#000000", 0.35));
    }
    g.fillStyle = this.sky;
    g.fillRect(0, 0, w, h);
    for (const s of this.stars) {
      g.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + s.x * 40);
      g.fillStyle = "#fff6e8";
      g.fillRect(s.x * w, s.y * h, s.r, s.r);
    }
    g.globalAlpha = 1;
    // low sun with a halo, and a tiny moon crossing
    const sx = w * 0.78, sy = h * 0.43;
    g.fillStyle = alpha("#fff3d6", 0.18);
    g.beginPath(); g.arc(sx, sy, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = alpha("#fff3d6", 0.3);
    g.beginPath(); g.arc(sx, sy, 42, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#fff6e6";
    g.beginPath(); g.arc(sx, sy, 24, 0, Math.PI * 2); g.fill();
    const mx = ((t * 6) % (w + 40)) - 20;
    g.fillStyle = alpha("#f3e2d0", 0.75);
    g.beginPath(); g.arc(mx, h * 0.14, 4, 0, Math.PI * 2); g.fill();
    // far dunes
    this.dune(g, h * 0.55, 14, 0.012, t * 0.05, mix(p.groundAlt, p.sky, 0.35));
    // middle ridge with the outpost
    const ridge = h * 0.6;
    this.dune(g, ridge, 10, 0.009, 1.3 + t * 0.09, mix(p.ground, p.groundAlt, 0.4));
    const os = Math.min(1.8, Math.max(1.2, w / 260));
    g.save(); g.translate(w * 0.42, ridge - 2); g.scale(os, os); this.outpost(g, 0, 0, t); g.restore();
    // near dunes
    this.dune(g, h * 0.72, 18, 0.007, 2.1 + t * 0.16, p.groundDark);
    this.dune(g, h * 0.86, 12, 0.011, 4 + t * 0.24, mix(p.groundDark, "#000000", 0.3));
    // blowing dust
    g.fillStyle = alpha("#ffe2c0", 0.55);
    for (const m of this.motes) {
      const x = ((m.x * w + t * 30 * m.v) % (w + 20)) - 10;
      const y = m.y * h + Math.sin(t * m.v + m.x * 10) * 8;
      g.fillRect(x, y, m.s * 2.2, m.s * 0.8);
    }
  }

  private outpost(g: CanvasRenderingContext2D, cx: number, by: number, t: number): void {
    const p = this.skin.palette;
    // reactor glow pulsing under the domes
    const glow = 0.25 + 0.08 * Math.sin(t * 3);
    g.fillStyle = alpha(p.accent, glow);
    g.beginPath(); g.ellipse(cx, by, 90, 26, 0, 0, Math.PI * 2); g.fill();
    const dome = (x: number, r: number, lit: boolean): void => {
      g.fillStyle = mix(p.structureDark, "#5a4038", 0.35);
      g.beginPath(); g.arc(x, by, r, Math.PI, 0); g.closePath(); g.fill();
      g.fillStyle = alpha(p.glass, 0.35);
      g.beginPath(); g.arc(x, by, r - 3, Math.PI, 0); g.closePath(); g.fill();
      if (lit) {
        g.fillStyle = alpha("#fff0c0", 0.7 + 0.3 * Math.sin(t * 2 + x));
        g.fillRect(x - 3, by - r * 0.45, 6, 4);
      }
    };
    dome(cx - 46, 16, true);
    dome(cx + 40, 20, true);
    dome(cx, 30, false);
    // antenna with a blinking beacon
    g.strokeStyle = mix(p.structureDark, "#3a2a26", 0.4);
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx + 62, by); g.lineTo(cx + 66, by - 42); g.stroke();
    g.fillStyle = Math.sin(t * 4) > 0 ? p.danger : alpha(p.danger, 0.3);
    g.beginPath(); g.arc(cx + 66, by - 43, 2.5, 0, Math.PI * 2); g.fill();
    // reactor core light
    g.fillStyle = alpha("#fff3c4", 0.85);
    g.beginPath(); g.arc(cx, by - 12, 5 + Math.sin(t * 6) * 0.8, 0, Math.PI * 2); g.fill();
  }

  dispose(): void { this.stop(); this.canvas.remove(); }
}
