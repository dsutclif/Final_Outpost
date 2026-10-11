import { uiText, type Skin } from "@fo/skins";

/** What a pad needs before it can be paid, as the 3D renderer knows it. */
export interface LockInfo { kind: "hire" | "build"; requiresCoreLevel?: number | undefined }

/**
 * The second, smaller line of a locked pad's label (its own name stays the title). Mirrors the
 * sim's order in refreshPads/tryPayPad: the core level first, then a hire pad with nobody free.
 * Empty when the pad is not locked.
 */
export function padLockReason(skin: Skin, info: LockInfo | undefined, locked: boolean, coreLevel: number): string {
  if (!locked || !info) return "";
  if (info.requiresCoreLevel !== undefined && coreLevel < info.requiresCoreLevel) return uiText(skin, "needsCoreLevel", { n: info.requiresCoreLevel });
  if (info.kind === "hire") return uiText(skin, "noIdle");
  return uiText(skin, "locked");
}
