import { content } from "@fo/content";
import { canonicalIds } from "./ids.js";
import { marsGreenhouse } from "./mars_greenhouse.js";
import type { Skin } from "./types.js";

// Grey dev skin: every id is labelled by its canonical id, so a missing name or a
// wrong mapping shows up on screen. Built from content, so it is always complete.

const ids = canonicalIds(content);
const names: Record<string, string> = Object.fromEntries(ids.map((id) => [id, id]));

// Greys spaced in lightness so resources stay distinguishable and all clear the margin.
const RES_GREYS = ["#f2f2f2", "#d9d9d9", "#c4c4c4", "#e6e6e6", "#cfcfcf", "#bababa", "#ededed", "#ffffff"];
const res: Record<string, string> = {};
Object.keys(content.resources).forEach((id, i) => { res[id] = RES_GREYS[i % RES_GREYS.length]!; });

const role: Record<string, string> = { "role.idle": "#9a9a9a" };
Object.keys(content.roles).forEach((id, i) => { role[id] = ["#bdbdbd", "#a8a8a8", "#d4d4d4", "#8f8f8f"][i % 4]!; });

const hints: Record<string, string> = Object.fromEntries(Object.keys(marsGreenhouse.text.hints).map((k) => [k, `hint:${k}`]));

export const debugSkin: Skin = {
  id: "debug",
  name: "Debug",
  tagline: "Every id, labelled.",
  lifelineName: "meter.lifeline",
  fuelName: "fuel",
  hazardName: "hazard.event",
  themeColor: "#4a4a4a",
  labelAll: true,
  names,
  palette: {
    ground: "#4a4a4a",
    groundAlt: "#525252",
    groundDark: "#3d3d3d",
    structure: "#9e9e9e",
    structureDark: "#6e6e6e",
    accent: "#e0e0e0",
    interactive: "#f5f5f5",
    danger: "#ff6b6b",
    ok: "#8be28b",
    ink: "#111111",
    glass: "#cfcfcf",
    sky: "#bdbdbd",
    fog: "#8a8a8a",
    storm: "#6e6e6e",
    res,
    role,
    ui: {
      bg: "#2b2b2b",
      panel: "#f2f2f2",
      panelAlt: "#e2e2e2",
      ink: "#111111",
      muted: "#666666",
      go: "#555555",
      goShade: "#333333",
      bad: "#b00020",
      overlay: "rgba(30,30,30,.75)",
    },
  },
  // No sprite keys: the 2D renderer falls back to labelled generic shapes.
  sprites: {},
  models: {},
  text: {
    ...marsGreenhouse.text,
    hints,
    reasons: Object.fromEntries(Object.keys(marsGreenhouse.text.reasons).map((k) => [k, `reason:${k}`])),
    coach: Object.fromEntries(Object.keys(marsGreenhouse.text.coach).map((k) => [k, `coach:${k}`])),
    genericTips: ["debug skin: names are canonical ids"],
  },
  audio: { ...marsGreenhouse.audio },
};
