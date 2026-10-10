import type { SkinPalette } from "@fo/skins";

// DOM overlays drawn over the WebGL canvas so they match the 2D renderer's canvas overlays:
// the hint pill and banner (same classes and CSS as render-2d), off-screen pointers with an
// arrow and an icon bubble, and coach marks (ground ring, bouncing arrow, speech bubble, or an
// edge pointer when the target is off screen). Everything is placed from screen points the
// renderer projects, so the layer knows nothing about three.js.

export interface V2 { x: number; y: number }
export type PointerIcon = "hostile" | "pod" | "person" | "core" | "coin" | "goal" | "alert";

const FONT = '"Baloo 2","Nunito",ui-rounded,system-ui,sans-serif';

const STYLE = `
.fo-hint{position:absolute;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translate(-50%,8px) scale(.96);background:rgba(33,24,26,.86);color:#fff;font:800 14px/1.2 ${FONT};padding:8px 16px;border-radius:999px;pointer-events:none;white-space:nowrap;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .2s,transform .2s;z-index:2;box-shadow:0 4px 12px rgba(0,0,0,.25)}
.fo-hint.on{opacity:1;transform:translate(-50%,0) scale(1)}
.fo-hint.top{bottom:auto;top:58px}
.fo-banner{position:absolute;left:50%;top:10px;transform:translateX(-50%);color:#fff;font:800 17px/1.15 ${FONT};padding:8px 18px;border-radius:999px;pointer-events:none;white-space:nowrap;z-index:2;box-shadow:0 4px 0 rgba(0,0,0,.18),0 8px 18px rgba(0,0,0,.25);text-shadow:0 1px 0 rgba(0,0,0,.25);animation:fo-banner-in .35s cubic-bezier(.2,1.6,.4,1)}
@keyframes fo-banner-in{from{transform:translateX(-50%) scale(.6);opacity:0}to{transform:translateX(-50%) scale(1);opacity:1}}
.fo-ptr{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2;display:none}
.fo-ptr .arr{position:absolute;left:0;top:0;width:0;height:0;border-left:12px solid currentColor;border-top:8px solid transparent;border-bottom:8px solid transparent;filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1px #fff)}
.fo-ptr .bub{position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:currentColor;box-shadow:0 0 0 2px #fff,0 2px 6px rgba(0,0,0,.3);display:grid;place-items:center}
.fo-ptr .bub>span{width:19px;height:19px;border-radius:50%;background:rgba(255,255,255,.92);display:grid;place-items:center;font:800 13px/1 ${FONT}}
.fo-ptr svg{width:15px;height:15px;display:block}
.fo-coach-ring{position:absolute;left:0;top:0;width:44px;height:20px;margin:-10px 0 0 -22px;border-radius:50%;border:3px solid currentColor;pointer-events:none;z-index:1;display:none}
.fo-coach-arrow{position:absolute;left:0;top:0;width:30px;height:26px;margin:-26px 0 0 -15px;pointer-events:none;z-index:2;display:none}
.fo-coach-bubble{position:absolute;left:0;top:0;background:#fff;border:2.5px solid currentColor;border-radius:14px;padding:4px 11px;font:800 14px/1.25 ${FONT};white-space:nowrap;max-width:calc(100% - 16px);overflow:hidden;text-overflow:ellipsis;pointer-events:none;z-index:3;display:none;box-shadow:0 3px 0 rgba(0,0,0,.22)}
`;

export function injectStyle(doc: Document): void {
  if (typeof doc.getElementById !== "function" || doc.getElementById("fo-r3d-style")) return;
  const el = doc.createElement("style");
  el.id = "fo-r3d-style";
  el.textContent = STYLE;
  doc.head?.appendChild(el);
}

/** Small inline SVG per pointer icon, coloured from the palette (no asset files). */
export function iconSvg(kind: PointerIcon, pal: SkinPalette): string {
  const svg = (body: string): string => `<svg viewBox="-8 -8 16 16" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  switch (kind) {
    case "hostile": return svg(`<circle r="6.5" cy="1" fill="${pal.ink}"/><circle cx="-2.4" r="1.6" fill="${pal.danger}"/><circle cx="2.4" r="1.6" fill="${pal.danger}"/>`);
    case "pod": return svg(`<rect x="-4.5" y="-7" width="9" height="14" rx="4.5" fill="${pal.glass}" stroke="${pal.ink}" stroke-width="1.2"/><circle cy="-2" r="2.3" fill="#ffffff" opacity=".8"/>`);
    case "person": return svg(`<circle cy="-3.5" r="3" fill="${pal.role["role.idle"] ?? pal.structureDark}" stroke="${pal.ink}" stroke-width="1"/><path d="M-5 7 Q-5 0 0 0 Q5 0 5 7 Z" fill="${pal.role["role.idle"] ?? pal.structureDark}" stroke="${pal.ink}" stroke-width="1"/>`);
    case "core": return svg(`<path d="M-5 6 L-4 0 L-1 2 L0 -7 L2 0 L5 -2 L5 6 Z" fill="${pal.accent}" stroke="${pal.ink}" stroke-width=".8"/><circle cy="2.5" r="2.3" fill="#fff3a0"/>`);
    case "coin": return svg(`<circle r="6" fill="${pal.res["res.currency"] ?? pal.accent}" stroke="${pal.ink}" stroke-width="1.2"/><circle cx="-2" cy="-2" r="1.8" fill="#ffffff" opacity=".6"/>`);
    case "goal": return svg(`<rect x="-4.5" y="-7" width="1.8" height="14" fill="${pal.ink}"/><path d="M-2.7 -7 L6 -4 L-2.7 -1 Z" fill="${pal.accent}" stroke="${pal.ink}" stroke-width=".8"/>`);
    default: return "";
  }
}

export interface PointerTarget { p: V2; color: string; icon: PointerIcon }

interface PtrEl { root: HTMLElement; arr: HTMLElement; inner: HTMLElement; key: string }

/** Edge pointers: an arrow on the ray from the screen centre toward the target, and its icon. */
export class DomPointers {
  private els: PtrEl[] = [];

  constructor(private readonly doc: Document, private readonly mount: HTMLElement, private readonly pal: SkinPalette, n = 8) {
    for (let i = 0; i < n; i++) this.els.push(this.make());
  }

  private make(): PtrEl {
    const root = this.doc.createElement("div");
    root.className = "fo-ptr";
    const arr = this.doc.createElement("div");
    arr.className = "arr";
    const bub = this.doc.createElement("div");
    bub.className = "bub";
    const inner = this.doc.createElement("span");
    bub.appendChild(inner);
    root.appendChild(arr);
    root.appendChild(bub);
    this.mount.appendChild(root);
    return { root, arr, inner, key: "" };
  }

  /** Lay out pointers for every target outside the w × h screen; t (s) drives the bob. */
  update(targets: readonly PointerTarget[], w: number, h: number, t: number, margin = 26): void {
    let used = 0;
    for (const tg of targets) {
      if (used >= this.els.length) break;
      const { x, y } = tg.p;
      if (x > 0 && x < w && y > 0 && y < h) continue;
      const e = this.els[used++]!;
      place(e, tg, w, h, t, margin, this.pal);
    }
    for (let i = used; i < this.els.length; i++) this.els[i]!.root.style.display = "none";
  }

  /** One pointer drawn by the coach (alert icon), independent of the pool. */
  single(): PtrEl { return this.make(); }

  dispose(): void { for (const e of this.els) e.root.remove(); this.els = []; }
}

/** Where the ray from the screen centre toward p leaves the inset screen rect. */
export function edgePoint(p: V2, w: number, h: number, margin: number): { x: number; y: number; ang: number } {
  const cx = w / 2, cy = h / 2, dx = p.x - cx, dy = p.y - cy;
  const s = Math.min(dx ? (w / 2 - margin) / Math.abs(dx) : Infinity, dy ? (h / 2 - margin) / Math.abs(dy) : Infinity);
  const k = Number.isFinite(s) ? s : 0;
  return { x: cx + dx * k, y: cy + dy * k, ang: Math.atan2(dy, dx) };
}

function place(e: PtrEl, tg: PointerTarget, w: number, h: number, t: number, margin: number, pal: SkinPalette): void {
  const ep = edgePoint(tg.p, w, h, margin);
  const bob = Math.sin(t * 6) * 2;
  const bx = ep.x - Math.cos(ep.ang) * bob, by = ep.y - Math.sin(ep.ang) * bob;
  e.root.style.display = "block";
  e.root.style.color = tg.color;
  e.root.style.transform = `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px)`;
  e.arr.style.transform = `rotate(${ep.ang.toFixed(3)}rad) translate(10px,-8px)`;
  e.arr.style.transformOrigin = "0 0";
  const key = `${tg.icon}`;
  if (e.key !== key) {
    e.key = key;
    if (tg.icon === "alert") { e.inner.textContent = "!"; e.inner.style.color = pal.ink; } else e.inner.innerHTML = iconSvg(tg.icon, pal);
  }
}

export interface CoachView {
  text: string;
  /** Seconds since the mark appeared. */
  age: number;
  /** Target on the ground and the point the arrow floats at, in mount px. */
  ground: V2;
  above: V2;
  hero: V2;
  /** Ground-ring scale at the target (perspective). */
  ringScale: number;
}

/** Coach mark over the 3D canvas, laid out like render-2d's drawCoach. */
export class DomCoach {
  private ring: HTMLElement;
  private arrow: HTMLElement;
  private bubble: HTMLElement;
  private edge: PtrEl;

  constructor(doc: Document, mount: HTMLElement, private readonly pal: SkinPalette, pointers: DomPointers) {
    const mk = (cls: string): HTMLElement => {
      const el = doc.createElement("div");
      el.className = cls;
      el.style.color = pal.interactive;
      mount.appendChild(el);
      return el;
    };
    this.ring = mk("fo-coach-ring");
    this.arrow = mk("fo-coach-arrow");
    this.arrow.innerHTML = `<svg viewBox="-16 -13 32 27" width="30" height="26" xmlns="http://www.w3.org/2000/svg"><path d="M-9 -12 L9 -12 L9 -2 L15 -2 L0 12 L-15 -2 L-9 -2 Z" fill="${pal.interactive}" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
    this.bubble = mk("fo-coach-bubble");
    this.bubble.style.color = pal.ink;
    this.bubble.style.borderColor = pal.interactive;
    this.edge = pointers.single();
  }

  hide(): void {
    this.ring.style.display = "none";
    this.arrow.style.display = "none";
    this.bubble.style.display = "none";
    this.edge.root.style.display = "none";
  }

  update(c: CoachView | null, w: number, h: number, t: number, measure: (s: string) => number): void {
    if (!c) { this.hide(); return; }
    const appear = Math.min(1, c.age / 0.25);
    const g = c.ground;
    const onScreen = g.x > 8 && g.x < w - 8 && g.y > 30 && g.y < h - 8;
    if (this.bubble.textContent !== c.text) this.bubble.textContent = c.text;
    const tw = Math.min(w - 40, measure(c.text) + 22);
    const bh = 28;
    let ax: number, ay: number;
    if (onScreen) {
      const pulse = (t * 1.2) % 1;
      const rs = c.ringScale * (1 + pulse * 0.9);
      this.ring.style.display = "block";
      this.ring.style.opacity = ((1 - pulse) * 0.9 * appear).toFixed(2);
      this.ring.style.transform = `translate(${g.x.toFixed(1)}px,${g.y.toFixed(1)}px) scale(${rs.toFixed(3)})`;
      const bounce = Math.abs(Math.sin(t * 5)) * 8;
      this.arrow.style.display = "block";
      this.arrow.style.transform = `translate(${c.above.x.toFixed(1)}px,${(c.above.y - bounce).toFixed(1)}px) scale(${appear.toFixed(2)})`;
      this.edge.root.style.display = "none";
      ax = c.above.x; ay = c.above.y - 30;
    } else {
      this.ring.style.display = "none";
      this.arrow.style.display = "none";
      place(this.edge, { p: g, color: this.pal.interactive, icon: "alert" }, w, h, t, 30, this.pal);
      const ep = edgePoint(g, w, h, 30);
      const dx = g.x - w / 2, dy = g.y - h / 2;
      ax = ep.x - Math.sign(dx) * (tw / 2 + 14) * (Math.abs(dx) > Math.abs(dy) ? 1 : 0);
      ay = ep.y + (dy > 0 ? -34 : 34) * (Math.abs(dy) >= Math.abs(dx) ? 1 : 0);
    }
    let bx = Math.max(8, Math.min(w - tw - 8, ax - tw / 2));
    // stay clear of the hint pill along the bottom edge
    let by = Math.max(8, Math.min(h - bh - 64, ay - bh));
    // keep the hero visible: move the bubble below the target if it would cover them
    const hs = c.hero;
    if (hs.x > bx - 14 && hs.x < bx + tw + 14 && hs.y > by - 10 && hs.y < by + bh + 46) {
      by = onScreen ? Math.min(h - bh - 64, g.y + 26) : Math.max(8, by - 70);
      bx = Math.max(8, Math.min(w - tw - 8, bx));
    }
    this.bubble.style.display = "block";
    this.bubble.style.opacity = appear.toFixed(2);
    this.bubble.style.transform = `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px)`;
  }

  dispose(): void {
    this.ring.remove();
    this.arrow.remove();
    this.bubble.remove();
    this.edge.root.remove();
  }
}
