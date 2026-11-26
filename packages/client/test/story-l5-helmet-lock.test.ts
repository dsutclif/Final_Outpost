import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Brain, PROFILES, planBot } from "@fo/bots";
import { createSim, seedRng, FP, type State } from "@fo/sim";
import { traceStory } from "../src/story/trace.js";

// Level 5 helmet round: the helmet cannot be picked up before KILN's "They dropped something." has played, even when the
// commander is already standing at the fall spot when the retreat lines start (the old catch-up block played the three lines
// out of order instead). Required order: They're running -> signal hasn't stopped -> They dropped something -> pickup -> kneel -> film.
const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "levels", "story", "story-L005.json"), "utf8"));

describe("level 5 helmet pickup lock", () => {
  it("a commander standing on the fall spot from the start of the retreat lines takes the helmet only after KILN's line", async () => {
    const cp = createSim({ ...manifest, seed: 1 } as never).compiled;
    const brain = new Brain(cp, planBot(manifest), PROFILES["good"]!, seedRng(1));
    let fallSpot: { x: number; y: number } | null = null;
    let sawHeld = false;
    let helmetGoneTick = -1;
    let heldWhileStanding = 0;
    const t = await traceStory("story-L005", manifest, {
      follow: {
        drive(st: State) {
          const c = st.captures.find((x) => x.type === "capture.helmet");
          if (c?.heldBy) sawHeld = true;
          if (c && sawHeld && !c.heldBy && fallSpot === null) fallSpot = { ...c.pos };
          if (!c && helmetGoneTick < 0) helmetGoneTick = st.tick;
          if (c && fallSpot) {
            // walk onto the helmet and stand there for good
            const dx = c.pos.x - st.player.pos.x, dy = c.pos.y - st.player.pos.y, d = Math.hypot(dx, dy);
            if (d < 2 * FP) { if (c.hold) heldWhileStanding++; return { dx: 0, dy: 0 }; }
            return { dx, dy };
          }
          return brain.tick(st);
        },
        onArrow() {},
      },
    });
    expect(fallSpot).not.toBeNull();
    expect(heldWhileStanding).toBeGreaterThan(0); // it was held while the commander stood on it
    const lines = t.rows.filter((r) => r.what === "line").map((r) => ({ tick: r.tick, text: r.detail }));
    const idx = (s: string): number => lines.findIndex((l) => l.text.includes(s));
    const a = idx("They're running"), b = idx("signal hasn't stopped"), c = idx("They dropped something"), d = idx("Vale?");
    expect(a).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(d).toBeGreaterThan(c);
    expect(helmetGoneTick).toBeGreaterThanOrEqual(lines[c]!.tick);
    const film = t.rows.find((r) => r.what === "film" && r.detail.includes("helmet_reveal"))!;
    expect(film.tick).toBeGreaterThanOrEqual(lines[c]!.tick);
  }, 240_000);
});
