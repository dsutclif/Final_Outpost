#!/usr/bin/env node
// Dumps what the renderer treats as a pad occluder, per placed model, so packages/generator/data/occluders.json can be
// (re)made from the real thing: for every level, every placed building/node/gate with its hiding box and top (art units
// about the root), root scale and turn; plus the wall panel's own box. Output: { levels: { id: [ ... ] }, wall, reinforced }.
//   NODE_PATH=<game>/node_modules node tools/review/occluder-dump.cjs --base http://127.0.0.1:5261/ --levels s1-L025,... --out f.json
const { chromium } = require('playwright');
const fs = require('fs');
const a = {};
{ const v = process.argv.slice(2); for (let i = 0; i < v.length; i++) if (v[i].startsWith('--')) a[v[i].slice(2)] = v[i + 1] === undefined || v[i + 1].startsWith('--') ? true : v[++i]; }
if (!a.base || !a.levels) { console.error('usage: occluder-dump.cjs --base <url> --levels <id,...> [--out f.json]'); process.exit(2); }
const PAGE = () => {
  const v = window.__fo.debugView;
  const r = v.renderer.r && v.renderer.r.placed ? v.renderer.r : v.renderer;
  window.R.settle(8);
  const f = (x) => +x.toFixed(4);
  const bb = (b) => { const g = b.mesh.geometry; if (!g.boundingBox) g.computeBoundingBox(); const x = g.boundingBox; return [x.min.x, x.max.x, x.min.z, x.max.z, x.max.y].map(f); };
  const items = [];
  for (const [k, p] of r.placed) {
    const b = p.data.pbox || p.data.occ;
    if (!b || !p.model.root.visible) continue;
    const q = p.model.root;
    items.push({ key: k, type: p.data.id, at: [f(q.position.x), f(q.position.z)], y: f(q.position.y), rot: f(q.rotation.y), scale: [f(q.scale.x), f(q.scale.y), f(q.scale.z)], box: [b.x0, b.x1, b.z0, b.z1, b.top].map(f), meshy: !!q.userData.meshy });
  }
  return { items, wall: bb(r.walls.wall), reinforced: bb(r.walls.reinforced), fit: r.wallFit };
};
// Buildings that are not there at level start (pad.build targets) at their final built size: each is placed once in a scratch
// spot and its hiding box read off the same way the renderer does. [type, level] pairs; the generator reads the last level.
const PROBE = [['struct.housing', 1], ['conv.food_processor', 1], ['conv.material_processor', 1], ['conv.alloy_works', 1], ['struct.ranged_defense', 1], ['struct.ranged_defense', 2], ['struct.ranged_defense', 3],
  ['struct.barracks', 1], ['struct.barracks', 2], ['struct.depot', 1], ['struct.medical', 1], ['struct.landmark', 1], ['sink.core', 1], ['sink.core', 2], ['sink.core', 3]];
const PROBE_PAGE = (list) => {
  const v = window.__fo.debugView;
  const r = v.renderer.r && v.renderer.r.placed ? v.renderer.r : v.renderer;
  const f = (x) => +x.toFixed(4);
  const out = {};
  for (const [type, level] of list) {
    try {
      const p = r.place('probe:' + type + ':' + level, type, r.wv({ x: 0, y: 0 }), level);
      p.born = -Infinity;
      r.popScale(p, 28 * r.buildK(type, level));
      const b = p.data.pbox || p.data.occ, q = p.model.root;
      out[type + '@' + level] = b ? { scale: [f(q.scale.x), f(q.scale.y), f(q.scale.z)], y: f(q.position.y), box: [b.x0, b.x1, b.z0, b.z1, b.top].map(f) } : null;
    } catch (e) { out[type + '@' + level] = 'error ' + String(e.message).slice(0, 80); }
  }
  return out;
};
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_EXE || undefined, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto(a.base, { waitUntil: 'load' });
  const skip = page.locator('button[data-a=skip]');
  await Promise.race([skip.waitFor({ timeout: 60000 }).catch(() => undefined), page.waitForFunction(() => !!window.R, null, { timeout: 60000 })]);
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.waitForFunction(() => !!window.R, null, { timeout: 60000 });
  // Meshy models land a few seconds after a first level opens; measure only once they are in (the real game draws them)
  await page.evaluate((l) => window.R.play(l), String(a.levels).split(',')[0]);
  await page.waitForTimeout(8000);
  const out = { levels: {} };
  for (const id of String(a.levels).split(',')) {
    if (!(await page.evaluate((l) => window.R.play(l), id))) { console.error(id + ': no such level'); continue; }
    await page.waitForTimeout(600);
    const o = await page.evaluate(PAGE);
    out.wall = o.wall; out.reinforced = o.reinforced; out.fit = o.fit;
    out.levels[id] = o.items;
    console.error(id + ': ' + o.items.length);
  }
  out.probe = await page.evaluate(PROBE_PAGE, PROBE);
  await browser.close();
  const t = JSON.stringify(out);
  if (typeof a.out === 'string') fs.writeFileSync(a.out, t); else console.log(t);
})();
