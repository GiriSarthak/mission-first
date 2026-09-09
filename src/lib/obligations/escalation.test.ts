import { describe, expect, it } from "vitest";
import {
  daysOverdue,
  daysToNextEscalation,
  effectiveEscalationLevel,
  effectiveObligationStatus,
  ruleEscalationLevel,
  type EscalatableObligation,
} from "./escalation";

const TODAY = new Date("2026-09-09T00:00:00");
const MS_PER_DAY = 86_400_000;
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * MS_PER_DAY);
const inDays = (n: number) => new Date(TODAY.getTime() + n * MS_PER_DAY);

function ob(over: Partial<EscalatableObligation> = {}): EscalatableObligation {
  return {
    dueOn: daysAgo(0),
    receivedOn: null,
    status: "PENDING",
    escalationLevel: 0,
    ...over,
  };
}

describe("daysOverdue", () => {
  it("counts whole days past the due date", () => {
    expect(daysOverdue(ob({ dueOn: daysAgo(10) }), TODAY)).toBe(10);
  });

  it("is zero on the due date itself and before it", () => {
    expect(daysOverdue(ob({ dueOn: daysAgo(0) }), TODAY)).toBe(0);
    expect(daysOverdue(ob({ dueOn: inDays(5) }), TODAY)).toBe(0);
  });

  it("is zero when there is no due date", () => {
    expect(daysOverdue(ob({ dueOn: null }), TODAY)).toBe(0);
  });

  it("stops accruing once received or waived", () => {
    expect(daysOverdue(ob({ dueOn: daysAgo(40), receivedOn: daysAgo(3) }), TODAY)).toBe(0);
    expect(daysOverdue(ob({ dueOn: daysAgo(40), status: "RECEIVED" }), TODAY)).toBe(0);
    expect(daysOverdue(ob({ dueOn: daysAgo(40), status: "WAIVED" }), TODAY)).toBe(0);
  });

  it("accepts ISO strings as well as Dates", () => {
    expect(daysOverdue(ob({ dueOn: daysAgo(9).toISOString() }), TODAY)).toBe(9);
  });
});

describe("ruleEscalationLevel — one rung per 7 days", () => {
  it("stays at 0 through the first six days overdue", () => {
    for (const d of [0, 1, 3, 6]) expect(ruleEscalationLevel(d)).toBe(0);
  });

  it("reaches level 1 at exactly 7 days", () => {
    expect(ruleEscalationLevel(7)).toBe(1);
    expect(ruleEscalationLevel(13)).toBe(1);
  });

  it("reaches level 2 at exactly 14 days", () => {
    expect(ruleEscalationLevel(14)).toBe(2);
    expect(ruleEscalationLevel(20)).toBe(2);
  });

  it("reaches level 3 at exactly 21 days", () => {
    expect(ruleEscalationLevel(21)).toBe(3);
  });

  it("caps at 3 no matter how far overdue", () => {
    expect(ruleEscalationLevel(28)).toBe(3);
    expect(ruleEscalationLevel(365)).toBe(3);
  });
});

describe("effectiveEscalationLevel", () => {
  it("applies the rule when no one has escalated manually", () => {
    expect(effectiveEscalationLevel(ob({ dueOn: daysAgo(15) }), TODAY)).toBe(2);
  });

  it("keeps a manual level that is ahead of the clock", () => {
    // 3 days overdue (rule says 0) but a human escalated to 2
    expect(
      effectiveEscalationLevel(ob({ dueOn: daysAgo(3), escalationLevel: 2 }), TODAY)
    ).toBe(2);
  });

  it("will not let a manual level sit below the rule floor", () => {
    // 25 days overdue: the clock says 3 even though the stored value is 1
    expect(
      effectiveEscalationLevel(ob({ dueOn: daysAgo(25), escalationLevel: 1 }), TODAY)
    ).toBe(3);
  });

  it("does not escalate an obligation that is not yet due", () => {
    expect(effectiveEscalationLevel(ob({ dueOn: inDays(10) }), TODAY)).toBe(0);
  });

  it("freezes at the manual level once received", () => {
    expect(
      effectiveEscalationLevel(
        ob({ dueOn: daysAgo(40), receivedOn: daysAgo(1), escalationLevel: 2 }),
        TODAY
      )
    ).toBe(2);
  });

  it("never exceeds the cap", () => {
    expect(
      effectiveEscalationLevel(ob({ dueOn: daysAgo(90), escalationLevel: 3 }), TODAY)
    ).toBe(3);
  });
});

describe("daysToNextEscalation", () => {
  it("counts down to the next rung", () => {
    // 10 days overdue → level 1; level 2 lands at 14 → 4 days away
    expect(daysToNextEscalation(ob({ dueOn: daysAgo(10) }), TODAY)).toBe(4);
  });

  it("counts down to level 1 from the first day overdue", () => {
    expect(daysToNextEscalation(ob({ dueOn: daysAgo(1) }), TODAY)).toBe(6);
  });

  it("is null before the due date", () => {
    expect(daysToNextEscalation(ob({ dueOn: inDays(2) }), TODAY)).toBeNull();
  });

  it("is null once the cap is reached", () => {
    expect(daysToNextEscalation(ob({ dueOn: daysAgo(30) }), TODAY)).toBeNull();
  });
});

describe("effectiveObligationStatus", () => {
  it("reports OVERDUE once past due, whatever the stored status says", () => {
    expect(
      effectiveObligationStatus(ob({ dueOn: daysAgo(10), status: "PENDING" }), TODAY)
    ).toBe("OVERDUE");
    expect(
      effectiveObligationStatus(ob({ dueOn: daysAgo(1), status: "REQUESTED" }), TODAY)
    ).toBe("OVERDUE");
  });

  it("leaves the stored status alone before the due date", () => {
    expect(
      effectiveObligationStatus(ob({ dueOn: inDays(5), status: "REQUESTED" }), TODAY)
    ).toBe("REQUESTED");
  });

  it("lets RECEIVED and WAIVED win over the clock", () => {
    expect(
      effectiveObligationStatus(ob({ dueOn: daysAgo(40), status: "RECEIVED" }), TODAY)
    ).toBe("RECEIVED");
    expect(
      effectiveObligationStatus(ob({ dueOn: daysAgo(40), status: "WAIVED" }), TODAY)
    ).toBe("WAIVED");
    expect(
      effectiveObligationStatus(
        ob({ dueOn: daysAgo(40), status: "PENDING", receivedOn: daysAgo(2) }),
        TODAY
      )
    ).toBe("RECEIVED");
  });

  it("leaves undated obligations on their stored status", () => {
    expect(
      effectiveObligationStatus(ob({ dueOn: null, status: "PENDING" }), TODAY)
    ).toBe("PENDING");
  });
});
