import { mix } from "@fo/skins";
import { spriteKey, type DC } from "./dc.js";
import { circle, ellipse, fillRR, line, poly, rr, shadow, type G } from "./prim.js";

// One chunky character body for player, residents, customers and raiders. Roles differ in
// silhouette by headgear and held tool (ART-DIRECTION.md readability rule 2), not colour alone.

const OUT = "rgba(33,24,26,.55)";

export interface PersonOpts {
  body: string;
  /** Hat sprite key (hat.*), drawn on the helmet. */
  hat?: string;
  /** Tool sprite key (tool.*), held on the facing side. */
  tool?: string;
  face?: number;
  /** Walk phase; legs and bob follow it. */
  bob?: number;
  /** Visor tint; characters in this game wear helmets. */
  visor?: string;
  /** Helmet shell colour (defaults to a light tint of the body). */
  helmet?: string;
  lying?: boolean;
  /** 0..1 white hit flash. */
  flash?: number;
  scale?: number;
  backpack?: boolean;
}

export function drawPerson(dc: DC, x: number, y: number, o: PersonOpts): void {
  const g = dc.g;
  const s = o.scale ?? 1;
  if (s !== 1) { g.save(); g.translate(x, y); g.scale(s, s); x = 0; y = 0; }
  const face = o.face ?? 1;
  const bobPh = o.bob ?? 0;
  const b = Math.sin(bobPh) * 1.5;
  const fl = o.flash ?? 0;
  const body = fl > 0 ? mix(o.body, "#ffffff", fl) : o.body;
  const helmet = fl > 0 ? "#ffffff" : (o.helmet ?? mix(o.body, "#ffffff", 0.7));
  const visor = o.visor ?? "#2a4f6e";

  if (o.lying) {
    shadow(g, x, y + 7, 16);
    fillRR(g, x - 14, y - 4, 28, 12, 6, body, OUT, 1.5);
    circle(g, x - 16, y + 1, 7.5, helmet, OUT, 1.5);
    ellipse(g, x - 18, y + 1, 3, 4.5, visor);
    if (s !== 1) g.restore();
    return;
  }

  shadow(g, x, y + 13, 12);
  // legs: alternate with the walk phase
  const lg = Math.sin(bobPh) * 2.5;
  fillRR(g, x - 7, y + 6 + lg * 0.3, 6, 8 - lg * 0.4, 3, mix(body, "#000000", 0.25));
  fillRR(g, x + 1, y + 6 - lg * 0.3, 6, 8 + lg * 0.4, 3, mix(body, "#000000", 0.25));
  if (o.backpack) fillRR(g, x - 9 - face * 3, y - 5 + b, 8, 13, 3, mix(body, "#000000", 0.18), OUT, 1.2);
  // body
  fillRR(g, x - 9.5, y - 7 + b, 19, 17, 8, body, OUT, 1.5);
  ellipse(g, x - 3 * face, y - 3 + b, 3.5, 2.2, "rgba(255,255,255,.35)");
  // tool sits behind the hand on the facing side
  if (o.tool) drawTool(g, o.tool, x + face * 10, y + 2 + b, face, body);
  // helmet + visor
  circle(g, x, y - 13 + b, 8.5, helmet, OUT, 1.5);
  rr(g, x + face * 1.5 - 5.5, y - 16 + b, 11, 7, 3.5);
  g.fillStyle = visor;
  g.fill();
  ellipse(g, x + face * 3.2, y - 14.5 + b, 1.8, 1.2, "rgba(255,255,255,.75)");
  if (o.hat) drawHat(g, o.hat, x, y - 13 + b, face, body);
  if (s !== 1) g.restore();
}

/** Body colour and headgear for a role, from the skin. */
export function roleLook(dc: DC, roleIn: string): { body: string; hat: string; tool?: string } {
  const role = roleIn === "idle" ? "role.idle" : roleIn;
  const body = dc.pal.role[role] ?? dc.pal.role["role.idle"] ?? "#b8c3cc";
  const hat = spriteKey(dc, role);
  return { body, hat, ...(TOOLS[hat] ? { tool: TOOLS[hat] } : {}) };
}

const TOOLS: Record<string, string> = {
  "hat.hardhat": "tool.pick",
  "hat.antenna": "tool.rifle",
  "hat.crest": "tool.spear",
  "hat.goggles": "tool.wrench",
  "hat.cap": "tool.tray",
  "hat.cross": "tool.kit",
};

function drawHat(g: G, key: string, x: number, y: number, face: number, body: string): void {
  const dark = mix(body, "#000000", 0.3);
  switch (key) {
    case "hat.hardhat": // wide brim dome with a ridge
      fillRR(g, x - 11, y - 5, 22, 4, 2, body, OUT, 1.2);
      g.beginPath(); g.arc(x, y - 5, 8, Math.PI, 0); g.closePath(); g.fillStyle = body; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke();
      fillRR(g, x - 1.5, y - 13, 3, 8, 1.5, dark);
      break;
    case "hat.cap": // cap with a long bill to the facing side
      g.beginPath(); g.arc(x, y - 6, 7.5, Math.PI, 0); g.closePath(); g.fillStyle = body; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke();
      fillRR(g, face > 0 ? x : x - 14, y - 7, 14, 3.5, 1.7, dark);
      break;
    case "hat.visor": // tall eyeshade band, square silhouette
      fillRR(g, x - 9, y - 12, 18, 6, 2, body, OUT, 1.2);
      fillRR(g, x - 9, y - 7, 18, 2.5, 1, dark);
      break;
    case "hat.goggles": // big round goggles on the brow and a tuft
      circle(g, x - 4, y - 7, 3.6, "#ffd34d", OUT, 1.2);
      circle(g, x + 4, y - 7, 3.6, "#ffd34d", OUT, 1.2);
      poly(g, [x - 2, y - 9, x, y - 17, x + 2, y - 9], dark);
      break;
    case "hat.antenna": // long antenna with a ball: tallest silhouette
      line(g, x + face * 3, y - 7, x + face * 6, y - 22, dark, 2);
      circle(g, x + face * 6, y - 23, 3, "#ff5a3c", OUT, 1);
      break;
    case "hat.crest": // mohawk crest front to back
      poly(g, [x - 8, y - 5, x - 4, y - 15, x + 4, y - 16, x + 8, y - 5], "#ff5a3c", OUT, 1.2);
      break;
    case "hat.frame": // backpack frame poles above the head
      line(g, x - face * 6, y + 2, x - face * 6, y - 18, dark, 2.5);
      line(g, x - face * 11, y + 2, x - face * 11, y - 14, dark, 2.5);
      line(g, x - face * 12, y - 14, x - face * 5, y - 18, dark, 2.5);
      break;
    case "hat.cross": // white cap with a red cross
      fillRR(g, x - 8, y - 12, 16, 6, 3, "#ffffff", OUT, 1.2);
      g.fillStyle = "#ff3b3b"; g.fillRect(x - 1, y - 12, 2, 6); g.fillRect(x - 3.5, y - 10, 7, 2);
      break;
    case "hat.crown": // premium customers
      poly(g, [x - 7, y - 6, x - 7, y - 13, x - 3, y - 9, x, y - 15, x + 3, y - 9, x + 7, y - 13, x + 7, y - 6], "#ffcb3d", OUT, 1.2);
      break;
    case "hat.hood": // raiders: a ragged hood
      poly(g, [x - 10, y + 2, x - 9, y - 7, x, y - 12, x + 9, y - 7, x + 10, y + 2, x + 5, y - 3, x - 5, y - 3], body, OUT, 1.2);
      break;
    default:
      break;
  }
}

function drawTool(g: G, key: string, x: number, y: number, face: number, body: string): void {
  const wood = "#6b4a2f";
  switch (key) {
    case "tool.pick":
      line(g, x, y + 6, x + face * 4, y - 12, wood, 2.5);
      g.beginPath(); g.moveTo(x - face * 3, y - 10); g.quadraticCurveTo(x + face * 4, y - 17, x + face * 11, y - 9);
      g.strokeStyle = "#c9d3da"; g.lineWidth = 3; g.stroke();
      break;
    case "tool.rifle":
      line(g, x - face * 2, y + 4, x + face * 12, y - 8, "#3b3f46", 3.5);
      break;
    case "tool.spear":
      line(g, x, y + 8, x + face * 3, y - 24, wood, 2.5);
      poly(g, [x + face * 3, y - 30, x + face * 0.5, y - 22, x + face * 5.5, y - 22], "#e3eaf2", OUT, 1);
      break;
    case "tool.wrench":
      line(g, x, y + 4, x + face * 6, y - 8, "#c9d3da", 3);
      circle(g, x + face * 6.5, y - 9, 3, "#c9d3da");
      break;
    case "tool.tray":
      ellipse(g, x + face * 2, y - 6, 8, 2.5, "#e3eaf2");
      break;
    case "tool.kit":
      fillRR(g, x - 4, y - 2, 9, 7, 2, "#ffffff", OUT, 1);
      g.fillStyle = "#ff3b3b"; g.fillRect(x - 0.5, y - 1, 1.5, 5); g.fillRect(x - 2.5, y + 1, 5.5, 1.5);
      break;
    case "tool.club":
      line(g, x, y + 6, x + face * 6, y - 16, mix(body, "#000000", 0.5), 3.5);
      break;
    default:
      break;
  }
}
