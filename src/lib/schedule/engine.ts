/**
 * Deterministic CPM/PERT schedule engine (BRIEF §4).
 * Pure functions — no DB access, no AI. All math lives here.
 *
 * Time is measured in whole days offset from `projectStart` (day 0).
 */

export type LinkType = "FS" | "SS" | "FF" | "SF";

export type EngineActivity = {
  id: string;
  code: string;
  name: string;
  optimistic?: number | null;
  mostLikely: number;
  pessimistic?: number | null;
  actualStart?: Date | null;
  actualFinish?: Date | null;
  percentComplete?: number | null;
  remainingDays?: number | null;
};

export type EngineLink = {
  predecessorId: string;
  successorId: string;
  type: LinkType;
  lagDays: number;
};

export type ScheduledActivity = {
  id: string;
  code: string;
  name: string;
  duration: number;
  remaining: number;
  variance: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  freeFloat: number;
  isCritical: boolean;
  isComplete: boolean;
  isInProgress: boolean;
  percentComplete: number;
};

export type ScheduleResult =
  | {
      ok: true;
      activities: ScheduledActivity[];
      byId: Map<string, ScheduledActivity>;
      projectFinish: number; // day offset from projectStart
      criticalPath: string[]; // activity ids, in ES order
      criticalVariances: number[]; // variances of incomplete critical activities
    }
  | { ok: false; error: { type: "CYCLE"; activityCodes: string[] } };

const MS_PER_DAY = 86_400_000;
const EPS = 1e-6;

export function dayOffset(date: Date, projectStart: Date): number {
  return Math.round((date.getTime() - projectStart.getTime()) / MS_PER_DAY);
}

export function offsetToDate(offset: number, projectStart: Date): Date {
  return new Date(projectStart.getTime() + offset * MS_PER_DAY);
}

/**
 * PERT expected duration (o + 4m + p) / 6 and variance ((p − o) / 6)².
 * Falls back to `m` (variance 0) when o or p is absent.
 */
export function expectedDuration(
  o: number | null | undefined,
  m: number,
  p: number | null | undefined
): { expected: number; variance: number } {
  if (o == null || p == null) return { expected: m, variance: 0 };
  return {
    expected: (o + 4 * m + p) / 6,
    variance: ((p - o) / 6) ** 2,
  };
}

/**
 * Forward + backward pass over FS/SS/FF/SF links with lags.
 * Progress-aware:
 *  - actualStart fixes ES; actualFinish fixes EF (complete).
 *  - in-progress: remaining = remainingDays ?? duration × (1 − pct/100),
 *    and the remaining work cannot finish before dataDate.
 *  - unstarted work cannot start before dataDate.
 */
export function computeSchedule(
  activities: EngineActivity[],
  links: EngineLink[],
  projectStart: Date,
  dataDate: Date
): ScheduleResult {
  const ids = new Set(activities.map((a) => a.id));
  const validLinks = links.filter(
    (l) => ids.has(l.predecessorId) && ids.has(l.successorId)
  );

  // --- topological order (Kahn); detect cycles ---
  const succOf = new Map<string, EngineLink[]>();
  const predOf = new Map<string, EngineLink[]>();
  const indegree = new Map<string, number>();
  for (const a of activities) indegree.set(a.id, 0);
  for (const l of validLinks) {
    (succOf.get(l.predecessorId) ?? succOf.set(l.predecessorId, []).get(l.predecessorId)!).push(l);
    (predOf.get(l.successorId) ?? predOf.set(l.successorId, []).get(l.successorId)!).push(l);
    indegree.set(l.successorId, (indegree.get(l.successorId) ?? 0) + 1);
  }
  const queue = activities.filter((a) => (indegree.get(a.id) ?? 0) === 0).map((a) => a.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const l of succOf.get(id) ?? []) {
      const d = (indegree.get(l.successorId) ?? 0) - 1;
      indegree.set(l.successorId, d);
      if (d === 0) queue.push(l.successorId);
    }
  }
  if (order.length !== activities.length) {
    const inCycle = activities
      .filter((a) => !order.includes(a.id))
      .map((a) => a.code);
    return { ok: false, error: { type: "CYCLE", activityCodes: inCycle } };
  }

  const byInput = new Map(activities.map((a) => [a.id, a]));
  const dd = dayOffset(dataDate, projectStart);

  // --- per-activity durations & progress ---
  type Work = {
    duration: number;
    remaining: number;
    variance: number;
    fixedStart: number | null;
    fixedFinish: number | null;
  };
  const work = new Map<string, Work>();
  for (const a of activities) {
    const { expected, variance } = expectedDuration(a.optimistic, a.mostLikely, a.pessimistic);
    const pct = Math.min(100, Math.max(0, a.percentComplete ?? 0));
    const fixedStart = a.actualStart ? dayOffset(a.actualStart, projectStart) : null;
    const fixedFinish = a.actualFinish ? dayOffset(a.actualFinish, projectStart) : null;
    let remaining: number;
    if (fixedFinish != null) remaining = 0;
    else if (fixedStart != null)
      remaining = a.remainingDays ?? expected * (1 - pct / 100);
    else remaining = expected;
    work.set(a.id, { duration: expected, remaining, variance, fixedStart, fixedFinish });
  }

  // --- forward pass ---
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const w = work.get(id)!;
    let start = 0;
    for (const l of predOf.get(id) ?? []) {
      const pEs = es.get(l.predecessorId)!;
      const pEf = ef.get(l.predecessorId)!;
      const sDur = w.fixedFinish != null || w.fixedStart != null
        ? efMinusEs(w, dd)
        : w.duration;
      switch (l.type) {
        case "FS": start = Math.max(start, pEf + l.lagDays); break;
        case "SS": start = Math.max(start, pEs + l.lagDays); break;
        case "FF": start = Math.max(start, pEf + l.lagDays - sDur); break;
        case "SF": start = Math.max(start, pEs + l.lagDays - sDur); break;
      }
    }
    if (w.fixedFinish != null) {
      // complete; if actualStart is missing, back it out from the duration
      es.set(id, w.fixedStart ?? w.fixedFinish - w.duration);
      ef.set(id, w.fixedFinish);
    } else if (w.fixedStart != null) {
      // in progress: remaining work runs from the data date
      es.set(id, w.fixedStart);
      ef.set(id, Math.max(dd, w.fixedStart) + w.remaining);
    } else {
      const s = Math.max(start, dd); // unstarted work cannot start in the past
      es.set(id, s);
      ef.set(id, s + w.remaining);
    }
  }

  const projectFinish = Math.max(0, ...activities.map((a) => ef.get(a.id)!));

  // --- backward pass ---
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (const id of [...order].reverse()) {
    const w = work.get(id)!;
    const span = ef.get(id)! - es.get(id)!;
    let finish = projectFinish;
    for (const l of succOf.get(id) ?? []) {
      const sLs = ls.get(l.successorId)!;
      const sLf = lf.get(l.successorId)!;
      switch (l.type) {
        case "FS": finish = Math.min(finish, sLs - l.lagDays); break;
        case "SS": finish = Math.min(finish, sLs - l.lagDays + span); break;
        case "FF": finish = Math.min(finish, sLf - l.lagDays); break;
        case "SF": finish = Math.min(finish, sLf - l.lagDays + span); break;
      }
    }
    lf.set(id, finish);
    ls.set(id, finish - span);
  }

  // --- floats, criticality ---
  const results: ScheduledActivity[] = activities.map((a) => {
    const w = work.get(a.id)!;
    const aEs = es.get(a.id)!;
    const aEf = ef.get(a.id)!;
    const totalFloat = ls.get(a.id)! - aEs;
    let freeFloat = projectFinish - aEf;
    for (const l of succOf.get(a.id) ?? []) {
      const sEs = es.get(l.successorId)!;
      const sEf = ef.get(l.successorId)!;
      let slack: number;
      switch (l.type) {
        case "FS": slack = sEs - (aEf + l.lagDays); break;
        case "SS": slack = sEs - (aEs + l.lagDays); break;
        case "FF": slack = sEf - (aEf + l.lagDays); break;
        case "SF": slack = sEf - (aEs + l.lagDays); break;
      }
      freeFloat = Math.min(freeFloat, slack);
    }
    const isComplete = w.fixedFinish != null;
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      duration: w.duration,
      remaining: w.remaining,
      variance: w.variance,
      es: aEs,
      ef: aEf,
      ls: ls.get(a.id)!,
      lf: lf.get(a.id)!,
      totalFloat,
      freeFloat,
      isCritical: totalFloat <= EPS && !isComplete,
      isComplete,
      isInProgress: w.fixedStart != null && !isComplete,
      percentComplete: isComplete ? 100 : Math.min(100, Math.max(0, a.percentComplete ?? 0)),
    };
  });

  const byId = new Map(results.map((r) => [r.id, r]));
  const criticalPath = results
    .filter((r) => r.isCritical)
    .sort((x, y) => x.es - y.es || x.ef - y.ef)
    .map((r) => r.id);
  const criticalVariances = criticalPath.map((id) => byId.get(id)!.variance);

  // keep `byInput` referenced for future extension without lint noise
  void byInput;

  return { ok: true, activities: results, byId, projectFinish, criticalPath, criticalVariances };
}

function efMinusEs(w: { fixedStart: number | null; fixedFinish: number | null; remaining: number }, dd: number): number {
  if (w.fixedStart != null && w.fixedFinish != null) return w.fixedFinish - w.fixedStart;
  if (w.fixedStart != null) return Math.max(dd, w.fixedStart) + w.remaining - w.fixedStart;
  return w.remaining;
}

/**
 * P(project finishes on or before contractFinish), normal approximation over
 * the summed variances of the (incomplete) critical-path activities.
 */
export function finishProbability(
  criticalPathVariances: number[],
  projectFinish: number,
  contractFinish: number
): number {
  const sigma = Math.sqrt(criticalPathVariances.reduce((s, v) => s + v, 0));
  if (sigma < EPS) return projectFinish <= contractFinish ? 1 : 0;
  const z = (contractFinish - projectFinish) / sigma;
  return normalCdf(z);
}

/** Φ(z) via the Abramowitz–Stegun erf approximation (|err| < 1.5e-7). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const poly =
    t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = 1 - d * poly;
  return z >= 0 ? p : 1 - p;
}

// ---------------------------------------------------------------------------
// Network layout (activity-on-node) for the PERT diagram.
// ---------------------------------------------------------------------------

export type NetworkLayout = {
  nodes: Array<{ id: string; layer: number; row: number }>;
  layerCount: number;
  rowCount: number;
};

/**
 * Longest-path layering: layer = 1 + max(layer of predecessors); row within a
 * layer follows the mean row of predecessors so edges stay short. The renderer
 * only draws.
 */
export function layoutNetwork(
  activities: Array<{ id: string }>,
  links: EngineLink[]
): NetworkLayout {
  const ids = new Set(activities.map((a) => a.id));
  const valid = links.filter((l) => ids.has(l.predecessorId) && ids.has(l.successorId));
  const preds = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const succ = new Map<string, string[]>();
  for (const a of activities) indegree.set(a.id, 0);
  for (const l of valid) {
    (preds.get(l.successorId) ?? preds.set(l.successorId, []).get(l.successorId)!).push(l.predecessorId);
    (succ.get(l.predecessorId) ?? succ.set(l.predecessorId, []).get(l.predecessorId)!).push(l.successorId);
    indegree.set(l.successorId, (indegree.get(l.successorId) ?? 0) + 1);
  }

  const layer = new Map<string, number>();
  const queue = activities.filter((a) => (indegree.get(a.id) ?? 0) === 0).map((a) => a.id);
  for (const id of queue) layer.set(id, 0);
  const remaining = new Map(indegree);
  while (queue.length) {
    const id = queue.shift()!;
    for (const s of succ.get(id) ?? []) {
      layer.set(s, Math.max(layer.get(s) ?? 0, (layer.get(id) ?? 0) + 1));
      const d = (remaining.get(s) ?? 0) - 1;
      remaining.set(s, d);
      if (d === 0) queue.push(s);
    }
  }
  // nodes in cycles (shouldn't happen post-validation) fall back to layer 0
  for (const a of activities) if (!layer.has(a.id)) layer.set(a.id, 0);

  const byLayer = new Map<number, string[]>();
  for (const a of activities) {
    const l = layer.get(a.id)!;
    (byLayer.get(l) ?? byLayer.set(l, []).get(l)!).push(a.id);
  }

  const row = new Map<string, number>();
  const layerCount = Math.max(...[...byLayer.keys()], 0) + 1;
  let rowCount = 0;
  for (let l = 0; l < layerCount; l++) {
    const nodes = byLayer.get(l) ?? [];
    const keyed = nodes.map((id) => {
      const ps = preds.get(id) ?? [];
      const mean = ps.length
        ? ps.reduce((s, p) => s + (row.get(p) ?? 0), 0) / ps.length
        : Number.MAX_SAFE_INTEGER; // sourceless nodes sink to the bottom, stable by input order
      return { id, mean };
    });
    keyed.sort((a, b) => a.mean - b.mean);
    keyed.forEach((k, i) => row.set(k.id, i));
    rowCount = Math.max(rowCount, nodes.length);
  }

  return {
    nodes: activities.map((a) => ({ id: a.id, layer: layer.get(a.id)!, row: row.get(a.id)! })),
    layerCount,
    rowCount,
  };
}
