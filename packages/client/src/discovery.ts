import { FP, type SimEvent, type State } from "@fo/sim";

// Discovery: which object types the player has used. A type is discovered the first time the
// player (never a worker) interacts with one: gathers from it, deposits into it, pays into it,
// operates, captures, hires, builds or attacks it. Passive buildings (nothing to do but look)
// count once the player walks up to one. Pure functions of events and state, unit tested.

/** Object types that carry a discovery label, by their canonical id prefix or exact id. */
export function labelled(id: string): boolean {
  return /^(node|sink|conv|pad|struct|capture|hostile|zone\.blocked|barrier\.line|unit\.prey|unit\.customer|store)\b/.test(id);
}

/** Walking this close (world units) to a passive structure discovers it. */
const NEAR = 48;

/** Canonical ids of the types this event shows the player touching (may be empty). */
export function touchedBy(e: SimEvent, st: State): string[] {
  const own = !("by" in e) || e.by === undefined;
  switch (e.t) {
    case "gathered": {
      const n = st.nodes[e.node];
      return own && n ? [n.type] : [];
    }
    case "deposited":
      return own ? [e.to] : [];
    case "sold": {
      // the trade rang up at the register; it is the player's when no clerk is on duty
      const clerk = st.residents.some((r) => r.role === "role.cashier" && r.status === "ok");
      const kind = (e as { kind?: string }).kind ?? (e.premium ? "unit.customer_premium" : "unit.customer");
      return [...(clerk ? [] : ["sink.sales_point.register"]), kind];
    }
    case "collected":
      return ["sink.sales_point.pile"];
    case "pad_paid":
    case "unlocked":
    case "hired":
    case "built": {
      const pad = st.pads.find((p) => p.id === e.pad);
      const out: string[] = pad ? [pad.type] : [];
      if (e.t === "hired") out.push(e.role);
      if (e.t === "built" && /^(struct|conv|sink)\./.test(e.build)) out.push(e.build);
      if (e.t === "unlocked") { const n = st.nodes.find((x) => x.id === e.target); if (n) out.push(n.type); }
      return out;
    }
    case "core_upgraded":
      return ["sink.core"];
    case "captured": {
      const c = st.captures.find((x) => x.id === e.capture);
      return c ? [c.type] : [];
    }
    case "hit": {
      if (e.by !== "player") return [];
      if (e.target === "hostile") { const h = st.hostiles.find((x) => x.id === e.id); return h ? [h.type] : []; }
      if (e.target === "prey") return ["unit.prey"];
      return [];
    }
    case "barrier_progress":
      return ["barrier.line"];
    case "barrier_built":
      return ["barrier.line", "struct.barrier"];
    case "zone_cleared":
      return ["zone.blocked"];
    case "converted": {
      // running a converter means standing on its operator spot
      const cv = st.converters.find((x) => x.id === e.conv);
      if (!cv) return [];
      const p = st.player.pos, o = cv.operatorPos;
      return (p.x - o.x) ** 2 + (p.y - o.y) ** 2 <= (NEAR * FP) ** 2 ? [cv.type] : [];
    }
    default:
      return [];
  }
}

/** Passive structures (and gates) the player is standing near. */
export function nearbyPassive(st: State): string[] {
  const p = st.player.pos, r2 = (NEAR * FP) ** 2;
  const out: string[] = [];
  const near = (q: { x: number; y: number }): boolean => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= r2;
  for (const s of st.structures) if (near(s.pos)) out.push(s.type);
  for (const b of st.barriers) for (const s of b.sections) {
    if (s.gate && s.built && near({ x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 })) out.push("struct.gate");
  }
  return out;
}

/** Whether a type still shows its discovery label. */
export const isNew = (discovered: Readonly<Record<string, true>>) => (id: string): boolean => labelled(id) && !discovered[id];
