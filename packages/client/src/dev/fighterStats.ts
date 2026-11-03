import { content, type Manifest } from "@fo/content";

// Fighter stats for the sandbox viewer (R6 bundle 4, N5b). Only values that exist today: read from the
// compiled content (packages/content/data/*.json) at runtime, with the level's manifest params laid over
// the defaults when a level is picked. Constants written into sim code are listed in CODE_CONSTANTS with
// their file:line and shown marked "code"; nothing here is invented. Units: seconds and world units.

export interface StatRow {
  label: string;
  value: string;
  /** Where it comes from: a data file key, "level param", "level manifest", or "code: file:line". */
  src: string;
  /** Written into sim code rather than data. */
  code?: boolean;
}
export interface StatSection { id: string; title: string; note?: string; rows: StatRow[] }

/** Combat constants written into the sim (not in data), for the next tuning round. Line numbers are in packages/sim/src. */
export const CODE_CONSTANTS: { where: string; value: string; what: string }[] = [
  { where: "systems/defense.ts:96,111,125", value: "defense.barrierHitInterval", what: "a hostile hitting a troop, a guard or a gate reuses the barrier hit interval (no interval of its own)" },
  { where: "systems/defense.ts:91,107", value: "defense.troopContact", what: "contact reach to a troop or guard (data), shared by troops and guards" },
  { where: "systems/defense.ts:44", value: "2 x defense.barrierStop", what: "stand-off past a wall opening a hostile aims for" },
  { where: "systems/defense.ts:117", value: "speed + barrierStop", what: "look-ahead for a wall or gate in the way" },
  { where: "systems/defense.ts:220", value: "2 x / 1.5 x defense.postOffset", what: "ring radii (x, y) where idle troops stand round their post" },
  { where: "systems/defense.ts:198", value: "post y + defense.postOffset", what: "where a new troop appears" },
  { where: "systems/hunting.ts:122", value: "attackInterval / 2", what: "wind-up before a charging animal's first bite" },
  { where: "systems/hunting.ts:93", value: "15 units", what: "side spread between items flung off the pack by a bite" },
  { where: "systems/hunting.ts:97", value: "4 tries, reach halved each", what: "knock-back retries when the landing spot is blocked" },
  { where: "systems/guards.ts:39", value: "min 1 hp", what: "no strike takes a guard below 1 hp (R5 rule): going down comes first" },
  { where: "systems/barriers.ts:161-163", value: "1/2, 1/4, 3/4 of a section", what: "guard post spots along the wall" },
  { where: "sim.ts:212", value: "ring 60 x 50 units", what: "where starting hired guards stand round the core" },
  { where: "systems/player.ts:206,209", value: "player.attackDamage", what: "the ranged shot uses the melee damage value (no ranged damage of its own)" },
];

const sec = (s: number): string => `${+s.toFixed(3)} s`;
const u = (n: number): string => `${+n.toFixed(2)} u`;
const spd = (n: number): string => `${+n.toFixed(2)} u/s`;
const costOf = (c: Record<string, number> | undefined): string =>
  c && Object.keys(c).length ? Object.entries(c).map(([r, n]) => `${n} ${r}`).join(", ") : "none";
const code = (where: string, value: string, label: string): StatRow => ({ label, value, src: `code: ${where}`, code: true });

export function fighterSections(level?: Manifest | null): StatSection[] {
  const D = content.defaults;
  const over = level?.params ?? {};
  const key = (k: string): { v: number; src: string } =>
    k in over ? { v: over[k]!, src: `level param ${k}` } : { v: D[k] ?? NaN, src: `defaults.json ${k}` };
  const p = (label: string, k: string, fmt: (n: number) => string): StatRow => {
    const { v, src } = key(k);
    return { label, value: Number.isFinite(v) ? fmt(v) : "n/a", src };
  };
  const num = (n: number): string => String(n);
  const out: StatSection[] = [];

  out.push({
    id: "player", title: "Commander (player)",
    rows: [
      p("HP", "player.hp", num), p("Speed", "player.speed", spd), p("Body radius", "player.radius", u),
      p("Melee damage", "player.attackDamage", num), p("Melee reach", "player.attackRange", u), p("Melee interval", "player.attackInterval", sec),
      p("Gun reach", "player.rangedRange", u), p("Gun interval", "player.rangedInterval", sec),
      code("systems/player.ts:206,209", "= melee damage", "Gun damage"),
      p("Heal starts after", "player.healDelay", sec), p("Heal 1 hp every", "player.healInterval", sec), p("Down for", "player.downSeconds", sec),
      p("Contact hit reach (enemy on you)", "defense.playerHitRange", u), p("Contact hit interval", "defense.playerHitInterval", sec),
    ],
  });

  const def = content.roles["role.defender"], medic = content.roles["role.medic"], hunter = content.roles["role.hunter"];
  const guardRows: StatRow[] = [];
  if (def) {
    const s = "roles.json role.defender";
    guardRows.push(
      { label: "HP", value: String(def.hp ?? "n/a"), src: `${s} hp` },
      { label: "Speed", value: spd(def.speed), src: `${s} speed` },
      { label: "Damage", value: String(def.damage ?? "n/a"), src: `${s} damage` },
      { label: "Attack reach", value: def.attackRange === undefined ? "n/a" : u(def.attackRange), src: `${s} attackRange` },
      { label: "Attack interval", value: def.attackInterval === undefined ? "n/a" : sec(def.attackInterval), src: `${s} attackInterval` },
      { label: "Hire cost", value: costOf(def.cost), src: `${s} cost` },
      p("Hire cost growth per defence bought", "pads.defenceGrowth", (n) => `x${n}`),
      p("Goes down at (share of HP left)", "guards.downPct", (n) => `${n}%`),
      p("Hit reach (enemy on a guard)", "defense.troopContact", u),
      { label: "Behaviour", value: `${def.behavior}${def.rally ? ", rally" : ""}${def.sortie ? ", sortie" : ""}`, src: `${s} behavior` },
      code("systems/guards.ts:39", "min 1 hp per strike", "Strike floor"),
    );
  }
  out.push({ id: "guard", title: "Hired guards (role.defender)", note: "Leash: the farthest turret spot past the wall; set per level when it loads.", rows: guardRows });

  const bar = content.structures["struct.barracks"], T = bar?.troops;
  out.push({
    id: "drone", title: "Drones (troops from the guard post, struct.barracks)",
    rows: bar && T ? [
      { label: "Post cost", value: costOf(bar.cost), src: "structures.json struct.barracks cost" },
      { label: "Spawn from post level", value: String(T.fromLevel), src: "structures.json struct.barracks troops.fromLevel" },
      { label: "Spawn every", value: sec(T.every), src: "structures.json struct.barracks troops.every" },
      { label: "Max alive per post", value: String(T.max), src: "structures.json struct.barracks troops.max" },
      { label: "HP", value: String(T.hp), src: "structures.json struct.barracks troops.hp" },
      { label: "Damage", value: String(T.damage), src: "structures.json struct.barracks troops.damage" },
      { label: "Attack interval", value: sec(T.attackInterval), src: "structures.json struct.barracks troops.attackInterval" },
      { label: "Attack reach", value: u(T.attackRange), src: "structures.json struct.barracks troops.attackRange" },
      { label: "Speed", value: spd(T.speed), src: "structures.json struct.barracks troops.speed" },
      p("Hit reach (enemy on a drone)", "defense.troopContact", u),
      p("Appears this far from post", "defense.postOffset", u),
      { label: "Post upgrade t2 cost", value: costOf(content.upgrades["struct.barracks.t2"]?.cost), src: "upgrades.json struct.barracks.t2 cost" },
      code("systems/defense.ts:96,111", "= defense.barrierHitInterval", "Enemy hit interval on a drone"),
    ] : [],
  });

  const rd = content.structures["struct.ranged_defense"];
  const tiers = rd?.tiers ?? [];
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i]!, up = content.upgrades[`struct.ranged_defense.t${i + 1}`];
    const s = `structures.json struct.ranged_defense tiers[${i}]`;
    out.push({
      id: `tower${i + 1}`, title: `Tower t${i + 1} (struct.ranged_defense)`,
      rows: [
        { label: "Range", value: u(t.range), src: `${s}.range` },
        { label: "Fire interval", value: sec(t.rate), src: `${s}.rate` },
        { label: "Damage", value: String(rd!.damage), src: "structures.json struct.ranged_defense damage" },
        { label: i === 0 ? "Build cost" : "Upgrade cost", value: costOf(i === 0 ? rd!.cost : up?.cost), src: i === 0 ? "structures.json struct.ranged_defense cost" : `upgrades.json struct.ranged_defense.t${i + 1} cost` },
        p("Cost growth per defence bought", "pads.defenceGrowth", (n) => `x${n}`),
      ],
    });
  }

  const med = content.structures["struct.medical"];
  out.push({
    id: "medic", title: "Medic (role.medic) and med bay",
    rows: [
      ...(medic ? [
        { label: "Speed", value: spd(medic.speed), src: "roles.json role.medic speed" },
        { label: "Heal a downed guard in", value: medic.healInterval === undefined ? "n/a" : sec(medic.healInterval), src: "roles.json role.medic healInterval" },
        { label: "Hire cost", value: costOf(medic.cost), src: "roles.json role.medic cost" },
      ] : []),
      ...(med ? [
        { label: "Med bay heal time", value: med.healTime === undefined ? "n/a" : sec(med.healTime), src: "structures.json struct.medical healTime" },
        { label: "Med bay build cost", value: costOf(med.cost), src: "structures.json struct.medical cost" },
      ] : []),
      p("Settler self-heal", "residents.selfHealSeconds", sec),
    ],
  });

  if (hunter) {
    const s = "roles.json role.hunter";
    out.push({
      id: "hunter", title: "Hunters (role.hunter, fight prey)",
      rows: [
        { label: "Speed", value: spd(hunter.speed), src: `${s} speed` },
        { label: "Damage", value: String(hunter.damage ?? "n/a"), src: `${s} damage` },
        { label: "Attack reach", value: hunter.attackRange === undefined ? "n/a" : u(hunter.attackRange), src: `${s} attackRange` },
        { label: "Attack interval", value: hunter.attackInterval === undefined ? "n/a" : sec(hunter.attackInterval), src: `${s} attackInterval` },
      ],
    });
  }

  const dropText = (d: Record<string, number>): string => costOf(d);
  for (const [id, h] of Object.entries(content.hostiles)) {
    const s = `enemies.json ${id}`;
    out.push({
      id: `hostile:${id}`, title: `${id}${h.boss ? " (boss)" : ""}`,
      rows: [
        { label: "HP", value: String(h.hp), src: `${s} hp` },
        { label: "Speed", value: spd(h.speed), src: `${s} speed` },
        { label: "Damage multiplier", value: `x${h.damage}`, src: `${s} damage (default 1)` },
        { label: "Hit on base", value: String(key("defense.baseDamage").v * h.damage), src: `${s} damage x defaults.json defense.baseDamage` },
        p("Base hit reach", "defense.baseRange", u), p("Base hit interval", "defense.baseHitInterval", sec),
        { label: "Hit on a gate", value: String(key("defense.barrierDamage").v * h.damage), src: `${s} damage x defaults.json defense.barrierDamage` },
        p("Gate hit interval", "defense.barrierHitInterval", sec),
        { label: "Hit on a guard or drone", value: String(h.damage), src: `${s} damage` },
        p("Contact reach (guard or drone)", "defense.troopContact", u),
        p("Contact reach (player)", "defense.playerHitRange", u), p("Contact interval (player)", "defense.playerHitInterval", sec),
        { label: "Drops", value: dropText(h.drops), src: `${s} drops` },
        p("Spawn gap in a wave (default)", "defense.spawnGap", sec),
        p("Spawn distance outside the map", "defense.spawnY", u),
      ],
    });
  }

  for (const [id, a] of Object.entries(content.animals)) {
    if (!(a.aggroRange > 0)) continue;
    const s = `animals.json ${id}`;
    out.push({
      id: `animal:${id}`, title: `${id} (spiky hopper: dangerous prey)`,
      rows: [
        { label: "HP", value: String(a.hp), src: `${s} hp` },
        { label: "Wander speed", value: `${spd(a.speedMin)} to ${spd(a.speedMax)}`, src: `${s} speedMin/speedMax` },
        { label: "Charge speed", value: spd(a.chargeSpeed), src: `${s} chargeSpeed` },
        { label: "Notices you within", value: u(a.aggroRange), src: `${s} aggroRange` },
        { label: "Bite reach", value: u(a.attackRange), src: `${s} attackRange` },
        { label: "Bite interval", value: sec(a.attackInterval), src: `${s} attackInterval` },
        { label: "Bite damage (player hp)", value: String(a.damage), src: `${s} damage` },
        { label: "Knock-back", value: u(a.knockDistance), src: `${s} knockDistance` },
        { label: "Stun", value: `${sec(a.stun)} at ${Math.round(a.stunSlow * 100)}% speed`, src: `${s} stun/stunSlow` },
        { label: "Injures hunters", value: a.injuresWorkers ? "yes" : "no", src: `${s} injuresWorkers` },
        { label: "Drops", value: dropText(a.drops), src: `${s} drops` },
        { label: "Respawn", value: sec(a.respawn), src: `${s} respawn` },
        code("systems/hunting.ts:122", `${sec(a.attackInterval / 2)} (half the interval)`, "Wind-up before the first bite"),
      ],
    });
  }

  out.push({
    id: "world", title: "Shared combat settings",
    rows: [
      p("Pickup reach for drops", "drops.pickupRange", u), p("Drop scatter x", "drops.scatterX", u), p("Drop scatter y", "drops.scatterY", u),
      { label: "Barrier section hp", value: String(content.structures["struct.barrier"]?.hp ?? "n/a"), src: "structures.json struct.barrier hp" },
      { label: "Gate hp", value: String(content.structures["struct.gate"]?.hp ?? "n/a"), src: "structures.json struct.gate hp" },
      p("Base health", "meters.baseHealth", num),
      p("Quiet spell between waves", "defense.waveQuiet", sec), p("Lane half width at a gate", "defense.laneHalfWidth", u),
      p("Wall stand-off", "defense.barrierStop", u),
    ],
  });

  if (level) {
    const rows: StatRow[] = [];
    const ov = Object.entries(over).filter(([k]) => /^(player|defense|guards|pads\.defence|drops|meters\.baseHealth|barrier|residents\.selfHeal)/.test(k));
    for (const [k, v] of ov) rows.push({ label: `Param ${k}`, value: String(v), src: "level param" });
    level.waves.forEach((w, i) => {
      const side = Array.isArray(w.side) ? w.side.join("/") : w.side ?? "n";
      const counts = Object.entries(w.counts).map(([k, n]) => `${n} ${k}`).join(", ");
      rows.push({ label: `Wave ${i + 1} at ${sec(w.t)}`, value: `${counts}; side ${side}; gap ${sec(w.gap ?? key("defense.spawnGap").v)}${w.bossRetreat ? `; boss retreats at ${w.bossRetreat}% hp` : ""}`, src: "level manifest waves" });
    });
    for (const e of level.entities) {
      if (e.type === "pad.hire" && content.roles[e.role.role]?.behavior === "guard") rows.push({ label: `Guard pad ${e.id}`, value: costOf(e.cost), src: "level manifest pad.hire cost" });
      if (e.type === "pad.build" && e.build.startsWith("struct.ranged_defense")) rows.push({ label: `Tower pad ${e.id} (${e.build})`, value: costOf(e.cost), src: "level manifest pad.build cost" });
      if (e.type === "pad.build" && e.build.startsWith("struct.barracks")) rows.push({ label: `Guard post pad ${e.id} (${e.build})`, value: costOf(e.cost), src: "level manifest pad.build cost" });
    }
    out.push({ id: "level", title: `This level (${level.id})`, note: "Level params override the defaults above; pad costs are base costs before the defence growth.", rows });
  }
  return out;
}
