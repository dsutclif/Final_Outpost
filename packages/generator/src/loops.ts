// Repeated hand legs (outpost-ops#87). The reference bot's longest run of identical player trips (`loopMax`, with the trip
// behind it in `loopKey`, legs joined by " + ") may not pass loopCap unless every leg has a takeover: a hire pad whose role
// carries that leg's resource from its source to its target at an affordable price.
import genData from "../data/generator.json";

interface PadLike { type: string; cost?: Record<string, number>; role?: { from?: string; to?: string } }
const S = genData.search as { loopCap: number; takeoverMax: number };

/** Does some hire pad take over the leg "source>resource>target" at a price within search.takeoverMax? */
export function legHasTakeover(leg: string, entities: readonly PadLike[]): boolean {
  const [from, , to] = leg.split(">");
  if (from === undefined || to === undefined) return false;
  return entities.some((e) => e.type === "pad.hire" && e.role?.from === from && e.role?.to === to
    && Object.values(e.cost ?? {}).reduce((a, n) => a + n, 0) <= S.takeoverMax);
}

/**
 * True when a run of more than loopCap identical trips has a leg nobody can be hired to take over. Feeding the reactor by hand
 * stays exempt on a level with no hire pad for it at all (as before #87): there is no takeover to offer, and a level
 * without one (the early ones) could not be built otherwise.
 */
export function loopOverCap(loopMax: number, loopKey: string, entities: readonly PadLike[]): boolean {
  if (loopMax <= S.loopCap) return false;
  const coreHire = entities.some((e) => e.type === "pad.hire" && e.role?.to === "sink.core");
  return loopKey.split(" + ").some((leg) => !legHasTakeover(leg, entities) && !(leg.endsWith(">sink.core") && !coreHire));
}
