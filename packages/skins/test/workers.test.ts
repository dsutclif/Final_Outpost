import { content } from "@fo/content";
import { describe, expect, it } from "vitest";
import { marsGreenhouse, nameOf, purposeOf, workerName, workerPurpose } from "../src/index.js";

describe("worker names", () => {
  it("names a worker for what they work", () => {
    expect(workerName(marsGreenhouse, "role.supplier", { res: "Ore", dest: "Smelter" })).toBe("Ore collector");
    expect(workerName(marsGreenhouse, "role.operator", { machine: "Galley" })).toBe("Galley operator");
    expect(workerPurpose(marsGreenhouse, "role.supplier", { res: "Ore", dest: "Smelter" })).toBe("Collects ore for the smelter");
  });

  it("falls back to the plain role name and purpose when a var is missing", () => {
    expect(workerName(marsGreenhouse, "role.supplier", {})).toBe(nameOf(marsGreenhouse, "role.supplier"));
    expect(workerPurpose(marsGreenhouse, "role.operator", {})).toBe(purposeOf(marsGreenhouse, "role.operator"));
    expect(workerName(marsGreenhouse, "role.defender", { res: "Ore" })).toBe(nameOf(marsGreenhouse, "role.defender"));
  });

  it("templates only roles that exist", () => {
    for (const id of Object.keys(marsGreenhouse.workerNames ?? {})) expect(content.roles[id], id).toBeDefined();
  });
});
