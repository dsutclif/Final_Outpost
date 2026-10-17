// POST /api/progress (Vercel function): the game reports how far the player has got, and when the
// level supply is running low this starts the "Build next level batch" workflow
// (.github/workflows/levels-next.yml), which builds at most one batch, never more than AHEAD levels
// past the player. Stateless: everything it needs is in the request and the published packs.
//
// Configure in Vercel (Project → Settings → Environment Variables):
//   LEVELS_DISPATCH_TOKEN  a fine-grained GitHub token for this repository with "Actions: read and write"
//   LEVELS_REPO            owner/name, default dsutclif/Final_Outpost
// Without the token it answers 503 and nothing is built.

const AHEAD = 60;
/** A batch is worth starting only when it can add at least this many levels. */
const MIN_BATCH = 10;

const send = (res, status, body) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.status(status).json(body);
};

/** Levels published for the given engine and content versions, counted from the deployed packs. */
async function publishedCount(origin, engine, content) {
  const idx = await fetch(`${origin}/levels/packs/index.json`, { cache: "no-store" }).then((r) => r.json());
  let n = 0;
  for (const id of Array.isArray(idx.packs) ? idx.packs : []) {
    if (!/^[\w.-]+$/.test(id)) continue;
    const pack = await fetch(`${origin}/levels/packs/${id}/pack.json`, { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (pack && pack.engineVersion === engine && pack.contentVersion === content && Array.isArray(pack.levels)) n += pack.levels.length;
  }
  return n;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return send(res, 204, {});
  if (req.method !== "POST") return send(res, 405, { queued: false, reason: "POST only" });
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const cleared = Number(b.cleared);
  const engine = String(b.engine ?? ""), content = String(b.content ?? "");
  if (!Number.isInteger(cleared) || cleared < 0 || cleared > 100000 || !/^[\d.]+$/.test(engine) || !/^[\d.]+$/.test(content)) {
    return send(res, 400, { queued: false, reason: "bad progress" });
  }
  const played = (Array.isArray(b.played) ? b.played : []).slice(-20).flatMap((p) => {
    const index = Number(p?.index), stars = Number(p?.stars), attempts = Number(p?.attempts);
    return Number.isInteger(index) && index > 0 && stars >= 0 && stars <= 3 && Number.isInteger(attempts) && attempts >= 1 && attempts < 1000 ? [{ index, stars, attempts }] : [];
  });

  const origin = `https://${req.headers["x-forwarded-host"] ?? req.headers.host}`;
  let published;
  try { published = await publishedCount(origin, engine, content); } catch { return send(res, 502, { queued: false, reason: "packs unreadable" }); }
  // a player cannot have cleared levels that were never published
  const c = Math.min(cleared, published);
  const room = c + AHEAD - published;
  if (room < MIN_BATCH) return send(res, 200, { queued: false, reason: `${published - c} levels ahead`, published });

  const token = process.env.LEVELS_DISPATCH_TOKEN;
  if (!token) return send(res, 503, { queued: false, reason: "level supply not configured", published });
  const repo = process.env.LEVELS_REPO || "dsutclif/Final_Outpost";
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/levels-next.yml/dispatches`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { cleared: String(c), played: JSON.stringify(played) } }),
  });
  if (r.status !== 204) return send(res, 502, { queued: false, reason: `dispatch failed (${r.status})`, published });
  return send(res, 202, { queued: true, published, cleared: c });
}
