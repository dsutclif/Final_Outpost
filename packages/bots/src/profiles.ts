// The skill ladder. Every bot shares the planner and the controller; they differ only in
// human-like imprecision (Isaksen & Nealen 2015): reaction delay, input timing noise, route
// wander and priority mistakes, plus whether they notice a second demand while busy.

export interface BotProfile {
  name: string;
  /** Ticks between deciding on a new task and acting on it. */
  reactionTicks: number;
  /** Route wander: the perpendicular share of each step (0 = straight lines). Also scales input timing noise. */
  routeNoise: number;
  /** Probability that a decision takes the second-best task instead of the best. */
  priorityErr: number;
  /** True: re-checks every demand while busy. False: only looks up when the current task ends or times out. */
  multitask: boolean;
  /** Per-attempt shrink of all noise terms: noise × (1 − learn)^attempt. */
  learn: number;
  /** Ticks between re-evaluations of the task list. */
  evalTicks: number;
}

export const LADDER: readonly BotProfile[] = [
  { name: "good", reactionTicks: 3, routeNoise: 0, priorityErr: 0, multitask: true, learn: 0.3, evalTicks: 4 },
  { name: "average", reactionTicks: 10, routeNoise: 0.2, priorityErr: 0.06, multitask: true, learn: 0.3, evalTicks: 6 },
  { name: "weak", reactionTicks: 20, routeNoise: 0.4, priorityErr: 0.15, multitask: false, learn: 0.3, evalTicks: 8 },
  { name: "novice", reactionTicks: 40, routeNoise: 0.6, priorityErr: 0.28, multitask: false, learn: 0.3, evalTicks: 12 },
  { name: "floor", reactionTicks: 70, routeNoise: 0.8, priorityErr: 0.42, multitask: false, learn: 0.3, evalTicks: 16 },
];

export const PROFILES: Readonly<Record<string, BotProfile>> = Object.fromEntries(LADDER.map((p) => [p.name, p]));

/** The profile after `attempt` previous tries: every noise term shrinks by the learn factor. */
export function withLearning(p: BotProfile, attempt: number): BotProfile {
  if (attempt <= 0 || p.learn <= 0) return p;
  const k = Math.pow(1 - p.learn, attempt);
  return {
    ...p,
    reactionTicks: Math.max(1, Math.round(p.reactionTicks * k)),
    routeNoise: p.routeNoise * k,
    priorityErr: p.priorityErr * k,
  };
}
