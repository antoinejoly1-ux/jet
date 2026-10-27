/**
 * The "at a glance" sentences on Home, computed from the owner's own numbers
 * (no AI, no guessing): how long their hours last at this year's pace, and
 * whether spending is ahead of the calendar. Pure, so it's tested directly.
 */
export type Insight =
  | { kind: "hoursPace"; months: number; until: string; tone: "ok" | "warning" }
  | { kind: "hoursUnused"; tone: "ok" }
  | { kind: "budgetPace"; spentShare: number; yearShare: number; tone: "ok" | "warning" };

export function insightsFor(input: {
  now: Date;
  minutesRemaining: number;
  usedThisYearMinutes: number;
  budget: { plannedCents: number; spentCents: number } | null;
}): Insight[] {
  const { now } = input;
  const startOfYear = Date.UTC(now.getUTCFullYear(), 0, 1);
  const yearLength = Date.UTC(now.getUTCFullYear() + 1, 0, 1) - startOfYear;
  const yearShare = (now.getTime() - startOfYear) / yearLength;
  const monthsElapsed = Math.max(yearShare * 12, 0.5); // too early in January to say much otherwise
  const out: Insight[] = [];

  if (input.minutesRemaining > 0) {
    const perMonth = input.usedThisYearMinutes / monthsElapsed;
    if (perMonth <= 0) out.push({ kind: "hoursUnused", tone: "ok" });
    else {
      const months = input.minutesRemaining / perMonth;
      const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + Math.floor(months), 15));
      out.push({
        kind: "hoursPace",
        months: Math.round(months * 10) / 10,
        until: until.toISOString().slice(0, 7),
        // Running out before the year ends is worth flagging.
        tone: until.getUTCFullYear() === now.getUTCFullYear() ? "warning" : "ok",
      });
    }
  }

  if (input.budget && input.budget.plannedCents > 0) {
    const spentShare = input.budget.spentCents / input.budget.plannedCents;
    out.push({
      kind: "budgetPace",
      spentShare: Math.round(spentShare * 100) / 100,
      yearShare: Math.round(yearShare * 100) / 100,
      tone: spentShare > yearShare + 0.1 ? "warning" : "ok",
    });
  }
  return out;
}
