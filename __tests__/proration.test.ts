import { calculateProratedUpgradeCharge, isUpgrade } from "@/lib/proration";

describe("upgrade proration", () => {
  const periodStart = new Date("2026-07-01T00:00:00Z");
  const periodEnd = new Date("2026-07-31T00:00:00Z");
  const midPeriod = new Date("2026-07-16T00:00:00Z");

  it("detects upgrade vs downgrade", () => {
    expect(isUpgrade(49900, 149900)).toBe(true);
    expect(isUpgrade(149900, 49900)).toBe(false);
  });

  it("charges prorated difference for mid-cycle upgrade", () => {
    const charge = calculateProratedUpgradeCharge(
      49900,
      149900,
      periodStart,
      periodEnd,
      midPeriod
    );
    // ~half month of ₹1000 difference
    expect(charge).toBeGreaterThan(40000);
    expect(charge).toBeLessThan(60000);
  });

  it("returns zero for downgrade", () => {
    expect(
      calculateProratedUpgradeCharge(149900, 49900, periodStart, periodEnd, midPeriod)
    ).toBe(0);
  });

  it("returns zero when period has ended", () => {
    const afterEnd = new Date("2026-08-05T00:00:00Z");
    expect(
      calculateProratedUpgradeCharge(49900, 149900, periodStart, periodEnd, afterEnd)
    ).toBe(0);
  });
});
