import { Content, checkContentRefs } from "./schema.js";
import resources from "../data/resources.json";
import nodes from "../data/nodes.json";
import sinks from "../data/sinks.json";
import converters from "../data/converters.json";
import roles from "../data/roles.json";
import customers from "../data/customers.json";
import goals from "../data/goals.json";
import modules from "../data/modules.json";
import defaults from "../data/defaults.json";

export * from "./schema.js";
export * from "./manifest.js";

export const CONTENT_VERSION = "0.1.0";

/** The validated content set. Parsing happens once at import time. */
export const content: Content = Content.parse({
  version: CONTENT_VERSION,
  resources,
  nodes,
  sinks,
  converters,
  roles,
  customers,
  goals,
  modules,
  defaults,
});
checkContentRefs(content);
