import { jobDone, jobOf, type Compiled, type PadState, type State } from "@fo/sim";
import { nameOf, uiText, type Skin } from "@fo/skins";

/** What a pad needs before it can be paid, as the 3D renderer knows it. */
export interface LockInfo { kind: "hire" | "build"; requiresCoreLevel?: number | undefined }

/**
 * A `manual` hire pad whose other requirements are met but whose job the player hasn't done by hand
 * yet. The sim hides it (pad.visible false); the renderer draws it locked instead of not at all.
 */
export function heldForHand(st: State, cp: Compiled, pad: PadState): boolean {
  return heldJob(st, cp, pad) !== null;
}

/** The job (sim jobOf id) a held pad is waiting on, or null when the pad is not held. */
export function heldJob(st: State, cp: Compiled, pad: PadState): string | null {
  const e = cp.entityById[pad.id];
  if (pad.done || !e || e.type !== "pad.hire" || !e.manual) return null;
  const req = e.requires;
  if (req?.pad !== undefined && !(st.pads.some((p) => p.id === req.pad && p.done) || st.built.includes(req.pad))) return null;
  if (req?.wave !== undefined && st.waves.idx < req.wave) return null;
  const job = jobOf(cp, e);
  return job && !jobDone(st, job) ? job : null;
}

/** Skin line for a held pad: what to do by hand, from its job id (`kind` or `kind:from>to`); the generic line when unknown. */
function jobText(skin: Skin, job: string): string {
  const [kind = "", rest = ""] = job.split(":");
  const [from = "", to = ""] = rest.split(">");
  const name = (id: string): string => nameOf(skin, id);
  switch (kind) {
    case "guard": return uiText(skin, "doGuard");
    case "hunt": return uiText(skin, "doHunt");
    case "clerk": return uiText(skin, "doClerk");
    case "operate": return uiText(skin, "doOperate", { name: name(rest) });
    case "carry": return uiText(skin, "doCarry", { from: name(from), to: name(to) });
    default: return uiText(skin, "doByHandFirst");
  }
}

/**
 * The second, smaller line of a locked pad's label (its own name stays the title). Mirrors the
 * sim's order in refreshPads/tryPayPad: the core level first, then a hire pad with nobody free.
 * Empty when the pad is not locked.
 */
export function padLockReason(skin: Skin, info: LockInfo | undefined, locked: boolean, coreLevel: number, hurt = 0, byHand: boolean | string = false): string {
  if (!locked || !info) return "";
  if (byHand) return typeof byHand === "string" ? jobText(skin, byHand) : uiText(skin, "doByHandFirst");
  if (info.requiresCoreLevel !== undefined && coreLevel < info.requiresCoreLevel) return uiText(skin, "needsCoreLevel", { n: info.requiresCoreLevel });
  if (info.kind === "hire") return hurt > 0 ? uiText(skin, "noIdleHurt", { n: hurt }) : uiText(skin, "noIdle");
  return uiText(skin, "locked");
}
