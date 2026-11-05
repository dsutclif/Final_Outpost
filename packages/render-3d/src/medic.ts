// A medic kneels beside the patient it is healing (the patient's status is `healing`) and faces them.

interface Res { id: number | string; role: string; status: string; target: string | null; pos: { x: number; y: number } }

/** The resident this medic is treating right now, or null: it is a working medic whose target is mid-heal. */
export function patientOf<R extends Res>(residents: readonly R[], isMedic: (role: string) => boolean, m: R): R | null {
  if (m.status !== "ok" || m.target === null || !isMedic(m.role)) return null;
  return residents.find((g) => String(g.id) === m.target && g.status === "healing") ?? null;
}
