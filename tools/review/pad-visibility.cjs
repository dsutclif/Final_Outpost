#!/usr/bin/env node
// Pad visibility on screen, measured with the game's OWN occlusion test (renderer.padsBehind, the one that raises a
// pad's pin on a pole of light), not the generator's axis-aligned view rule.
//
//   NODE_PATH=<game>/node_modules node tools/review/pad-visibility.cjs --base http://127.0.0.1:5271/
//        --levels s1-L025,s1-L014 [--out out.json] [--tries 3] [--ff 0] [--points "185,630;175,710"]
//
// Boots the dev build headless at phone size (375x812), opens each level (several per browser session), settles the
// camera, then wraps GameRenderer.padsBehind. That method is called by the renderer for every wall piece and building
// it draws, with the real camera vectors (ux, uz, slope) and the real boxes; the wrapper runs the same sight-line test
// (segHitsBox: the ground line from the point toward the camera against the box, reach = top / slope) on EVERY pad of
// the level (also pads the sim has not made visible yet) and on a spread of points over the pad's disc, and records
// which occluder hid it. The sample points are the pad centre, 8 points at half radius and 8 at full radius (17).
//   hiddenFraction = share of the 17 points hidden by any occluder;  centreHidden = what the game's own pin test sees.
//   class: hidden (>= 0.75 of points), partly (> 0), visible (0).
// Occluders are what is drawn at the time of the run (buildings that exist, all wall pieces). A building a pad.build
// pad would place later is not there yet (use --ff to let the sim run, or see the generator comparison).
// Output JSON: { levels: { <id>: { ok, viewport, pads: [ { id, type, what, at, screen, radius, hiddenFraction, centreHidden,
//   class, by: [ { name, fraction, screenBox } ] } ] } } }
// Exit codes: 0 ran; 2 could not boot.
const { chromium } = require('playwright');
const fs = require('fs');

const a = {};
{ const v = process.argv.slice(2); for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) a[v[i].slice(2)] = v[i + 1] === undefined || v[i + 1].startsWith('--') ? true : v[++i]; }
if (!a.base || !a.levels) { console.error('usage: pad-visibility.cjs --base <url> --levels <id,...> [--out f.json] [--tries 3] [--ff s] [--points x,y;x,y]'); process.exit(2); }
const levels = String(a.levels).split(',').filter(Boolean);
const extraPts = typeof a.points === "string" ? a.points.split(";").map((t) => t.split(",").map(Number)) : [];
const TRIES = Number(a.tries ?? 3);

// Runs in the page. Installs the wrapper, lets a few frames draw, returns the per-pad result.
const PAGE = ([ff, extra]) => {
  const app = window.__fo, v = app.debugView, sim = app.debugSim;
  if (!v || !sim) return { error: 'no level open' };
  const r = v.renderer.r && v.renderer.r.placed ? v.renderer.r : v.renderer;
  const state = sim.state ?? sim.s ?? null;
  const pads = (state && state.pads) || (sim.getState && sim.getState().pads) || null;
  if (!pads) return { error: 'cannot find sim pads' };
  const segHitsBox = (px, pz, dx, dz, x0, x1, z0, z1) => {
    if (x0 > x1 || z0 > z1) return false;
    let t0 = 0, t1 = 1;
    for (const [p, d, lo, hi] of [[px, dx, x0, x1], [pz, dz, z0, z1]]) {
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
      let s = (lo - p) / d, e = (hi - p) / d;
      if (s > e) [s, e] = [e, s];
      t0 = Math.max(t0, s); t1 = Math.min(t1, e);
      if (t0 > t1) return false;
    }
    return true;
  };
  // pad disc radius (world units): a quarter of the decal plane width (the dashed ring is about half the plane)
  const decalR = (id) => { const p = r.placed.get('pad:' + id); const d = p && p.extra && p.extra[0]; return d && d.scale ? d.scale.x / 4 : null; };
  const rs = pads.map((p) => decalR(p.id)).filter((x) => x);
  const fallbackR = rs.length ? rs.sort((x, y) => x - y)[rs.length >> 1] : 1;
  const pts = [];
  const info = pads.concat(extra.map((e, i) => ({ id: "@" + e[0] + "," + e[1], type: "point", pos: { x: e[0] * 1000, y: e[1] * 1000 }, visible: true, done: false }))).map((p) => {
    const w = r.wv(p.pos), R = decalR(p.id) ?? fallbackR, ids = [];
    const add = (x, z) => { const k = pts.length; pts.push({ k, x, z, hit: new Set() }); ids.push(k); };
    add(w.x, w.z);
    for (const f of [0.5, 1]) for (let i = 0; i < 8; i++) add(w.x + Math.cos((i * Math.PI) / 4) * R * f, w.z + Math.sin((i * Math.PI) / 4) * R * f);
    return { p, w, R, ids };
  });
  const occs = new Map();
  const orig = r.padsBehind;
  r.padsBehind = function (bx, bz, ang, sx, sz, x0, x1, z0, z1, top, ux, uz, slope) {
    orig.apply(this, arguments);
    const co = Math.cos(ang), si = Math.sin(ang), reach = top / slope;
    const key = bx.toFixed(2) + ',' + bz.toFixed(2) + ',' + ang.toFixed(3) + ',' + sx.toFixed(2) + ',' + sz.toFixed(2) + ',' + x0.toFixed(2) + ',' + z1.toFixed(2);
    let hit = false;
    for (const q of pts) {
      const wx = q.x - bx, wz = q.z - bz;
      if (segHitsBox((wx * co - wz * si) / sx, (wx * si + wz * co) / sz, ((ux * co - uz * si) * reach) / sx, ((ux * si + uz * co) * reach) / sz, x0, x1, z0, z1)) { q.hit.add(key); hit = true; }
    }
    if (hit && !occs.has(key)) occs.set(key, { bx, bz, ang, sx, sz, x0, x1, z0, z1, top });
  };
  if (ff > 0) window.R.ff(ff, 0);
  window.R.settle(8);
  r.padsBehind = orig;
  const gameHid = new Set([...r.padHidden.keys()]), gamePts = new Set(r.padPts.map((q) => q.id));
  // name an occluder: a placed building whose root sits on it, else a wall piece
  const nameOf = (o) => {
    for (const p of r.placed.values()) { const q = p.model.root.position; if (Math.abs(q.x - o.bx) < 0.02 && Math.abs(q.z - o.bz) < 0.02) return String(p.data.id ?? p.key); }
    return 'wall';
  };
  const scr = (x, y, z) => r.toScreen(new (r.camera.position.constructor)(x, y, z));
  const box = (o) => {
    const co = Math.cos(o.ang), si = Math.sin(o.ang), xs = [], ys = [];
    for (const lx of [o.x0 * o.sx, o.x1 * o.sx]) for (const lz of [o.z0 * o.sz, o.z1 * o.sz]) for (const h of [0, o.top]) {
      const s = scr(o.bx + lx * co + lz * si, h, o.bz - lx * si + lz * co);
      xs.push(s.x); ys.push(s.y);
    }
    return [Math.round(Math.min(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...xs)), Math.round(Math.max(...ys))];
  };
  const names = new Map();
  for (const [k, o] of occs) names.set(k, { name: nameOf(o), box: box(o), top: +o.top.toFixed(1), world: [+(o.bx + o.x0 * o.sx).toFixed(1), +(o.bz + o.z0 * o.sz).toFixed(1), +(o.bx + o.x1 * o.sx).toFixed(1), +(o.bz + o.z1 * o.sz).toFixed(1)], ang: +o.ang.toFixed(3) });
  const vp = { w: r.cssW, h: r.cssH };
  const out = info.map(({ p, w, R, ids }) => {
    const hid = ids.filter((k) => pts[k].hit.size).length;
    const per = new Map();
    for (const k of ids) for (const key of pts[k].hit) per.set(key, (per.get(key) || 0) + 1);
    const by = [...per].map(([key, n]) => ({ name: names.get(key).name, fraction: +(n / ids.length).toFixed(2), screenBox: names.get(key).box, top: names.get(key).top, world: names.get(key).world, ang: names.get(key).ang })).sort((x, y) => y.fraction - x.fraction);
    const frac = hid / ids.length;
    const s = r.worldToScreen({ x: w.x, y: w.z });
    const inf = r.pads.get(p.id);
    return { id: p.id, type: p.type, what: inf ? inf.what : null, visibleNow: !!p.visible, done: !!p.done, at: [Math.round(w.x), Math.round(w.z)], screen: [Math.round(s.x), Math.round(s.y)],
      radius: +R.toFixed(2), hiddenFraction: +frac.toFixed(2), centreHidden: pts[ids[0]].hit.size > 0, gameFlag: gamePts.has(p.id) ? gameHid.has(p.id) : null,
      class: frac >= 0.75 ? 'hidden' : frac > 0 ? 'partly' : 'visible', by };
  });
  return { viewport: vp, nOccluders: occs.size, pads: out };
};

(async () => {
  let browser;
  const result = { when: new Date().toISOString(), base: a.base, levels: {} };
  const boot = async () => {
    browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const page = await ctx.newPage();
    await page.goto(a.base, { waitUntil: 'load' });
    const skip = page.locator('button[data-a=skip]');
    await Promise.race([skip.waitFor({ timeout: 60000 }).catch(() => undefined), page.waitForFunction(() => !!window.R, null, { timeout: 60000 })]);
    if (await skip.isVisible().catch(() => false)) await skip.click();
    await page.waitForFunction(() => !!window.R, null, { timeout: 60000 });
    return page;
  };
  let page;
  try { page = await boot(); } catch (e) { console.error('pad-visibility: could not boot: ' + String(e.message).split('\n')[0]); try { await browser?.close(); } catch { /* gone */ } process.exit(2); }
  // Meshy models land a few seconds after a first level opens; measure only once they are in (the real game draws them)
  await page.evaluate((l) => window.R.play(l), levels[0]);
  await page.waitForTimeout(8000);
  for (const id of levels) {
    let res = null, err = null;
    for (let t = 1; t <= TRIES && !res; t++) {
      try {
        if (!(await page.evaluate((l) => window.R.play(l), id))) { err = 'no such level'; break; }
        await page.waitForTimeout(600);
        const o = await page.evaluate(PAGE, [Number(a.ff ?? 0), extraPts]);
        if (o.error) { err = o.error; continue; }
        res = o;
      } catch (e) {
        err = String(e.message).split('\n')[0];
        try { await browser.close(); } catch { /* gone */ }
        try { page = await boot(); } catch (e2) { err = 'reboot failed: ' + String(e2.message).split('\n')[0]; break; }
      }
    }
    result.levels[id] = res ? { ok: true, ...res } : { ok: false, error: err };
    const bad = res ? res.pads.filter((p) => p.class !== 'visible').length : -1;
    console.error(`${id}: ${res ? res.pads.length + ' pads, ' + bad + ' hidden/partly' : 'FAILED ' + err}`);
  }
  try { await browser.close(); } catch { /* gone */ }
  const text = JSON.stringify(result, null, 1);
  if (typeof a.out === 'string') fs.writeFileSync(a.out, text); else console.log(text);
})();
