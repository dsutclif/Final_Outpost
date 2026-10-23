import { Content, checkContentRefs } from "./schema.js";
import resources from "../data/resources.json";
import nodes from "../data/nodes.json";
import animals from "../data/animals.json";
import sinks from "../data/sinks.json";
import converters from "../data/converters.json";
import roles from "../data/roles.json";
import customers from "../data/customers.json";
import hostiles from "../data/enemies.json";
import lassoables from "../data/lassoables.json";
import structures from "../data/structures.json";
import upgrades from "../data/upgrades.json";
import events from "../data/events.json";
import consumers from "../data/consumers.json";
import goals from "../data/goals.json";
import objectives from "../data/objectives.json";
import modules from "../data/modules.json";
import defaults from "../data/defaults.json";
import look from "../data/look.json";

export * from "./schema.js";
export * from "./manifest.js";

export const CONTENT_VERSION = "0.13.0";

/** The validated content set. Parsing happens once at import time. */
export const content: Content = Content.parse({
  version: CONTENT_VERSION,
  resources,
  nodes,
  animals,
  sinks,
  converters,
  roles,
  customers,
  hostiles,
  lassoables,
  structures,
  upgrades,
  events,
  consumers,
  goals,
  objectives,
  modules,
  defaults,
});
checkContentRefs(content);

/** Look and layout scale shared by the generator, 3D renderer and human-view bot (data/look.json). */
export const LOOK = look as {
  buildScale: number; charScale: number; textScale: number; viewW: Record<string, number> & { default: number }; groundK: number;
};
/** Ground width across the screen for a level family (world units at the look point). */
export const viewWidth = (family?: string): number => (family && LOOK.viewW[family]) || LOOK.viewW.default;
