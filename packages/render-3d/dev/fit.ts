import { getSkin, DEFAULT_SKIN } from "@fo/skins";
import { Raycaster, Vector2, ACESFilmicToneMapping, AxesHelper, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, HemisphereLight, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, SRGBColorSpace, Vector3, WebGLRenderer } from "three";
import gen from "../../generator/data/generator.json";
import { createBuildCtx } from "../src/assets/context.js";
import { loadMeshy, meshyEntries } from "../src/assets/meshy.js";
import { buildModel } from "../src/assets/registry.js";
import { PITCH_DEG, YAW_DEG } from "../src/units.js";

// Fitting view for Meshy models: per entry, the code model (left) beside the GLB (right) from
// the game camera's angle, on the generator footprint (yellow), with anchors (cyan dots) and
// animated parts (axes). ?i=<n> frames one entry; ?yaw=<deg> turns the camera; ?code=0 hides
// the code model; ?w=<px>&h=<px> sets the canvas size (default: window).

const q = new URLSearchParams(location.search);
const W = Number(q.get("w") ?? innerWidth), H = Number(q.get("h") ?? innerHeight);
const gl = new WebGLRenderer({ antialias: true });
gl.outputColorSpace = SRGBColorSpace;
gl.toneMapping = ACESFilmicToneMapping;
gl.toneMappingExposure = 1.35;
gl.setPixelRatio(1);
gl.setSize(W, H);
document.body.appendChild(gl.domElement);

const skin = getSkin(q.get("skin") ?? DEFAULT_SKIN);
await loadMeshy(undefined, undefined, location.href);
const entries = meshyEntries();
const ctx = createBuildCtx(skin);
const t = ctx.t;
const scene = new Scene();
scene.background = new Color(t.fog);
scene.add(new HemisphereLight(new Color(t.sky), new Color(t.groundDark), 1.4));
const sun = new DirectionalLight(new Color(t.sun), 2.6);
sun.position.set(-8, 5, 3);
scene.add(sun);
const ground = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial({ color: new Color(t.ground) }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.01;
scene.add(ground);
const fp = (gen as { footprints: Record<string, number[]> }).footprints;
const dot = new SphereGeometry(0.06, 8, 6), dotMat = new MeshBasicMaterial({ color: new Color(t.interactive), depthTest: false });
const lineMat = new LineBasicMaterial({ color: 0xffd23c });
const showCode = q.get("code") !== "0";
const ROW = 5.5, COL = 3.6;

entries.forEach((e, i) => {
  if (q.get("i") !== null && Number(q.get("i")) !== i) return;
  const top = !!q.get("top");
  const z = top ? Math.floor(i / 4) * 4 : i * ROW;
  for (const glb of showCode ? [false, true] : [true]) {
    const m = buildModel(e.id, { ...ctx, level: e.level ?? 1 });
    if (glb !== !!m.root.userData["meshy"]) { if (glb) console.warn(`${e.file} not loaded`); }
    if (!glb && m.root.userData["meshy"]) continue;
    const x = top ? (i % 4) * 4 : glb ? COL : 0;
    m.root.position.set(x, 0, z);
    scene.add(m.root);
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      if (o.userData["anchor"]) { const d = new Mesh(dot, dotMat); d.renderOrder = 9; o.getWorldPosition(d.position); scene.add(d); }
    });
    if (q.get("parts") === "0") for (const p of Object.values(m.parts)) p.visible = false;
    for (const p of Object.values(m.parts)) { const a = new AxesHelper(0.35); p.getWorldPosition(a.position); scene.add(a); }
    const f = fp[e.id];
    if (f) {
      const [x0, y0, x1, y1] = f.map((v) => v / 28) as [number, number, number, number];
      const g = new BufferGeometry().setAttribute("position", new Float32BufferAttribute([x0, 0.01, y0, x1, 0.01, y0, x1, 0.01, y1, x0, 0.01, y1].map((v, k) => v + (k % 3 === 0 ? x : k % 3 === 2 ? z : 0)), 3));
      scene.add(new LineLoop(g, lineMat));
    }
  }
});

const one = q.get("i");
const yaw = ((Number(q.get("yaw") ?? YAW_DEG)) * Math.PI) / 180, pitch = (PITCH_DEG * Math.PI) / 180;
const look = one !== null ? new Vector3(showCode ? COL / 2 : COL, 0.8, Number(one) * ROW) : new Vector3(COL / 2, 0, ((entries.length - 1) * ROW) / 2);
const span = q.get("span") ? Number(q.get("span")) : one !== null ? (showCode ? 8 : 4.2) : entries.length * ROW * 0.75;
const cam = new PerspectiveCamera(one !== null ? 20 : 30, W / H, 0.1, 1000);
const d = span / 2 / Math.tan((cam.fov * Math.PI) / 360) * (W < H ? H / W : 1) * 0.9;
cam.position.set(look.x + Math.sin(yaw) * Math.cos(pitch) * d, look.y + Math.sin(pitch) * d, look.z + Math.cos(yaw) * Math.cos(pitch) * d);
if (q.get("top") && one !== null) { const o = Number(one); cam.position.set((o % 4) * 4, 9, Math.floor(o / 4) * 4); cam.up.set(0, 0, -1); cam.lookAt((o % 4) * 4, 0, Math.floor(o / 4) * 4); } else if (q.get("top")) { cam.position.set(6, 17, 2); cam.up.set(0, 0, -1); cam.lookAt(6, 0, 2); } else cam.lookAt(look);
function draw(): void {
if (q.get("quad")) {
  // four sides of one model: from +z (front, top left), +x, -z, -x
  gl.setScissorTest(true);
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
  [0, 90, 180, 270].forEach((deg, k) => {
    const a = (deg * Math.PI) / 180;
    const c = cam.clone();
    c.position.set(look.x + Math.sin(a) * Math.cos(pitch) * d, look.y + Math.sin(pitch) * d, look.z + Math.cos(a) * Math.cos(pitch) * d);
    c.lookAt(look);
    const x = (k % 2) * W / 2, y = (k < 2 ? 1 : 0) * H / 2;
    gl.setViewport(x, y, W / 2, H / 2);
    gl.setScissor(x, y, W / 2, H / 2);
    gl.render(scene, c);
  });
} else gl.render(scene, cam);
requestAnimationFrame(draw);
}
draw();
(window as unknown as { __fit: unknown }).__fit = { ready: true, entries: entries.map((e) => e.file) };

// click a model (single, non-quad view) to read the point in its own art-metre coordinates
const out = document.createElement("pre");
out.style.cssText = "position:fixed;left:4px;bottom:4px;margin:0;color:#fff;background:#000a;font:14px monospace;padding:4px";
document.body.appendChild(out);
gl.domElement.addEventListener("click", (ev) => {
  const r = gl.domElement.getBoundingClientRect();
  const ray = new Raycaster();
  ray.setFromCamera(new Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), cam);
  const hit = ray.intersectObjects(scene.children, true).find((h) => h.object !== ground && (h.object as Mesh).isMesh && h.object.name === "body");
  if (!hit) return;
  let root = hit.object; while (root.parent && root.parent !== scene) root = root.parent;
  const p = root.worldToLocal(hit.point.clone());
  out.textContent += `${root.name} ${p.toArray().map((v) => v.toFixed(2)).join(", ")}\n`;
});
