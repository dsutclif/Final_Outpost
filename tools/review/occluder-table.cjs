#!/usr/bin/env node
// Folds an occluder-dump.cjs result into packages/generator/data/occluders.json (what viewVisibility.ts reads):
// per entity type the hiding box, root scale and height as the renderer draws it once its models are loaded; scrap heaps
// by their model variant (1 + node index % 3); the wall panel (with the Meshy panel fit) and the gate.
//   node tools/review/occluder-table.cjs <dump.json> [packages/generator/data/occluders.json]
const fs = require('fs');
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const out = process.argv[3] || 'packages/generator/data/occluders.json';
const votes = new Map();
const gates = [];
for (const items of Object.values(d.levels)) for (const it of items) {
  if (it.key.startsWith('gate:')) { gates.push(it); continue; }
  let t = it.type;
  if (t === 'node.salvage_pile') t += '@' + (1 + (Number(it.key.split(':')[1]) % 3));
  const k = JSON.stringify({ scale: it.scale, y: it.y, box: it.box });
  const m = votes.get(t) || votes.set(t, new Map()).get(t);
  m.set(k, (m.get(k) || 0) + 1);
}
const types = {};
for (const [t, m] of [...votes].sort()) {
  const best = [...m].sort((a, b) => b[1] - a[1]);
  types[t] = JSON.parse(best[0][0]);
  if (best.length > 1) console.error(`${t}: ${best.length} variants, kept the most common (${best[0][1]} of ${[...m.values()].reduce((x, y) => x + y)})`);
}
const future = {};
for (const [k, v] of Object.entries((process.env.PROBE ? JSON.parse(fs.readFileSync(process.env.PROBE, 'utf8')) : d).probe || {})) if (v && typeof v === 'object') future[k] = v; else console.error('probe ' + k + ': ' + v);
const gbox = gates.length ? gates[0].box : null;
const ART_M = 28;
const table = {
  _doc: 'Pad occluders as the renderer draws them (render-3d renderer.ts hideBox/occluder), art-unit box [x0,x1,z0,z1,top] about the root, root scale and height y. Made by tools/review/occluder-dump.cjs + occluder-table.cjs; remake after a model or scale change.',
  types,
  future,
  wall: { box: d.wall, fit: d.fit && d.fit.wall ? d.fit.wall : null },
  gate: { box: gbox, width: gbox ? +((gbox[1] - gbox[0]) * ART_M).toFixed(2) : 0 },
};
fs.writeFileSync(out, JSON.stringify(table, null, 1));
console.error('wrote ' + out + ': ' + Object.keys(types).length + ' types');
