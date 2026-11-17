// outpost-ops#202: pad-replay viewer for the wavefront placement loop (placement only, not the full level build).
//   npx vite-node tools/wavefront-replay.ts -- --level s1-L020 --seed 1 [2 3 | 1-5] --out <file.html>
// One self-contained HTML file: step slider, prev/next, the map, buildings (locked wavefronts vs the current one), pads (green visible,
// red hidden), the trace step's text, moves as arrows, then walls, gate rockfall (with its rest band), medic and scrap.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { placeWavefront } from "../packages/generator/src/wavefront.js";
import { argOf, levelNumber, loadLevel, seedsFrom } from "./wavefront-load.js";

const argv = process.argv.slice(2), level = argOf(argv, "--level", "s1-L020"), out = argOf(argv, "--out", `wavefront-${level}.html`);
const seeds = seedsFrom(argv).length ? seedsFrom(argv) : [1];
const { input } = loadLevel(level);
const runs = seeds.map((seed) => {
  const r = placeWavefront(input, { seed, siteChecks: true, repair: "always", trace: true });
  // a pad's offset from its building in the final layout (the viewer keeps it while the building moves)
  const padOff: Record<string, [number, number]> = {};
  for (const b of input.buildings) for (const p of b.pads) { const a = r.padAt[p.id], q = r.positions[b.id]; if (a && q) padOff[p.id] = [a[0] - q[0], a[1] - q[1]]; }
  return { seed, trace: r.trace, rejected: r.rejected, hidden: r.hidden, walls: r.walls, rock: r.rock, scrap: r.scrap, padOff, stats: r.stats };
});
const data = {
  title: `Level ${levelNumber(level)}`, map: input.map,
  buildings: input.buildings.map((b) => ({ id: b.id, kind: b.kind, fp: b.footprint, pads: b.pads.map((p) => p.id) })),
  medic: input.medic?.id ?? null, runs,
};
const json = JSON.stringify(data).replace(/</g, "\\u003c");

const PAGE = String.raw`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Wavefront replay</title>
<style>body{background:#111;color:#ddd;font:14px system-ui;margin:12px}svg{background:#1b1d21;max-width:100%;height:auto;border:1px solid #444}
button,select{font:inherit;padding:4px 10px}#step{width:min(640px,90%)}#txt{margin:8px 0;min-height:3em;font-family:ui-monospace,monospace}
.key span{display:inline-block;margin-right:12px}.sw{display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:4px}</style>
<h2 id="h"></h2>
<div><label>Seed <select id="seed"></select></label> <button id="prev">&lt; prev</button> <button id="next">next &gt;</button>
<input id="step" type="range" min="0" value="0"> <span id="n"></span></div>
<div id="txt"></div>
<p class="key"><span><i class="sw" style="background:#4a6fa5"></i>locked wavefront</span><span><i class="sw" style="background:#e08a2e"></i>current wavefront</span><span><i class="sw" style="background:#2fa36b"></i>pad visible</span><span><i class="sw" style="background:#e5484d"></i>pad hidden</span><span><i class="sw" style="background:#d9a400"></i>walls</span><span><i class="sw" style="background:#6b3f3f"></i>rockfall / rest band</span><span><i class="sw" style="background:#b0773a"></i>scrap</span><span><i class="sw" style="background:#c8a2e8"></i>medic</span></p>
<svg id="svg"></svg>
<script>
const D=__DATA__;
const B=Object.fromEntries(D.buildings.map(b=>[b.id,b]));
const $=id=>document.getElementById(id);
function text(s){switch(s.t){
case"wave":return "Wavefront "+s.n+": "+s.ids.join(", ")+" (front "+s.front+")";
case"place":return "Place "+s.id+" at ("+s.at.map(Math.round)+"), pad spot "+s.spot+(s.fallback?" - no site passed the checks, fallback site":"")+" ("+s.tried+" sites tried)";
case"hidden":return "Pad "+s.pad+" is hidden by "+s.by.join(", ");
case"blocker":return "Blocker candidate "+s.id+" for "+s.pad+": needs "+(s.need===null?"no push":s.need);
case"move":return "Move "+s.id+" "+s.d+" "+s.dir+" to ("+s.to.map(Math.round)+")";
case"overlap":return s.id+" "+s.d+" "+s.dir+" overlaps something, next direction";
case"spot":return "Pad "+s.pad+": spot "+s.i+(s.ok?" is visible":" no good");
case"fixed":return "Pad "+s.pad+" fixed on spot "+s.spot+(s.pushed?" after pushing "+s.pushed+" "+s.d+" "+s.dir:" without a push");
case"unresolved":return "UNRESOLVED pad "+s.pad+": "+s.why;
case"reject":return "SEED REJECTED: "+s.kind+" "+s.id+" ("+s.dir+(s.d?" at "+s.d:"")+") pad "+s.pad;
case"lock":return "Wavefront "+s.n+" locked";
case"walls":return "Walls ring ["+s.rect.join(",")+"], gates "+s.gates.join(",");
case"medic":return "Medic pad at ("+s.at.join(",")+")";
case"rock":return "Gate rockfall "+s.id+" ("+s.side+")";
case"scrap":return "Scrap "+s.id+" at ("+s.at.join(",")+") on the "+s.side+" side";
case"shift":return "Ring re-anchored: whole settlement moved by ("+s.d+")";
default:return JSON.stringify(s);}}
function state(run,k){
  const pos={},base={},wave={},padHid=new Set(),arrows=[],rock={},scrap={};
  let locked=-1,seg=null,wallsOn=null,medic=null;
  for(let i=0;i<=k;i++){const s=run.trace[i];
    if(s.t==="wave"){s.ids.forEach(id=>wave[id]=s.n);seg=null;}
    else if(s.t==="place"){pos[s.id]=s.at;base[s.id]=s.at;seg=null;}
    else if(s.t==="hidden"){if(seg){pos[seg]=base[seg];seg=null;}padHid.add(s.pad);}
    else if(s.t==="move"){seg=s.id;pos[s.id]=s.to;if(i===k)arrows.push([base[s.id],s.to]);}
    else if(s.t==="overlap"){seg=s.id;}
    else if(s.t==="fixed"){padHid.delete(s.pad);if(s.pushed)base[s.pushed]=pos[s.pushed];seg=null;}
    else if(s.t==="unresolved"){if(seg)pos[seg]=base[seg];seg=null;}
    else if(s.t==="lock"){locked=s.n;seg=null;}
    else if(s.t==="shift"){for(const id in pos){pos[id]=[pos[id][0]+s.d[0],pos[id][1]+s.d[1]];base[id]=pos[id];}}
    else if(s.t==="walls")wallsOn=run.walls;
    else if(s.t==="medic")medic=s.at;
    else if(s.t==="rock")rock[s.id]=s;
    else if(s.t==="scrap")scrap[s.id]=s;
  }
  return{pos,wave,padHid,arrows,locked,wallsOn,medic,rock,scrap};
}
function draw(){
  const run=D.runs[+$("seed").value],k=+$("step").value,s=run.trace[k],st=state(run,k),last=k===run.trace.length-1;
  $("txt").textContent=(run.trace.length?"["+k+"/"+(run.trace.length-1)+"] "+text(s):"no trace")+(last?"   -- end: "+(run.rejected?"seed rejected":run.hidden.length?run.hidden.length+" pad(s) hidden":"every pad visible"):"");
  $("n").textContent="step "+k+" of "+(run.trace.length-1);
  const W=D.map.w,H=D.map.h,f=n=>Math.round(n*10)/10,fin=new Set(run.hidden);let g="";
  g+='<rect x="0" y="0" width="'+W+'" height="'+H+'" fill="#1b1d21" stroke="#777" stroke-dasharray="10 6" stroke-width="3"/>';
  for(const id in st.pos){const b=B[id],p=st.pos[id],fp=b.fp,lk=st.wave[id]<=st.locked;
    const col=b.kind==="zone.blocked"?"#555":lk?"#4a6fa5":"#e08a2e";
    const hl=s&&s.id===id?' stroke="#fff" stroke-width="3"':' stroke="#aaa" stroke-width="1.5"';
    g+='<rect x="'+f(p[0]+fp[0])+'" y="'+f(p[1]+fp[1])+'" width="'+(fp[2]-fp[0])+'" height="'+(fp[3]-fp[1])+'" fill="'+col+'" fill-opacity="0.85"'+hl+'/><text x="'+f(p[0])+'" y="'+f(p[1])+'" font-size="12" fill="#fff" text-anchor="middle">'+id.slice(0,14)+'</text>';}
  for(const id in st.pos)for(const pid of B[id].pads){const o=run.padOff[pid];if(!o)continue;const p=st.pos[id],red=last?fin.has(pid):st.padHid.has(pid);
    g+='<rect x="'+f(p[0]+o[0]-10)+'" y="'+f(p[1]+o[1]-10)+'" width="20" height="20" fill="'+(red?"#e5484d":"#2fa36b")+'"'+(s&&s.pad===pid?' stroke="#fff" stroke-width="3"':'')+'><title>'+pid+'</title></rect>';}
  for(const [a,b] of st.arrows)g+='<line x1="'+f(a[0])+'" y1="'+f(a[1])+'" x2="'+f(b[0])+'" y2="'+f(b[1])+'" stroke="#fff" stroke-width="4" marker-end="url(#ah)"/>';
  if(st.wallsOn)g+='<polygon points="'+st.wallsOn.points.map(q=>q.join(",")).join(" ")+'" fill="none" stroke="#d9a400" stroke-width="5"/>';
  for(const id in st.rock){const r=run.rock[id];if(!r)continue;
    for(const q of r.rest||[])g+='<rect x="'+q[0]+'" y="'+q[1]+'" width="'+(q[2]-q[0])+'" height="'+(q[3]-q[1])+'" fill="#4a3434" stroke="#c66" stroke-width="2" stroke-dasharray="8 6"/>';
    g+='<rect x="'+r.rect[0]+'" y="'+r.rect[1]+'" width="'+(r.rect[2]-r.rect[0])+'" height="'+(r.rect[3]-r.rect[1])+'" fill="#6b3f3f" stroke="#c66" stroke-width="2"/>';
    for(const q of r.pads)g+='<rect x="'+(q[0]-12)+'" y="'+(q[1]-12)+'" width="24" height="24" fill="#2fa36b"/>';}
  for(const id in st.scrap){const c=run.scrap[id];if(c)g+='<circle cx="'+c.at[0]+'" cy="'+c.at[1]+'" r="14" fill="#b0773a"><title>'+id+'</title></circle>';}
  if(st.medic)g+='<rect x="'+(st.medic[0]-12)+'" y="'+(st.medic[1]-12)+'" width="24" height="24" fill="'+(last&&fin.has(D.medic)?"#e5484d":"#c8a2e8")+'"/>';
  $("svg").setAttribute("viewBox","-40 -40 "+(W+80)+" "+(H+80));
  $("svg").innerHTML='<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#fff"/></marker></defs>'+g;
}
function pick(){const run=D.runs[+$("seed").value];$("step").max=Math.max(0,run.trace.length-1);$("step").value=0;
  $("h").textContent=D.title+", seed "+run.seed+" - "+(run.rejected?"REJECTED ("+run.rejected.kind+" "+run.rejected.id+")":run.hidden.length?run.hidden.length+" hidden":"all pads visible")+" - "+run.stats.pushes+" pushes, "+run.stats.repairs+" repairs";draw();}
D.runs.forEach((r,i)=>{const o=document.createElement("option");o.value=i;o.textContent=r.seed;$("seed").appendChild(o);});
$("seed").onchange=pick;$("step").oninput=draw;
$("prev").onclick=()=>{$("step").value=Math.max(0,+$("step").value-1);draw();};
$("next").onclick=()=>{$("step").value=Math.min(+$("step").max,+$("step").value+1);draw();};
document.onkeydown=e=>{if(e.key==="ArrowRight")$("next").click();if(e.key==="ArrowLeft")$("prev").click();};
pick();
</script>`;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, PAGE.replace("__DATA__", () => json));
console.log(`wrote ${out} (${seeds.length} seed(s), ${runs.map((r) => r.trace.length + " steps").join(", ")})`);
