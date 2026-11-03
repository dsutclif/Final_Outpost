import {
  ACESFilmicToneMapping, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, RingGeometry, Scene, SRGBColorSpace, SphereGeometry, Vector3, WebGLRenderer, type Object3D,
} from "three";
import { DEFAULT_SKIN, getSkin } from "@fo/skins";
import { loadMeshy, meshyScene } from "@fo/render-3d/meshy";
import { Rigged } from "@fo/render-3d/rigged";
import { ART_M, BUILD_K, CHAR_K } from "@fo/render-3d/units";
import { HEMI, SUN } from "@fo/render-3d/environment";
import { deriveTokens } from "@fo/render-3d/tokens";
import { EXPOSURE } from "@fo/render-3d/renderer";
import { ARENA, cardRows, createFight, PROPOSALS, roster, SHOT_NAME, stepFight, type Edits, type Fight, type Mode, type Unit } from "./arenaModel.js";
import type { FighterNums } from "./fighterStats.js";

// Fighter arena (dev sandbox, R6 Release 2 Bundle 5): enemy cards left, settler cards right, the fight in the middle.
// The rules live in arenaModel.ts; this file only draws them. HP shows as a bar over each fighter and reach as a
// circle on the ground, never as card numbers (Doug). Tracers: white-hot core, blue glow for settlers, red for
// enemy rifles, green for acid spit; life as fx.ts tracer (0.16 s).

const CSS = `
#arena { position: fixed; inset: 0; z-index: 20; background: #141518; color: var(--fg); display: none; flex-direction: column; touch-action: none; }
#arena.open { display: flex; }
#arena .bar { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 8px 12px; padding-top: calc(8px + env(safe-area-inset-top)); border-bottom: 1px solid #2a2b2f; }
#arena .bar button.on { background: var(--acc); color: #1c1d20; border-color: var(--acc); }
#arena .bar label { font-size: 14px; color: var(--dim); display: flex; gap: 4px; align-items: center; }
#arena .stat { font-size: 13px; color: var(--dim); font-variant-numeric: tabular-nums; flex: 1 1 100%; min-height: 1.2em; }
#arena .main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(230px, 300px) 1fr minmax(230px, 300px); grid-template-areas: "left stage right"; }
#arena .cards { overflow-y: auto; touch-action: pan-y; padding: 8px; min-height: 0; -webkit-overflow-scrolling: touch; }
#arena .left { grid-area: left; } #arena .right { grid-area: right; }
#arena .cards h4 { margin: 2px 0 6px; font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: .06em; }
#arena .stage { grid-area: stage; position: relative; min-width: 0; min-height: 0; overflow: hidden; }
#arena .stage canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
#arena .banner { position: absolute; left: 50%; top: 12px; transform: translateX(-50%); background: rgba(20,21,24,.9); border: 1px solid var(--acc); border-radius: 10px; padding: 8px 14px; font-weight: 600; text-align: center; display: none; max-width: 90%; }
#arena .card { background: #1f2024; border: 1px solid #333; border-radius: 10px; padding: 8px 10px; margin-bottom: 8px; }
#arena .card.sel { border-color: var(--acc); box-shadow: 0 0 0 1px var(--acc) inset; }
#arena .card .hd { display: flex; align-items: center; gap: 6px; cursor: pointer; }
#arena .card .hd b { flex: 1; font-size: 14px; word-break: break-word; }
#arena .card .cnt { display: none; gap: 4px; align-items: center; }
#arena .card.sel .cnt { display: flex; }
#arena .card .cnt button { padding: 2px 9px; }
#arena .card .cnt span { min-width: 1.6em; text-align: center; font-variant-numeric: tabular-nums; }
#arena .card table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 4px; }
#arena .card td { padding: 2px 4px 2px 0; vertical-align: middle; }
#arena .card td.l { color: var(--dim); }
#arena .card input { width: 4.2em; font: inherit; color: var(--fg); background: #2a2b30; border: 1px solid #3a3b40; border-radius: 5px; padding: 1px 4px; text-align: right; }
#arena .card input.ed { border-color: var(--acc); }
#arena .tag { font-size: 11px; margin-left: 3px; white-space: nowrap; }
#arena .tag.new { color: #7fd99a; } #arena .tag.chg { color: var(--acc); }
#arena .card details { margin-top: 2px; font-size: 12px; color: var(--dim); }
#arena .card .undo { font-size: 11px; color: var(--dim); background: none; border: none; padding: 0; text-decoration: underline; }
@media (max-width: 760px) {
  #arena .main { grid-template-columns: 1fr 1fr; grid-template-rows: minmax(220px, 44vh) 1fr; grid-template-areas: "stage stage" "left right"; }
  #arena .cards { padding: 6px; }
  #arena .card { padding: 6px 7px; }
  #arena .card table { font-size: 11.5px; }
  #arena .card input { width: 3.6em; }
}`;

// longer than the game's 0.16 s so a shot can be followed by eye; the arena is for reading the fight
const TRACER_LIFE = 0.45;
const GLOW: Record<string, string> = { settler: "#5aa8ff", enemy: "#ff4a3a", acid: "#8ff05a" };
const CHAR_ID: Record<string, string> = { player: "unit.player", guard: "role.defender" };

interface Tracer { a: Vector3; b: Vector3; kind: string; born: number }

export interface ArenaUi { open(): void; close(): void }

export function createArena(): ArenaUi {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
  const root = document.createElement("div");
  root.id = "arena";
  document.body.append(root);

  const R = roster();
  const enemyF = R.fighters.filter((f) => f.side === "enemy"), settlerF = R.fighters.filter((f) => f.side === "settler");
  let mode: Mode = "r2";
  const edits: Record<Mode, Edits> = { r2: {}, today: {} };
  const pick = { enemy: "hostile.swarmling", enemies: 10, settler: "drone", settlers: 2 };
  let speed = 1, running = false, fight: Fight;

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] => {
    const e = document.createElement(tag);
    if (text !== undefined) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  };

  // ---- top bar ----
  const bar = el("div", undefined, "bar");
  const back = el("button", "Back");
  const today = el("label");
  const todayBox = el("input"); todayBox.type = "checkbox";
  today.append(todayBox, "Today's rules");
  const start = el("button", "Start"), reset = el("button", "Reset");
  const speeds = [1, 2, 4].map((k) => { const b = el("button", `${k}x`); b.onclick = () => { speed = k; paintSpeeds(); }; return b; });
  const stat = el("div", undefined, "stat");
  bar.append(back, start, reset, ...speeds, today, stat);
  const paintSpeeds = (): void => speeds.forEach((b, i) => b.classList.toggle("on", [1, 2, 4][i] === speed));
  paintSpeeds();

  const main = el("div", undefined, "main");
  const left = el("div", undefined, "cards left"), right = el("div", undefined, "cards right"), stage = el("div", undefined, "stage");
  const banner = el("div", undefined, "banner");
  main.append(left, stage, right);
  root.append(bar, main);

  // ---- cards ----
  function card(f: FighterNums): HTMLElement {
    const side = f.side === "enemy" ? "enemy" : "settler";
    const c = el("div", undefined, "card");
    const sel = pick[side] === f.id;
    c.classList.toggle("sel", sel);
    const hd = el("div", undefined, "hd");
    const cnt = el("div", undefined, "cnt");
    const minus = el("button", "−"), plus = el("button", "+"), n = el("span", String(side === "enemy" ? pick.enemies : pick.settlers));
    const bump = (d: number): void => {
      const k = side === "enemy" ? "enemies" : "settlers";
      pick[k] = Math.max(1, Math.min(side === "enemy" ? 60 : 16, pick[k] + d));
      n.textContent = String(pick[k]);
      newFight();
    };
    minus.onclick = (e) => { e.stopPropagation(); bump(-1); };
    plus.onclick = (e) => { e.stopPropagation(); bump(1); };
    cnt.append(minus, n, plus);
    // skin names where the title is a raw id (hostiles), so cards read "Dust mite", not hostile.swarmling
    hd.append(el("b", getSkin(DEFAULT_SKIN).names[f.title] ?? f.title), cnt);
    hd.onclick = () => { if (pick[side] !== f.id) { pick[side] = f.id; renderCards(); newFight(); } };
    c.append(hd);
    const rows = cardRows(f, mode, edits[mode]);
    const shown = el("table"), hidden = el("table");
    for (const r of rows) {
      const tr = el("tr");
      const inp = el("input");
      inp.type = "number"; inp.step = "any"; inp.inputMode = "decimal";
      inp.value = String(+r.v.toFixed(3));
      const ek = `${f.id}:${r.stat}`;
      if (ek in edits[mode]) inp.classList.add("ed");
      inp.title = `${r.src}${r.why ? ` · ${r.why}` : ""}`;
      inp.onchange = () => {
        const v = Number(inp.value);
        if (!Number.isFinite(v)) return;
        edits[mode][ek] = v;
        renderCards();
        newFight();
      };
      const vt = el("td"); vt.append(inp);
      if (r.unit) vt.append(el("span", ` ${r.unit}`, "tag"));
      if (r.isNew) vt.append(el("span", "(new)", "tag new"));
      else if (r.changed) vt.append(el("span", `(was ${+r.today!.toFixed(3)})`, "tag chg"));
      tr.append(el("td", r.label, "l"), vt);
      (r.hidden ? hidden : shown).append(tr);
    }
    c.append(shown);
    if (hidden.childElementCount) {
      const d = el("details");
      d.append(el("summary", "HP and reach (shown in the arena)"), hidden);
      c.append(d);
    }
    if (Object.keys(edits[mode]).some((k) => k.startsWith(f.id + ":"))) {
      const u = el("button", "undo my edits", "undo");
      u.onclick = () => { for (const k of Object.keys(edits[mode])) if (k.startsWith(f.id + ":")) delete edits[mode][k]; renderCards(); newFight(); };
      c.append(u);
    }
    return c;
  }
  function renderCards(): void {
    const tag = mode === "r2" ? "Release 2 proposals" : "today's rules";
    left.replaceChildren(el("h4", `Enemies · ${tag}`), ...enemyF.map(card));
    right.replaceChildren(el("h4", `Settlers · ${tag}`), ...settlerF.map(card));
  }

  // ---- three.js arena ----
  const t = deriveTokens(getSkin(DEFAULT_SKIN));
  const canvas = el("canvas"), over = el("canvas");
  stage.append(canvas, over, banner);
  const gl = new WebGLRenderer({ canvas, antialias: true });
  gl.outputColorSpace = SRGBColorSpace;
  gl.toneMapping = ACESFilmicToneMapping;
  gl.toneMappingExposure = EXPOSURE;
  gl.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new Scene();
  scene.background = new Color(t.fog);
  const sun = new DirectionalLight(new Color(t.sun), SUN);
  sun.position.set(ARENA.w / 2 - 300, 500, ARENA.h / 2 + 200);
  sun.target.position.set(ARENA.w / 2, 0, ARENA.h / 2);
  scene.add(new HemisphereLight(new Color(t.sky), new Color(t.groundDark), HEMI), sun, sun.target);
  const ground = new Mesh(new PlaneGeometry(ARENA.w + 200, ARENA.h + 200), new MeshStandardMaterial({ color: new Color(t.ground), roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(ARENA.w / 2, 0, ARENA.h / 2);
  const field = new Mesh(new PlaneGeometry(ARENA.w, ARENA.h), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12, depthWrite: false }));
  field.rotation.x = -Math.PI / 2;
  field.position.set(ARENA.w / 2, 0.2, ARENA.h / 2);
  scene.add(ground, field);
  const camera = new PerspectiveCamera(28, 1, 10, 8000);
  const dyn = new Group();
  scene.add(dyn);
  const rigged = new Rigged(dyn);
  const charScale = (ART_M * CHAR_K) / 0.9;

  const disc = new CircleGeometry(1, 48), rim = new RingGeometry(0.96, 1, 64);
  const circleMat = (c: string, o: number): MeshBasicMaterial => new MeshBasicMaterial({ color: new Color(c), transparent: true, opacity: o, depthWrite: false });
  const mats = { enemy: [circleMat("#ff6a50", 0.07), circleMat("#ff6a50", 0.4)], settler: [circleMat("#5aa8ff", 0.07), circleMat("#5aa8ff", 0.4)], acid: [circleMat("#8ff05a", 0.05), circleMat("#8ff05a", 0.35)], rifle: [circleMat("#ff4a3a", 0.04), circleMat("#ff4a3a", 0.3)] };
  type Pool = { circles: Mesh[]; body: Object3D | null };
  const pool = new Map<number, Pool>();
  const fallbackGeo = { body: new CylinderGeometry(6, 7, 26, 12), head: new SphereGeometry(5, 12, 8) };

  function circlesFor(u: Unit): { r: number; m: MeshBasicMaterial[] }[] {
    const side = u.side === "enemy" ? mats.enemy : mats.settler;
    const out = [{ r: u.s.range ?? 0, m: side }];
    if (u.kind === "player" && u.s.gunRange) out.push({ r: u.s.gunRange, m: side });
    if ((u.s.shotRange ?? 0) > 0) out.push({ r: u.s.shotRange!, m: SHOT_NAME[u.type] === "Acid spit" ? mats.acid : mats.rifle });
    return out.filter((c) => c.r > 0);
  }

  function bodyFor(u: Unit): Object3D | null {
    if (u.kind === "drone") {
      const b = meshyScene("unit.drone");
      if (!b) return null;
      const g = new Group(); const h = new Group(); h.rotation.y = Math.PI / 2; h.position.y = 0.9; h.add(b); g.add(h);
      g.scale.setScalar(ART_M * CHAR_K);
      return g;
    }
    if (u.kind === "tower") {
      const base = meshyScene("struct.ranged_defense.base"), head = meshyScene(`struct.ranged_defense.head${u.type.slice(5)}`);
      if (!base || !head) return null;
      const g = new Group(); head.position.y = 0.75; g.add(base, head);
      g.scale.setScalar(ART_M * BUILD_K);
      return g;
    }
    return null;
  }
  function fallback(u: Unit): Object3D {
    const c = u.side === "enemy" ? "#c0503c" : u.kind === "tower" ? "#8a8f99" : "#4a86c8";
    const g = new Group();
    const m = new MeshStandardMaterial({ color: new Color(c) });
    const b = new Mesh(fallbackGeo.body, m); b.position.y = 13;
    const h = new Mesh(fallbackGeo.head, m); h.position.y = 30;
    g.add(b, h);
    if (u.kind === "hostile" && u.type === "hostile.swarmling" || u.kind === "hopper") g.scale.set(1, 0.45, 1);
    return g;
  }
  let core: Object3D | null = null;
  function placeCore(): void {
    if (core) return;
    const c = meshyScene("sink.core.l1");
    core = c ? (() => { const g = new Group(); g.add(c); g.scale.setScalar(ART_M * BUILD_K); return g; })()
      : new Mesh(new CylinderGeometry(20, 24, 30, 16), new MeshStandardMaterial({ color: new Color("#d0a050") }));
    if (!c) core.position.y = 15;
    core.position.x = fight.base.x; core.position.z = fight.base.y;
    scene.add(core);
  }

  const ids = new Set(["unit.player", "role.defender", "unit.drone", "unit.drone.rotor", "struct.ranged_defense", "sink.core", ...enemyF.map((f) => f.id)]);
  // models land in the background: code-built stand-ins until then, swapped once everything is in
  let rebuild = false;
  void loadMeshy(undefined, ids, undefined, true).then(() => { rebuild = true; if (core) { scene.remove(core); core = null; } });

  function sync(): void {
    rigged.begin();
    const seen = new Set<number>();
    if (rebuild) { rebuild = false; for (const p of pool.values()) if (p.body) { dyn.remove(p.body); p.body = null; } }
    for (const u of fight.units) {
      if (u.status === "dead") continue;
      seen.add(u.uid);
      let p = pool.get(u.uid);
      if (!p) {
        const circles = circlesFor(u).flatMap(({ r, m }) => {
          const d = new Mesh(disc, m[0]); const e = new Mesh(rim, m[1]);
          for (const x of [d, e]) { x.rotation.x = -Math.PI / 2; x.scale.setScalar(r); x.renderOrder = 1; dyn.add(x); }
          return [d, e];
        });
        p = { circles, body: null };
        pool.set(u.uid, p);
      }
      for (const c of p.circles) { c.position.set(u.x, 0.4, u.y); c.visible = u.status === "ok"; }
      const cid = CHAR_ID[u.kind] ?? (u.side === "enemy" ? u.type : "");
      const entry = cid ? rigged.entryFor(cid) : undefined;
      const moving = Math.hypot(u.vx, u.vy) > 0.02;
      if (entry) {
        if (p.body) { dyn.remove(p.body); p.body = null; }
        rigged.add(`a${u.uid}`, cid, entry, { moving, hurried: false, cheer: false, speed: Math.min(1, Math.hypot(u.vx, u.vy) / 2), run: u.kind === "hostile" && !!u.dash, act: u.act > 0 && entry.clips?.["shoot"] ? "shoot" : undefined, lying: u.status === "down" }, u.x, u.y, u.face, charScale);
        continue;
      }
      if (!p.body) { p.body = bodyFor(u) ?? fallback(u); dyn.add(p.body); }
      p.body.position.set(u.x, 0, u.y);
      if (u.kind !== "tower") p.body.rotation.set(u.status === "down" ? -Math.PI / 2 : 0, u.face, 0, "YXZ");
      else if (u.act > 0 && p.body.children[1]) p.body.children[1].rotation.y = u.face - Math.PI / 2;
    }
    for (const [k, p] of pool) if (!seen.has(k)) { for (const c of p.circles) dyn.remove(c); if (p.body) dyn.remove(p.body); pool.delete(k); }
  }

  // ---- overlay: health bars and tracers ----
  const ctx = over.getContext("2d")!;
  const tracers: Tracer[] = [];
  const v = new Vector3();
  const proj = (x: number, y: number, z: number): { x: number; y: number } => {
    v.set(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * over.clientWidth, y: (1 - v.y) / 2 * over.clientHeight };
  };
  const heightOf = (u: Unit): number => u.kind === "tower" ? 46 : u.kind === "drone" ? 40 : u.type === "hostile.swarmling" || u.type === "hostile.creature" || u.kind === "hopper" ? 22 : 38;
  const flashes: { x: number; y: number; z: number; born: number }[] = [];
  /** A damage number rising over whoever was hit, so every strike, ranged or not, can be counted. */
  const pops: { x: number; y: number; z: number; text: string; color: string; born: number }[] = [];
  const muzzles: { x: number; y: number; z: number; kind: string; born: number }[] = [];

  function draw2d(now: number): void {
    const dpr = Math.min(2, devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, over.clientWidth, over.clientHeight);
    ctx.lineCap = "round";
    for (let i = tracers.length - 1; i >= 0; i--) {
      const tr = tracers[i]!, k = 1 - (now - tr.born) / 1000 / TRACER_LIFE;
      if (k <= 0) { tracers.splice(i, 1); continue; }
      const a = proj(tr.a.x, tr.a.y, tr.a.z), b = proj(tr.b.x, tr.b.y, tr.b.z);
      ctx.globalAlpha = k;
      ctx.strokeStyle = GLOW[tr.kind]!; ctx.lineWidth = 5; ctx.shadowColor = GLOW[tr.kind]!; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = "#fffdf4"; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i]!, k = 1 - (now - f.born) / 220;
      if (k <= 0) { flashes.splice(i, 1); continue; }
      const p = proj(f.x, f.y, f.z);
      ctx.globalAlpha = k; ctx.strokeStyle = "#ffd27a"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4 + 6 * (1 - k), 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = muzzles.length - 1; i >= 0; i--) {
      const m = muzzles[i]!, k = 1 - (now - m.born) / 120;
      if (k <= 0) { muzzles.splice(i, 1); continue; }
      const p = proj(m.x, m.y, m.z);
      ctx.globalAlpha = k; ctx.fillStyle = "#fffdf4"; ctx.shadowColor = GLOW[m.kind]!; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.font = "700 13px system-ui, sans-serif"; ctx.textAlign = "center";
    for (let i = pops.length - 1; i >= 0; i--) {
      const q = pops[i]!, t = (now - q.born) / 800;
      if (t >= 1) { pops.splice(i, 1); continue; }
      const p = proj(q.x, q.y, q.z);
      ctx.globalAlpha = 1 - t; ctx.fillStyle = q.color; ctx.strokeStyle = "rgba(0,0,0,.7)"; ctx.lineWidth = 3;
      ctx.strokeText(q.text, p.x, p.y - 18 * t); ctx.fillText(q.text, p.x, p.y - 18 * t);
    }
    ctx.globalAlpha = 1;
    const bw = Math.max(18, Math.min(30, over.clientWidth / 28));
    const barAt = (x: number, y: number, z: number, frac: number, downed: boolean): void => {
      const p = proj(x, y, z);
      ctx.fillStyle = "rgba(0,0,0,.65)"; ctx.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 6);
      ctx.fillStyle = downed ? "#777" : frac > 0.5 ? "#62d26f" : frac > 0.25 ? "#e8c34a" : "#e8584a";
      ctx.fillRect(p.x - bw / 2, p.y, bw * Math.max(0, frac), 4);
    };
    for (const u of fight.units) {
      if (u.status === "dead" || u.hpMax <= 0) continue;
      barAt(u.x, heightOf(u) + 6, u.y, u.hp / u.hpMax, u.status === "down");
      if (u.status === "down") { const p = proj(u.x, heightOf(u) + 6, u.y); ctx.fillStyle = "#ccc"; ctx.font = "10px system-ui"; ctx.textAlign = "center"; ctx.fillText("down", p.x, p.y - 3); }
    }
    barAt(fight.base.x, 60, fight.base.y, fight.base.hp / fight.base.hpMax, false);
  }

  // ---- loop ----
  function fit(): void {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    gl.setSize(w, h, false);
    const dpr = Math.min(2, devicePixelRatio || 1);
    over.width = w * dpr; over.height = h * dpr;
    camera.aspect = w / h;
    // straight on from the south, tilted down 55 degrees; back off until the field fits both ways
    const pitch = (55 * Math.PI) / 180, vf = (camera.fov * Math.PI) / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dW = (ARENA.w + 40) / 2 / Math.tan(hf / 2), dH = ((ARENA.h + 30) * Math.sin(pitch) + 50 * Math.cos(pitch)) / 2 / Math.tan(vf / 2);
    const d = Math.max(dW, dH) + ARENA.h / 2 * Math.cos(pitch);
    const cx = ARENA.w / 2, cz = ARENA.h / 2;
    camera.position.set(cx, Math.sin(pitch) * d, cz + Math.cos(pitch) * d);
    camera.lookAt(cx, 0, cz);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(stage);

  let raf = 0, last = 0, acc = 0;
  function frame(now: number): void {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - (last || now)) / 1000);
    last = now;
    if (running && !fight.result) {
      acc += dt * speed;
      const step = 1 / ARENA.tps;
      while (acc >= step && !fight.result) {
        const h0 = fight.hits.length;
        stepFight(fight);
        acc -= step;
        for (const s of fight.shots) { tracers.push({ a: new Vector3(s.fx, 20, s.fy), b: new Vector3(s.tx, 16, s.ty), kind: s.kind, born: now }); muzzles.push({ x: s.fx, y: 20, z: s.fy, kind: s.kind, born: now }); }
        for (let i = h0; i < fight.hits.length; i++) {
          const hit = fight.hits[i]!;
          const tu = hit.target === "base" ? fight.base : fight.units.find((u) => u.uid === hit.target);
          if (!tu) continue;
          flashes.push({ x: tu.x, y: 18, z: tu.y, born: now });
          const bySettler = fight.units.find((u) => u.uid === hit.by)?.side === "settler";
          if (hit.dmg > 0) pops.push({ x: tu.x, y: 30, z: tu.y, text: `-${+hit.dmg.toFixed(1)}`, color: bySettler ? GLOW["settler"]! : hit.ranged && GLOW["acid"] && fight.units.find((u) => u.uid === hit.by)?.type === "hostile.swarmling" ? GLOW["acid"]! : GLOW["enemy"]!, born: now });
        }
      }
      if (fight.result) showResult();
    }
    placeCore();
    sync();
    rigged.end(running ? dt * speed : dt);
    gl.render(scene, camera);
    draw2d(now);
    paintStat();
  }

  function paintStat(): void {
    const e = fight.units.filter((u) => u.side === "enemy" && u.status !== "dead").length + fight.pending.length;
    const s = fight.units.filter((u) => u.side === "settler" && u.status === "ok").length;
    const rangedBy = (side: string): number => fight.hits.filter((h) => h.ranged && fight.units.find((u) => u.uid === h.by)?.side === side).length;
    stat.textContent = `${(fight.tick / ARENA.tps).toFixed(1)} s · ranged hits: enemies ${rangedBy("enemy")}, settlers ${rangedBy("settler")} · enemies left ${e} · settlers standing ${s} · core ${fight.base.hp}/${fight.base.hpMax} · ${mode === "r2" ? `R2 proposals (${PROPOSALS.length} overrides)` : "today's rules"}`;
  }
  function showResult(): void {
    const r = fight.result!;
    banner.textContent = r.winner === "draw" ? `Draw after ${r.seconds.toFixed(1)} s (${r.why})` : `${r.winner === "settlers" ? "Settlers" : "Enemies"} win in ${r.seconds.toFixed(1)} s: ${r.why}`;
    banner.style.display = "block";
    running = false;
    start.textContent = "Start";
  }
  function newFight(): void {
    fight = createFight({ ...pick, mode, edits: edits[mode] });
    running = false; acc = 0;
    tracers.length = 0; flashes.length = 0; pops.length = 0; muzzles.length = 0;
    for (const p of pool.values()) { for (const c of p.circles) dyn.remove(c); if (p.body) dyn.remove(p.body); }
    pool.clear();
    rigged.dispose();
    if (core) { core.position.set(fight.base.x, core.position.y, fight.base.y); }
    banner.style.display = "none";
    start.textContent = "Start";
  }

  start.onclick = () => {
    if (fight.result) newFight();
    running = !running;
    start.textContent = running ? "Pause" : "Start";
  };
  reset.onclick = () => newFight();
  todayBox.onchange = () => { mode = todayBox.checked ? "today" : "r2"; renderCards(); newFight(); };
  back.onclick = () => ui.close();

  newFight();
  renderCards();
  const ui: ArenaUi = {
    open() { root.classList.add("open"); fit(); if (!raf) raf = requestAnimationFrame(frame); },
    close() { root.classList.remove("open"); cancelAnimationFrame(raf); raf = 0; last = 0; running = false; start.textContent = "Start"; },
  };
  return ui;
}
