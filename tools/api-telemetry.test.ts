import { describe, expect, it } from "vitest";

// api/telemetry.js is plain JS (a Vercel function); loaded by a computed path so tsc does not need its types.
const path = "../api/telemetry.js";
const api = (await import(/* @vite-ignore */ path)) as {
  validate: (b: unknown) => { events?: unknown[]; error?: string };
  allow: (install: string, n: number, now?: number) => boolean;
  toRow: (e: Record<string, unknown>) => Record<string, unknown>;
  insertRows: (url: string, key: string, rows: unknown[], f?: (u: string, i: RequestInit) => Promise<Response>) => Promise<void>;
  default: (req: unknown, res: unknown) => Promise<void>;
};

const ev = (extra: Record<string, unknown> = {}) => ({ v: 2, kind: "level_end", ts: 1, install: "install-123", session: "s1", build: "abc", engine: "0.1", content: "0.1", np: null, levelId: "s1-L001", attempt: 1, outcome: "win", ...extra });

const fakeRes = () => {
  const r = { code: 0, body: null as unknown, headers: {} as Record<string, string> };
  return { r, res: { setHeader: (k: string, v: string) => { r.headers[k] = v; }, status: (c: number) => ({ json: (b: unknown) => { r.code = c; r.body = b; } }) } };
};

describe("play data endpoint", () => {
  it("accepts a well-formed batch, including a play shape's acts map and a rating's chips", () => {
    const v = api.validate({ v: 2, events: [ev(), ev({ kind: "play_shape", acts: { gathered: 4, built: 1 } }), ev({ kind: "rating", thumb: "down", chips: ["boring"] })] });
    expect(v.error).toBeUndefined();
    expect(v.events).toHaveLength(3);
  });

  it.each([
    ["no version", { events: [ev()] }],
    ["empty batch", { v: 2, events: [] }],
    ["unknown kind", { v: 2, events: [ev({ kind: "email" })] }],
    ["long string", { v: 2, events: [ev({ reason: "x".repeat(201) })] }],
    ["nested object", { v: 2, events: [ev({ acts: { a: { b: 1 } } })] }],
    ["short install id", { v: 2, events: [ev({ install: "x" })] }],
    ["bad key", { v: 2, events: [ev({ "user-email": "a" })] }],
    ["too many events", { v: 2, events: Array.from({ length: 201 }, () => ev()) }],
  ])("refuses %s", (_name, body) => {
    expect(api.validate(body).error).toBeTruthy();
  });

  it("caps one install's events per window", () => {
    expect(api.allow("cap-test", 900, 0)).toBe(true);
    expect(api.allow("cap-test", 200, 1000)).toBe(false);
    expect(api.allow("cap-test", 10, 11 * 60 * 1000)).toBe(true);
  });

  it("maps an event to a table row and inserts through Supabase REST", async () => {
    const row = api.toRow(ev({ kind: "rating", thumb: "up" }));
    expect(row).toMatchObject({ kind: "rating", install: "install-123", level_id: "s1-L001", attempt: 1, np: null, ts: new Date(1).toISOString() });
    expect((row.event as { thumb: string }).thumb).toBe("up");
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status: 201 }); };
    await api.insertRows("https://p.supabase.co/", "sb_secret_x", [row], ok);
    expect(calls[0]!.url).toBe("https://p.supabase.co/rest/v1/telemetry_events");
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h["apikey"]).toBe("sb_secret_x");
    expect(h["authorization"]).toBeUndefined();
    await api.insertRows("https://p.supabase.co", "eyJlegacy", [row], ok);
    expect((calls[1]!.init.headers as Record<string, string>)["authorization"]).toBe("Bearer eyJlegacy");
    await expect(api.insertRows("https://p.supabase.co", "k", [row], async () => new Response("bad", { status: 400 }))).rejects.toThrow(/400/);
  });

  it("answers 503 without storage settings and 400 for junk", async () => {
    delete process.env["SUPABASE_URL"];
    delete process.env["SUPABASE_SECRET_KEY"];
    const a = fakeRes();
    await api.default({ method: "POST", body: { v: 2, events: [ev({ install: "install-503" })] } }, a.res);
    expect(a.r.code).toBe(503);
    const b = fakeRes();
    await api.default({ method: "POST", body: "{nope" }, b.res);
    expect(b.r.code).toBe(400);
    const c = fakeRes();
    await api.default({ method: "GET" }, c.res);
    expect(c.r.code).toBe(405);
  });
});
