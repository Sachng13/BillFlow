/**
 * Prorated upgrade charge for remaining days in the current billing period.
 * All amounts in paise (minor units).
 */
export function calculateProratedUpgradeCharge(
  currentPlanPaise: number,
  newPlanPaise: number,
  periodStart: Date,
  periodEnd: Date,
  now: Date = new Date()
): number {
  if (newPlanPaise <= currentPlanPaise) return 0;

  const totalMs = periodEnd.getTime() - periodStart.getTime();
  const remainingMs = Math.max(0, periodEnd.getTime() - now.getTime());
  if (totalMs <= 0 || remainingMs <= 0) return 0;

  const remainingFraction = remainingMs / totalMs;
  const diff = newPlanPaise - currentPlanPaise;
  return Math.round(diff * remainingFraction);
}

export function isUpgrade(currentPlanPaise: number, newPlanPaise: number): boolean {
  return newPlanPaise > currentPlanPaise;
}
