import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, describe, expect, it } from "vitest";
import { compactRow, keepRawLog, packManifest, unpackManifest } from "./candidate-log.js";
import { loadManifest, manifestOfCandidate, readCandidate } from "./play-trace.js";

// outpost-ops#251 part 1: the raw log of every build is kept, never overwritten, and a logged candidate can be replayed.
const dir = mkdtempSync(join(tmpdir(), "cand-log-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("keepRawLog", () => {
  it("writes a gzipped copy to the archive and the backup, and never overwrites an earlier file", () => {
    const rows = ['{"a":1}', '{"b":2}'];
    const [a1, b1] = keepRawLog(rows, join(dir, "archive"), "s1-x.jsonl.gz", dir) as [string, string];
    expect(gunzipSync(readFileSync(a1)).toString()).toBe('{"a":1}\n{"b":2}\n');
    expect(b1).toBeDefined();
    const second = keepRawLog(['{"c":3}'], join(dir, "archive"), "s1-x.jsonl.gz", null);
    expect(second[0]).not.toBe(a1);
    expect(gunzipSync(readFileSync(a1)).toString()).toBe('{"a":1}\n{"b":2}\n');
    expect(readdirSync(join(dir, "archive")).sort()).toEqual(["s1-x-2.jsonl.gz", "s1-x.jsonl.gz"]);
  });

  it("skips the backup when its folder does not exist", () => {
    expect(keepRawLog(["{}"], join(dir, "a2"), "p.jsonl.gz", join(dir, "nope"))).toHaveLength(1);
    expect(existsSync(join(dir, "nope"))).toBe(false);
  });
});

describe("play-trace of a logged candidate", () => {
  const m = loadManifest("s1-L061");
  it("reads the manifest from a gzipped row and finds a candidate by its n, in .jsonl and .jsonl.gz", () => {
    const rows = [{ kind: "build" }, { n: 1, manifestGz: "x" }, { n: 2, manifestGz: packManifest(m as never) }].map((r) => JSON.stringify(r));
    const plain = join(dir, "c.jsonl");
    writeFileSync(plain, rows.join("\n") + "\n");
    keepRawLog(rows, dir, "c.jsonl.gz", null);
    for (const f of [plain, join(dir, "c.jsonl.gz")]) {
      expect(manifestOfCandidate(readCandidate(f, 1, 2))).toEqual(m);
      expect(readCandidate(f, 3)["n"]).toBe(2);
    }
    expect(() => readCandidate(plain, 1, 9)).toThrow(/no candidate with n=9/);
  });
});

describe("compactRow", () => {
  it("swaps the raw manifest for its gzipped form, which unpacks to the same manifest", () => {
    const m = { id: "x", entities: [1, 2, 3] };
    const row = compactRow({ n: 1, manifest: m } as { manifest?: unknown }) as Record<string, unknown>;
    expect(row["manifest"]).toBeUndefined();
    expect(unpackManifest(row["manifestGz"] as string)).toEqual(m);
    expect(compactRow({ n: 2 } as { manifest?: unknown })).toEqual({ n: 2 });
  });
});
