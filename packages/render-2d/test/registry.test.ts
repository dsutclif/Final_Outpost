import { CONTENT_VERSION, content, type Manifest } from "@fo/content";
import { ENGINE_VERSION } from "@fo/sim";
import { SKINS, canonicalIds, marsGreenhouse } from "@fo/skins";
import { describe, expect, it } from "vitest";
import l1 from "../../../levels/golden/proto-L001.json";
import l2 from "../../../levels/golden/proto-L002.json";
import l3 from "../../../levels/golden/proto-L003.json";
import l4 from "../../../levels/golden/proto-L004.json";
import { drawLabCell, hasExactDraw, hasItemLook, labVariants } from "../src/index.js";

const golden = [l1, l2, l3, l4].map((m) => ({ ...m, engineVersion: ENGINE_VERSION, contentVersion: CONTENT_VERSION }) as unknown as Manifest);

/** Draw-registry keys a manifest needs: entity types, what pads build, wave hostiles, prey. */
function drawTypes(m: Manifest): Set<string> {
  const out = new Set<string>();
  for (const e of m.entities as unknown as Record<string, unknown>[]) {
    const t = String(e["type"]);
    if (t === "barrier.line") out.add("barrier");
    else if (t === "zone.prey") { out.add("zone.prey"); out.add("unit.prey"); }
    else out.add(t);
    if (t === "pad.build") {
      const b = String(e["build"]);
      if ((b.startsWith("struct.") && !b.endsWith(".t2") && !b.endsWith(".reinforced")) || b.startsWith("conv.")) out.add(b);
    }
  }
  for (const w of m.waves ?? []) for (const h of Object.keys(w.counts)) out.add(h);
  if (m.entities.some((e) => e.type === "sink.sales_point")) { out.add("sink.sales_point.register"); out.add("unit.customer"); }
  out.add("unit.player"); out.add("unit.resident"); out.add("sink.core.safe"); out.add("fx.lasso"); out.add("drop");
  return out;
}

describe("draw registry covers the golden levels", () => {
  for (const m of golden) {
    it(`${m.id}: every referenced type has its own routine (not the crate)`, () => {
      const missing = [...drawTypes(m)].filter((t) => !hasExactDraw(t));
      expect(missing).toEqual([]);
    });
  }

  it("every resource has an item look and every role a headgear key in the launch skin", () => {
    for (const r of Object.keys(content.resources)) expect(hasItemLook(marsGreenhouse.sprites[r] ?? ""), r).toBe(true);
    for (const r of Object.keys(content.roles)) expect(marsGreenhouse.sprites[r], r).toMatch(/^hat\./);
  });

  it("the asset lab draws every canonical id in every state and skin with finite numbers", () => {
    let bad = 0, calls = 0, cur = "";
    const badAt = new Set<string>();
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k];
        return (...args: unknown[]) => {
          calls++;
          if (args.some((a) => typeof a === "number" && !Number.isFinite(a))) { bad++; badAt.add(`${cur}:${String(k)}`); }
          if (k === "createRadialGradient" || k === "createLinearGradient") return { addColorStop: () => undefined };
          if (k === "measureText") return { width: 20 };
          return undefined;
        };
      },
      set(t, k, v) { t[k] = v; return true; },
    }) as unknown as CanvasRenderingContext2D;
    for (const skin of Object.values(SKINS)) for (const id of canonicalIds(content)) for (const v of labVariants(id)) { cur = `${id}/${v}`; drawLabCell(ctx, id, v, 92, 92, { skin, manifest: golden[0]! }); }
    expect(calls).toBeGreaterThan(1000);
    expect([...badAt]).toEqual([]);
    expect(bad).toBe(0);
  });
});
