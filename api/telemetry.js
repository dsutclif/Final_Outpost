// POST /api/telemetry (Vercel function): anonymous play data from the game (docs/review in the ops
// notes; event shapes in packages/client/src/save.ts TelemetryEvent). Each accepted event becomes one
// row of public.telemetry_events in Supabase (schema: supabase/telemetry.sql), which the nightly review
// pulls and aggregates. Nothing personal is accepted: a fixed set of event kinds, short strings,
// numbers and flags only.
//
// Configure in Vercel (Project → Settings → Environment Variables):
//   SUPABASE_URL          https://<project-ref>.supabase.co
//   SUPABASE_SECRET_KEY   the project's secret key (sb_secret_…), or its legacy service_role key
// Without them it answers 503 and the game keeps its events queued on the device.

export const KINDS = new Set(["new_player", "session", "level_start", "level_end", "rating", "play_shape", "perf", "film", "lifecycle", "error"]);
export const MAX_EVENTS = 200;
export const MAX_BYTES = 64 * 1024;
const MAX_STR = 200;
const MAX_KEYS = 40;
const KEY = /^[A-Za-z_][A-Za-z0-9_]{0,39}$/;
/** Events one install may send per instance per 10 minutes (best effort: instances do not share it). */
const RATE = 1000;
const WINDOW_MS = 10 * 60 * 1000;
const seen = new Map();

const send = (res, status, body) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.status(status).json(body);
};

const plain = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

/** A field value the endpoint keeps: short string, finite number, boolean, null, a short list of short strings, or a small map of numbers. */
function okValue(v) {
  if (v === null || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "string") return v.length <= MAX_STR;
  if (Array.isArray(v)) return v.length <= 10 && v.every((x) => typeof x === "string" && x.length <= 40);
  if (plain(v)) {
    const ks = Object.keys(v);
    return ks.length <= 30 && ks.every((k) => KEY.test(k) && typeof v[k] === "number" && Number.isFinite(v[k]));
  }
  return false;
}

/** Checks a request body; returns the events to store or the reason it was refused. */
export function validate(body) {
  if (!plain(body) || body.v !== 2 || !Array.isArray(body.events)) return { error: "expected {v:2, events:[...]}" };
  const events = body.events;
  if (events.length === 0 || events.length > MAX_EVENTS) return { error: `1-${MAX_EVENTS} events per batch` };
  for (const [i, e] of events.entries()) {
    if (!plain(e) || e.v !== 2 || !KINDS.has(e.kind)) return { error: `event ${i}: unknown kind` };
    if (typeof e.ts !== "number" || typeof e.install !== "string" || e.install.length < 8 || e.install.length > 64 || typeof e.session !== "string") return { error: `event ${i}: missing ts/install/session` };
    const ks = Object.keys(e);
    if (ks.length > MAX_KEYS) return { error: `event ${i}: too many fields` };
    for (const k of ks) if (!KEY.test(k) || !okValue(e[k])) return { error: `event ${i}: bad field ${k.slice(0, 40)}` };
  }
  return { events };
}

/** Best-effort per-install cap; returns false when this batch would go over it. */
export function allow(install, n, now = Date.now()) {
  const r = seen.get(install);
  if (!r || now - r.start > WINDOW_MS) { seen.set(install, { start: now, n }); if (seen.size > 5000) seen.clear(); return n <= RATE; }
  r.n += n;
  return r.n <= RATE;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  if (raw.length > MAX_BYTES) return send(res, 413, { error: "batch too large" });
  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {}; } catch { return send(res, 400, { error: "bad JSON" }); }
  const v = validate(body);
  if (v.error) return send(res, 400, { error: v.error });
  if (!allow(v.events[0].install, v.events.length)) return send(res, 429, { error: "slow down" });
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return send(res, 503, { error: "play data storage is not configured" });
  try {
    await insertRows(url, key, v.events.map(toRow));
  } catch (err) {
    console.error("telemetry insert failed", err instanceof Error ? err.message : err);
    return send(res, 502, { error: "storage error" });
  }
  return send(res, 202, { stored: v.events.length });
}

const str = (v) => (typeof v === "string" ? v : null);

/** One table row: the indexed columns, plus the whole event as sent. */
export function toRow(e) {
  return {
    ts: new Date(Number.isFinite(e.ts) ? e.ts : Date.now()).toISOString(),
    kind: e.kind, install: e.install, session: e.session,
    build: str(e.build), engine: str(e.engine), content: str(e.content), np: str(e.np),
    level_id: str(e.levelId), attempt: Number.isInteger(e.attempt) ? e.attempt : null,
    event: e,
  };
}

/** Insert through Supabase's REST API. New secret keys go in `apikey` only; a legacy JWT key also goes in Authorization. */
export async function insertRows(url, key, rows, fetchImpl = fetch) {
  const headers = { apikey: key, "content-type": "application/json", prefer: "return=minimal" };
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`;
  const res = await fetchImpl(`${url.replace(/\/+$/, "")}/rest/v1/telemetry_events`, { method: "POST", headers, body: JSON.stringify(rows) });
  if (!res.ok) throw new Error(`supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
}
