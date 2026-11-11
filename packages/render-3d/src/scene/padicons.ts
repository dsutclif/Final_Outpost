// Pad icons (R7 pad redesign): one-colour silhouettes (black on transparent, 512 px) kept in
// packages/client/public/padicons. A pad draws one tinted in a single colour, with a thin halo of
// the opposite shade so it reads on any ground. Pictures load once, in the background; labels
// built before a picture lands ask `ready(name)` for their cache key and redraw when it does.

const SIZE = 256;

export class PadIcons {
  private raw = new Map<string, HTMLImageElement | "fail">();
  private tints = new Map<string, HTMLCanvasElement | null>();

  constructor(private readonly doc: Document | null) {}

  /** True once the picture has loaded (use in label cache keys). */
  ready(name: string): boolean {
    this.load(name);
    const r = this.raw.get(name);
    return !!r && r !== "fail" && r.complete && r.naturalWidth > 0;
  }

  /** The icon in one flat colour (no halo, no second tone); null while it loads or where images are unavailable. */
  get(name: string, color: string): HTMLCanvasElement | null {
    if (!this.ready(name)) return null;
    const key = `${name}|${color}`;
    if (this.tints.has(key)) return this.tints.get(key) ?? null;
    let out: HTMLCanvasElement | null = null;
    try { out = this.draw(this.raw.get(name) as HTMLImageElement, color); } catch { out = null; }
    this.tints.set(key, out);
    return out;
  }

  private load(name: string): void {
    if (this.raw.has(name)) return;
    const doc = this.doc;
    if (!doc || typeof doc.createElement !== "function") { this.raw.set(name, "fail"); return; }
    try {
      const im = doc.createElement("img");
      im.onerror = () => this.raw.set(name, "fail");
      im.src = new URL(`padicons/${name}.png`, doc.baseURI).href;
      this.raw.set(name, im);
    } catch { this.raw.set(name, "fail"); }
  }

  private tint(im: HTMLImageElement, color: string, size: number): HTMLCanvasElement {
    const c = this.doc!.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d")!;
    g.drawImage(im, 0, 0, size, size);
    g.globalCompositeOperation = "source-in";
    g.fillStyle = color; g.fillRect(0, 0, size, size);
    return c;
  }

  private draw(im: HTMLImageElement, color: string): HTMLCanvasElement {
    const pad = 8, inner = SIZE - pad * 2;
    const c = this.doc!.createElement("canvas");
    c.width = c.height = SIZE;
    c.getContext("2d")!.drawImage(this.tint(im, color, inner), pad, pad);
    return c;
  }
}

/** Icon file for a hire pad's role (and what it handles). Null: no icon (the pad shows the plain ring). */
export function hireIcon(role: string, res: string): string | null {
  switch (role) {
    case "role.cashier": return "hire-clerk";
    case "role.supplier": return res.startsWith("res.food") ? "hire-hauler-food" : "hire-hauler-ore";
    case "role.operator": return "hire-technician";
    case "role.server": return "hire-runner";
    case "role.hauler": return "hire-courier";
    case "role.defender": return "hire-guard";
    case "role.hunter": return "hire-ranger";
    case "role.medic": return "hire-medic";
    default: return null;
  }
}

/** Icon file for a build, upgrade or unlock pad. */
export function buildIcon(what: string, targetType: string | undefined): string {
  switch (what) {
    case "node.enable": return "unlock-node";
    case "sink.core.level": return "upgrade-reactor";
    case "conv.level":
      return targetType === "conv.food_processor" ? "upgrade-galley" : targetType === "conv.material_processor" ? "upgrade-smelter" : targetType === "conv.alloy_works" ? "upgrade-partsworks" : "pin-build";
    case "struct.barracks.t2": return "upgrade-guardpost";
    case "struct.barrier.reinforced": return "upgrade-wall";
    case "struct.ranged_defense.t2": return "upgrade-turret-t2";
    case "struct.ranged_defense.t3": return "upgrade-turret-t3";
    case "zone.clear": return "pin-clear-rockslide";
    case "struct.ranged_defense": return "pin-build-turret";
    default: return "pin-build";
  }
}

/** Icon file for a warehouse pickup pad (the stored resource); null when no icon matches. */
export function resourceIcon(res: string): string | null {
  switch (res) {
    case "res.material_basic": case "res.fuel_dense": case "res.salvage": return "resource-ore";
    case "res.food_raw_1": return "resource-greens";
    case "res.food_raw_2": return "resource-pouch";
    case "res.food_prepared": return "resource-meal";
    case "res.material_refined": return "resource-ingot";
    case "res.component": return "resource-alloy";
    case "res.currency": return "resource-credit";
    default: return null;
  }
}
