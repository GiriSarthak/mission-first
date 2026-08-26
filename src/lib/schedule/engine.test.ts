import { describe, expect, it } from "vitest";
import {
  computeSchedule,
  expectedDuration,
  finishProbability,
  layoutNetwork,
  type EngineActivity,
  type EngineLink,
} from "./engine";

const START = new Date("2026-01-01T00:00:00Z");
const day = (n: number) => new Date(START.getTime() + n * 86_400_000);

function act(id: string, m: number, extra: Partial<EngineActivity> = {}): EngineActivity {
  return { id, code: id, name: id, mostLikely: m, ...extra };
}

function fs(a: string, b: string, lag = 0): EngineLink {
  return { predecessorId: a, successorId: b, type: "FS", lagDays: lag };
}

function schedule(
  acts: EngineActivity[],
  links: EngineLink[],
  dataDate = START
) {
  const r = computeSchedule(acts, links, START, dataDate);
  if (!r.ok) throw new Error("expected ok schedule");
  return r;
}

describe("expectedDuration", () => {
  it("computes PERT expected value and variance", () => {
    const { expected, variance } = expectedDuration(6, 12, 24);
    expect(expected).toBe(13);
    expect(variance).toBe(9);
  });

  it("falls back to mostLikely with zero variance when o/p absent", () => {
    expect(expectedDuration(null, 12, null)).toEqual({ expected: 12, variance: 0 });
    expect(expectedDuration(6, 12, undefined)).toEqual({ expected: 12, variance: 0 });
  });
});

describe("computeSchedule — simple chain", () => {
  it("computes ES/EF/LS/LF and marks everything critical", () => {
    const r = schedule(
      [act("A", 5), act("B", 3), act("C", 2)],
      [fs("A", "B"), fs("B", "C")]
    );
    const [a, b, c] = ["A", "B", "C"].map((id) => r.byId.get(id)!);
    expect([a.es, a.ef]).toEqual([0, 5]);
    expect([b.es, b.ef]).toEqual([5, 8]);
    expect([c.es, c.ef]).toEqual([8, 10]);
    expect(r.projectFinish).toBe(10);
    expect(r.activities.every((x) => x.isCritical)).toBe(true);
    expect(r.activities.every((x) => x.totalFloat === 0)).toBe(true);
    expect(r.criticalPath).toEqual(["A", "B", "C"]);
  });
});

describe("computeSchedule — parallel branches", () => {
  it("gives the shorter branch float and keeps the longer one critical", () => {
    const r = schedule(
      [act("A", 5), act("B", 3), act("C", 2)],
      [fs("A", "C"), fs("B", "C")]
    );
    const a = r.byId.get("A")!;
    const b = r.byId.get("B")!;
    expect(a.isCritical).toBe(true);
    expect(b.isCritical).toBe(false);
    expect(b.totalFloat).toBe(2);
    expect(b.freeFloat).toBe(2);
    expect(r.projectFinish).toBe(7);
  });
});

describe("computeSchedule — link types with lags", () => {
  it("FS with lag delays the successor start", () => {
    const r = schedule([act("A", 5), act("B", 3)], [fs("A", "B", 4)]);
    expect(r.byId.get("B")!.es).toBe(9);
    expect(r.projectFinish).toBe(12);
  });

  it("SS with lag ties starts together", () => {
    const r = schedule(
      [act("A", 10), act("B", 5)],
      [{ predecessorId: "A", successorId: "B", type: "SS", lagDays: 3 }]
    );
    const b = r.byId.get("B")!;
    expect([b.es, b.ef]).toEqual([3, 8]);
    expect(b.totalFloat).toBe(2);
    expect(r.byId.get("A")!.isCritical).toBe(true);
  });

  it("FF with lag ties finishes together", () => {
    const r = schedule(
      [act("A", 10), act("B", 4)],
      [{ predecessorId: "A", successorId: "B", type: "FF", lagDays: 2 }]
    );
    const b = r.byId.get("B")!;
    expect([b.es, b.ef]).toEqual([8, 12]);
    expect(r.projectFinish).toBe(12);
    expect(r.byId.get("A")!.isCritical).toBe(true);
    expect(b.isCritical).toBe(true);
  });

  it("SF constrains successor finish from predecessor start", () => {
    const r = schedule(
      [act("A", 10), act("B", 4)],
      [{ predecessorId: "A", successorId: "B", type: "SF", lagDays: 6 }]
    );
    const b = r.byId.get("B")!;
    expect([b.es, b.ef]).toEqual([2, 6]);
    expect(b.totalFloat).toBe(4);
    expect(r.byId.get("A")!.totalFloat).toBe(0);
  });
});

describe("computeSchedule — cycle detection", () => {
  it("returns a structured error naming the activities in the cycle", () => {
    const r = computeSchedule(
      [act("A", 5), act("B", 3), act("C", 2)],
      [fs("A", "B"), fs("B", "A")],
      START,
      START
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.type).toBe("CYCLE");
      expect(r.error.activityCodes).toContain("A");
      expect(r.error.activityCodes).toContain("B");
      expect(r.error.activityCodes).not.toContain("C");
    }
  });
});

describe("computeSchedule — progress awareness", () => {
  it("fixes ES/EF from actuals on completed activities", () => {
    const r = schedule(
      [act("A", 5, { actualStart: day(1), actualFinish: day(7), percentComplete: 100 }), act("B", 3)],
      [fs("A", "B")],
      day(8)
    );
    const a = r.byId.get("A")!;
    expect([a.es, a.ef]).toEqual([1, 7]);
    expect(a.isComplete).toBe(true);
    expect(a.percentComplete).toBe(100);
    // successor starts after actual finish, but not before the data date
    expect(r.byId.get("B")!.es).toBe(8);
  });

  it("in-progress work cannot finish before the data date", () => {
    const r = schedule(
      [act("A", 10, { actualStart: day(0), percentComplete: 90 })],
      [],
      day(8)
    );
    const a = r.byId.get("A")!;
    // remaining = 10 × (1 − 0.9) = 1, resumed at the data date
    expect(a.remaining).toBeCloseTo(1);
    expect(a.ef).toBeCloseTo(9);
    expect(a.isInProgress).toBe(true);
  });

  it("remainingDays overrides the percent-derived remaining duration", () => {
    const r = schedule(
      [act("A", 10, { actualStart: day(0), percentComplete: 50, remainingDays: 12 })],
      [],
      day(4)
    );
    expect(r.byId.get("A")!.ef).toBe(16);
  });

  it("an in-progress slip moves the critical path", () => {
    const acts = [act("A", 10), act("B", 12), act("C", 5)];
    const links = [fs("A", "C"), fs("B", "C")];

    // baseline: B is the longer branch, hence critical
    const before = schedule(acts, links);
    expect(before.byId.get("B")!.isCritical).toBe(true);
    expect(before.byId.get("A")!.totalFloat).toBe(2);

    // A started but slipped: 14 days of work remain at data date 4
    const after = schedule(
      [
        act("A", 10, { actualStart: day(0), percentComplete: 20, remainingDays: 14 }),
        act("B", 12),
        act("C", 5),
      ],
      links,
      day(4)
    );
    expect(after.byId.get("A")!.ef).toBe(18);
    expect(after.byId.get("A")!.isCritical).toBe(true);
    expect(after.byId.get("B")!.isCritical).toBe(false);
    expect(after.byId.get("B")!.totalFloat).toBe(2);
    expect(after.projectFinish).toBe(23);
  });
});

describe("finishProbability", () => {
  it("returns the normal-approximation probability", () => {
    // sigma = 3, one sigma of slack → Φ(1) ≈ 0.8413
    expect(finishProbability([9], 100, 103)).toBeCloseTo(0.8413, 3);
    // symmetric: one sigma late → ≈ 0.1587
    expect(finishProbability([9], 103, 100)).toBeCloseTo(0.1587, 3);
    expect(finishProbability([9], 100, 100)).toBeCloseTo(0.5, 6);
  });

  it("degenerates to a step function with zero variance", () => {
    expect(finishProbability([], 100, 101)).toBe(1);
    expect(finishProbability([0], 100, 99)).toBe(0);
  });
});

describe("layoutNetwork", () => {
  it("layers a chain by longest path", () => {
    const l = layoutNetwork(
      [{ id: "A" }, { id: "B" }, { id: "C" }],
      [fs("A", "B"), fs("B", "C")]
    );
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    expect(byId.get("A")!.layer).toBe(0);
    expect(byId.get("B")!.layer).toBe(1);
    expect(byId.get("C")!.layer).toBe(2);
    expect(l.layerCount).toBe(3);
  });

  it("assigns distinct rows within a layer of a diamond", () => {
    const l = layoutNetwork(
      [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }],
      [fs("A", "B"), fs("A", "C"), fs("B", "D"), fs("C", "D")]
    );
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    expect(byId.get("B")!.layer).toBe(1);
    expect(byId.get("C")!.layer).toBe(1);
    expect(byId.get("B")!.row).not.toBe(byId.get("C")!.row);
    expect(byId.get("D")!.layer).toBe(2);
    expect(l.rowCount).toBe(2);
  });

  it("uses longest path when branches have unequal depth", () => {
    const l = layoutNetwork(
      [{ id: "A" }, { id: "B" }, { id: "C" }],
      [fs("A", "C"), fs("A", "B"), fs("B", "C")]
    );
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    expect(byId.get("C")!.layer).toBe(2);
  });
});
