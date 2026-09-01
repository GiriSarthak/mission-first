import { describe, expect, it } from "vitest";
import {
  computeDelayCost,
  formatInr,
  type DelayCostObligation,
} from "./delayCost";

const START = new Date("2026-01-01T00:00:00");
const TODAY = new Date("2026-06-01T00:00:00");
const MS_PER_DAY = 86_400_000;
const day = (n: number) => new Date(START.getTime() + n * MS_PER_DAY);

const CONTRACT_VALUE = 100_000_000; // ₹10 Cr — round numbers keep the maths checkable

function obligation(
  over: Partial<DelayCostObligation> = {}
): DelayCostObligation {
  return {
    id: "o1",
    title: "Supply of agency equipment",
    owedBy: "AGENCY",
    status: "OVERDUE",
    dueOn: new Date(TODAY.getTime() - 10 * MS_PER_DAY), // 10 days overdue
    receivedOn: null,
    blockingActivityId: "A_CRIT",
    ...over,
  };
}

function base(over: Partial<Parameters<typeof computeDelayCost>[0]> = {}) {
  return computeDelayCost({
    contractStart: START,
    contractDurationDays: 300,
    contractValue: CONTRACT_VALUE,
    ldWeeklyRatePct: 0.5,
    ldCapPct: 10,
    forecastFinishOffset: 300, // on time
    criticalActivityIds: ["A_CRIT"],
    obligations: [],
    today: TODAY,
    ...over,
  });
}

describe("computeDelayCost — no delay", () => {
  it("reports zero delay, zero exposure, and zero attribution", () => {
    const r = base();
    expect(r.delayDays).toBe(0);
    expect(r.ldExposure).toBe(0);
    expect(r.ldCapReached).toBe(false);
    expect(r.agencyAttributableDays).toBe(0);
    expect(r.vendorAttributableDays).toBe(0);
    expect(r.agencyAttributablePct).toBe(0);
    expect(r.drivers).toEqual([]);
  });

  it("treats an early forecast finish as zero delay, not negative", () => {
    const r = base({ forecastFinishOffset: 280 });
    expect(r.delayDays).toBe(0);
    expect(r.ldExposure).toBe(0);
  });

  it("still reports the contract and forecast dates", () => {
    const r = base();
    expect(r.contractFinishDate?.toISOString().slice(0, 10)).toBe(
      day(300).toISOString().slice(0, 10)
    );
    expect(r.forecastFinishDate?.toISOString().slice(0, 10)).toBe(
      day(300).toISOString().slice(0, 10)
    );
  });
});

describe("computeDelayCost — LD exposure", () => {
  it("charges the weekly rate pro rata", () => {
    // 14 days late = 2 weeks × 0.5% = 1% of ₹10 Cr = ₹10,00,000
    const r = base({ forecastFinishOffset: 314 });
    expect(r.delayDays).toBe(14);
    expect(r.ldExposure).toBeCloseTo(1_000_000, 6);
    expect(r.ldCapReached).toBe(false);
  });

  it("caps exposure at ldCapPct once the delay exceeds the cap", () => {
    // 200 days ≈ 28.6 weeks × 0.5% = 14.3% — above the 10% cap
    const r = base({ forecastFinishOffset: 500 });
    expect(r.delayDays).toBe(200);
    expect(r.ldExposure).toBeCloseTo(10_000_000, 6); // exactly the 10% cap
    expect(r.ldCapAmount).toBeCloseTo(10_000_000, 6);
    expect(r.ldCapReached).toBe(true);
  });

  it("marks the cap reached exactly at the boundary", () => {
    // 140 days = 20 weeks × 0.5% = 10.0% — exactly the cap
    const r = base({ forecastFinishOffset: 440 });
    expect(r.delayDays).toBe(140);
    expect(r.ldExposure).toBeCloseTo(10_000_000, 6);
    expect(r.ldCapReached).toBe(true);
  });

  it("does not throw when LD terms or contract value are unset", () => {
    const r = base({
      forecastFinishOffset: 400,
      ldWeeklyRatePct: null,
      ldCapPct: null,
      contractValue: null,
    });
    expect(r.delayDays).toBe(100);
    expect(r.ldExposure).toBe(0);
    expect(r.ldCapAmount).toBe(0);
    expect(r.ldCapReached).toBe(false);
  });

  it("does not throw when the contract has no start or duration", () => {
    const r = base({ contractStart: null, contractDurationDays: null });
    expect(r.delayDays).toBe(0);
    expect(r.contractFinishDate).toBeNull();
    expect(r.forecastFinishDate).toBeNull();
    expect(r.ldExposure).toBe(0);
  });
});

describe("computeDelayCost — attribution", () => {
  it("assigns the delay to the agency when an overdue obligation blocks a critical activity", () => {
    // 10-day delay, obligation 10 days overdue on the critical path
    const r = base({ forecastFinishOffset: 310, obligations: [obligation()] });
    expect(r.delayDays).toBe(10);
    expect(r.agencyAttributableDays).toBe(10);
    expect(r.vendorAttributableDays).toBe(0);
    expect(r.agencyAttributablePct).toBe(100);
    expect(r.drivers).toHaveLength(1);
    expect(r.drivers[0].attributedDays).toBe(10);
  });

  it("assigns the delay to the vendor when no agency obligation is implicated", () => {
    const r = base({ forecastFinishOffset: 310, obligations: [] });
    expect(r.delayDays).toBe(10);
    expect(r.agencyAttributableDays).toBe(0);
    expect(r.vendorAttributableDays).toBe(10);
    expect(r.agencyAttributablePct).toBe(0);
  });

  it("splits when the obligation is overdue by less than the total delay", () => {
    // 30-day delay, obligation only 10 days overdue
    const r = base({ forecastFinishOffset: 330, obligations: [obligation()] });
    expect(r.delayDays).toBe(30);
    expect(r.agencyAttributableDays).toBe(10);
    expect(r.vendorAttributableDays).toBe(20);
    expect(Math.round(r.agencyAttributablePct)).toBe(33);
  });

  it("caps the agency share at the total delay when several obligations overlap", () => {
    const r = base({
      forecastFinishOffset: 310, // 10-day delay
      obligations: [
        obligation({ id: "o1" }),
        obligation({ id: "o2", title: "Drawing approval" }),
      ],
    });
    // both are 10 days overdue; the sum (20) is capped at the 10-day delay
    expect(r.agencyAttributableDays).toBe(10);
    expect(r.vendorAttributableDays).toBe(0);
    expect(r.agencyAttributablePct).toBe(100);
    expect(r.drivers).toHaveLength(2);
  });

  it("ignores obligations that are not on the critical path", () => {
    const r = base({
      forecastFinishOffset: 310,
      obligations: [obligation({ blockingActivityId: "A_FLOAT" })],
    });
    expect(r.agencyAttributableDays).toBe(0);
    expect(r.vendorAttributableDays).toBe(10);
  });

  it("ignores obligations with no blocking activity linked", () => {
    const r = base({
      forecastFinishOffset: 310,
      obligations: [obligation({ blockingActivityId: null })],
    });
    expect(r.agencyAttributableDays).toBe(0);
  });

  it("ignores obligations owed by the vendor", () => {
    const r = base({
      forecastFinishOffset: 310,
      obligations: [obligation({ owedBy: "VENDOR" })],
    });
    expect(r.agencyAttributableDays).toBe(0);
  });

  it("ignores fulfilled and waived obligations", () => {
    const received = base({
      forecastFinishOffset: 310,
      obligations: [obligation({ receivedOn: TODAY })],
    });
    expect(received.agencyAttributableDays).toBe(0);

    const waived = base({
      forecastFinishOffset: 310,
      obligations: [obligation({ status: "WAIVED" })],
    });
    expect(waived.agencyAttributableDays).toBe(0);
  });

  it("ignores obligations that are not yet due", () => {
    const r = base({
      forecastFinishOffset: 310,
      obligations: [
        obligation({ dueOn: new Date(TODAY.getTime() + 5 * MS_PER_DAY) }),
      ],
    });
    expect(r.agencyAttributableDays).toBe(0);
  });

  it("attributes nothing when there is no delay to attribute", () => {
    const r = base({ forecastFinishOffset: 300, obligations: [obligation()] });
    expect(r.delayDays).toBe(0);
    expect(r.agencyAttributableDays).toBe(0);
    expect(r.drivers).toEqual([]);
  });

  it("orders drivers by attributed days, largest first", () => {
    const r = base({
      forecastFinishOffset: 400, // 100-day delay, nothing gets capped
      obligations: [
        obligation({ id: "small", dueOn: new Date(TODAY.getTime() - 3 * MS_PER_DAY) }),
        obligation({ id: "big", dueOn: new Date(TODAY.getTime() - 40 * MS_PER_DAY) }),
      ],
    });
    expect(r.drivers.map((d) => d.obligationId)).toEqual(["big", "small"]);
    expect(r.agencyAttributableDays).toBe(43);
    expect(r.vendorAttributableDays).toBe(57);
  });
});

describe("formatInr", () => {
  it("uses crore, lakh, and plain rupees by magnitude", () => {
    expect(formatInr(227_142_147)).toBe("₹22.71 Cr");
    expect(formatInr(4_860_000)).toBe("₹48.60 L");
    expect(formatInr(9_500)).toBe("₹9,500");
    expect(formatInr(0)).toBe("₹0");
  });
});
