import { AmbientLight, Box3, DirectionalLight, Mesh, OrthographicCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderTarget, type WebGLRenderer } from "three";
import type { Items } from "./items.js";

// Small pictures of resource items for labels (backlog R6 G9: a trader's order shows the item, not a
// coloured dot). Each item's own geometry and material is drawn once, from the game's camera angle, into
// a small transparent target and kept as a canvas; a Meshy model that lands later gets a fresh picture.

const SIZE = 96;

export class ItemIcons {
  private cache = new Map<string, HTMLCanvasElement | null>();
  private rt: WebGLRenderTarget | null = null;
  private scene: Scene | null = null;
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0.1, 20);

  constructor(private readonly gl: WebGLRenderer, private readonly items: Items, private readonly doc: Document) {}

  /** The item's picture, or null when it cannot be drawn here (then the label falls back to the colour dot). */
  get(res: string): HTMLCanvasElement | null {
    const src = this.items.source(res);
    const key = `${res}|${src.modeled ? "m" : "c"}`;
    if (this.cache.has(key)) return this.cache.get(key) ?? null;
    let out: HTMLCanvasElement | null = null;
    try { out = this.draw(src.geo, src.mat); } catch { out = null; }
    this.cache.set(key, out);
    return out;
  }

  /** Changes when the picture for `res` would (a Meshy model landed), for label cache keys. */
  version(res: string): string {
    return this.items.source(res).modeled ? "m" : "c";
  }

  private draw(geo: import("three").BufferGeometry, mat: import("three").Material): HTMLCanvasElement {
    if (!geo.boundingBox) geo.computeBoundingBox();
    const box: Box3 = geo.boundingBox!;
    const size = box.getSize(new Vector3()), mid = box.getCenter(new Vector3());
    const r = Math.max(size.x, size.y, size.z) * 0.62 || 1;
    if (!this.scene) {
      this.scene = new Scene();
      this.scene.add(new AmbientLight(0xffffff, 0.95));
      const d = new DirectionalLight(0xffffff, 1.5);
      d.position.set(1.5, 3, 2);
      this.scene.add(d);
      this.rt = new WebGLRenderTarget(SIZE, SIZE);
      this.rt.texture.colorSpace = SRGBColorSpace;
    }
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(mid).multiplyScalar(-1);
    this.scene.add(mesh);
    this.cam.left = -r; this.cam.right = r; this.cam.top = r; this.cam.bottom = -r;
    this.cam.position.set(r * 1.6, r * 1.5, r * 1.6);
    this.cam.lookAt(0, 0, 0);
    this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld();
    const gl = this.gl, prevRt = gl.getRenderTarget(), prevA = gl.getClearAlpha();
    gl.setRenderTarget(this.rt);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(this.scene, this.cam);
    const px = new Uint8Array(SIZE * SIZE * 4);
    gl.readRenderTargetPixels(this.rt!, 0, 0, SIZE, SIZE, px);
    gl.setRenderTarget(prevRt);
    gl.setClearAlpha(prevA);
    this.scene.remove(mesh);
    const raw = this.doc.createElement("canvas");
    raw.width = raw.height = SIZE;
    const rg = raw.getContext("2d")!;
    const img = rg.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) img.data.set(px.subarray((SIZE - 1 - y) * SIZE * 4, (SIZE - y) * SIZE * 4), y * SIZE * 4);
    rg.putImageData(img, 0, 0);
    // a dark outline round the shape, so a pale item (protein) still reads on the pale bubble
    const c = this.doc.createElement("canvas");
    c.width = c.height = SIZE;
    const g = c.getContext("2d")!;
    const sil = this.doc.createElement("canvas");
    sil.width = sil.height = SIZE;
    const sg = sil.getContext("2d")!;
    sg.drawImage(raw, 0, 0);
    sg.globalCompositeOperation = "source-in"; sg.fillStyle = "#1b1b22"; sg.fillRect(0, 0, SIZE, SIZE);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; g.drawImage(sil, Math.cos(a) * 2.2, Math.sin(a) * 2.2); }
    g.drawImage(raw, 0, 0);
    return c;
  }

  dispose(): void {
    this.rt?.dispose();
    this.cache.clear();
  }
}
