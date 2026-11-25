import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { viewWidth } from "@fo/content";
import { marsGreenhouse } from "@fo/skins";
import { createCamera, DEFAULT_FOV, DEFAULT_PITCH, DEFAULT_YAW, followStep, projectPoint, type FrameOpts } from "@fo/render-3d/camframe";

// outpost-ops#385: "A road. And a kiosk" must play with the kiosk on the phone screen, whichever way the commander walks up to it.
// The commander is centred by the follow camera, so the kiosk's screen offset is the trigger radius (plus the camera's lag behind a
// walking commander). A radius as wide as half the screen (the old r 100) put the kiosk at or past a side edge for some bearings.
// Deterministic: walk straight at the kiosk from 24 bearings with the renderer's own follow step; at the moment the cue's `near` radius is
// crossed the kiosk centre must sit INSET_PX inside the screen.
const PHONE = { cssW: 390, cssH: 845 };
const SPEED = 155; // defaults.json player.speed, units a second
const INSET_PX = 30; // the kiosk centre sits this far inside each side edge: a body about 120 px wide then shows 3/4 of it (the probe wants 1/4)
const manifest = JSON.parse(readFileSync(join(__dirname, "..", "..", "..", "levels", "story", "story-L003.json"), "utf8")) as { map: { w: number; h: number }; family?: string; entities: { id?: string; at?: number[] }[]; openAfter?: string };

describe("Level 3 kioskFound frames the kiosk (outpost-ops#385)", () => {
  const cue = marsGreenhouse.story!.levels["story-L003"]!.cues.find((c) => c.id === "kioskFound")!;
  const on = cue.on as { near: { entity: string }; r: number };
  const k = manifest.entities.find((e) => e.id === on.near.entity)!.at!;
  const K = { x: k[0]!, y: k[1]! };
  const fo: FrameOpts = { viewW: viewWidth(manifest.family), ...PHONE, yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, fov: DEFAULT_FOV };

  for (let b = 0; b < 360; b += 15) {
    it(`kiosk is on screen when approached from bearing ${b}`, () => {
      const a = (b * Math.PI) / 180, dir = { x: Math.cos(a), y: Math.sin(a) };
      const at = (d: number) => ({ x: K.x + dir.x * d, y: K.y + dir.y * d });
      const inMap = (p: { x: number; y: number }) => p.x >= 0 && p.x <= manifest.map.w && p.y >= 0 && p.y <= manifest.map.h;
      let d = 400;
      while (d > 150 && !inMap(at(d))) d -= 10;
      const cam = createCamera();
      followStep(cam, at(d), 1 / 60, fo, 1, manifest.map, true);
      while (d > on.r) { d -= SPEED / 60; followStep(cam, at(d), 1 / 60, fo, 1, manifest.map, false); }
      const g = projectPoint(K, 0, cam, fo, 1);
      expect(g.x, `kiosk centre x ${Math.round(g.x)}`).toBeGreaterThanOrEqual(INSET_PX);
      expect(g.x, `kiosk centre x ${Math.round(g.x)}`).toBeLessThanOrEqual(PHONE.cssW - INSET_PX);
      expect(g.y).toBeGreaterThan(0);
      expect(g.y).toBeLessThan(PHONE.cssH);
    });
  }
});
