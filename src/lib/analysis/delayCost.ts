/**
 * Time-delay vs cost analysis (Phase 2 brief, Part B).
 *
 * Pure, deterministic, unit-tested — the same rule as the schedule engine:
 * the LLM never computes these figures, it only narrates them.
 *
 * DELAY ATTRIBUTION — read this before changing anything here.
 * Properly attributing delay needs a day-by-day history of which activity was
 * critical and which obligations were outstanding on each of those days. We do
 * not keep that history yet (ScheduleSnapshot starts accumulating from first
 * use), so this module uses the approximation the brief specifies:
 *
 *   for each AGENCY obligation that is (a) currently overdue and (b) linked via
 *   blockingActivityId to an activity that is critical in the CURRENT engine
 *   run, take min(its overdue days, total delay days); sum those, then cap the
 *   sum at the total delay.
 *
 * Consequences worth knowing:
 *  - It reads the present, not the past. An obligation that blocked the job for
 *    a month but was fulfilled yesterday contributes nothing.
 *  - Two obligations blocking the same critical activity both count, so the cap
 *    (not the sum) is what keeps the total honest.
 *  - Attribution is an allocation, not a legal apportionment of blame. It is
 *    deliberately shown in neutral colours in the UI.
 *
 * When daily snapshots exist, replace `agencyAttributableDays` with a day-wise
 * walk over the history and delete this note.
 */

const MS_PER_DAY = 86_400_000;

export type DelayCostInputs = {
  contractStart: Date | null;
  contractDurationDays: number | null;
  contractValue: number | null;
  /** LD as a percentage of contract value per week of delay (GTC default 0.5). */
  ldWeeklyRatePct: number | null;
  /** Maximum LD as a percentage of contract value (GTC default 10). */
  ldCapPct: number | null;
  /** Forecast finish from the engine, as a day offset from contractStart. */
  forecastFinishOffset: number | null;
  /** Ids of activities the engine currently marks critical. */
  criticalActivityIds: string[];
  obligations: DelayCostObligation[];
  /** Defaults to today; injectable for tests. */
  today?: Date;
};

export type DelayCostObligation = {
  id: string;
  title: string;
  owedBy: string; // AGENCY | VENDOR
  status: string;
  dueOn: Date | null;
  receivedOn: Date | null;
  blockingActivityId: string | null;
};

export type DelayDriver = {
  obligationId: string;
  title: string;
  overdueDays: number;
  attributedDays: number;
  blockingActivityId: string;
};

export type DelayCostResult = {
  delayDays: number;
  contractFinishDate: Date | null;
  forecastFinishDate: Date | null;
  ldExposure: number;
  ldCapReached: boolean;
  ldCapAmount: number;
  agencyAttributableDays: number;
  vendorAttributableDays: number;
  agencyAttributablePct: number;
  /** The overdue agency obligations behind the agency share, largest first. */
  drivers: DelayDriver[];
};

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / MS_PER_DAY);
}

export function computeDelayCost(input: DelayCostInputs): DelayCostResult {
  const today = startOfDay(input.today ?? new Date());

  const contractFinishDate =
    input.contractStart && input.contractDurationDays != null
      ? new Date(input.contractStart.getTime() + input.contractDurationDays * MS_PER_DAY)
      : null;

  const forecastFinishDate =
    input.contractStart && input.forecastFinishOffset != null
      ? new Date(input.contractStart.getTime() + input.forecastFinishOffset * MS_PER_DAY)
      : null;

  const delayDays =
    contractFinishDate && forecastFinishDate
      ? Math.max(0, daysBetween(contractFinishDate, forecastFinishDate))
      : 0;

  // --- LD exposure -------------------------------------------------------
  // Missing LD terms or contract value are treated as zero exposure, never an
  // error: a project can legitimately be configured without them.
  const contractValue = input.contractValue ?? 0;
  const weeklyRate = input.ldWeeklyRatePct ?? 0;
  const capPct = input.ldCapPct ?? 0;
  const uncappedPct = (delayDays / 7) * weeklyRate;
  const appliedPct = Math.min(capPct, uncappedPct);
  const ldExposure = (appliedPct / 100) * contractValue;
  const ldCapAmount = (capPct / 100) * contractValue;
  const ldCapReached = delayDays > 0 && capPct > 0 && uncappedPct >= capPct;

  // --- Delay attribution (see the module note above) ---------------------
  const criticalIds = new Set(input.criticalActivityIds);
  const drivers: DelayDriver[] = [];

  if (delayDays > 0) {
    for (const o of input.obligations) {
      if (o.owedBy !== "AGENCY") continue;
      if (o.status === "WAIVED" || o.receivedOn) continue;
      if (!o.dueOn || !o.blockingActivityId) continue;
      if (!criticalIds.has(o.blockingActivityId)) continue;

      const overdueDays = daysBetween(o.dueOn, today);
      if (overdueDays <= 0) continue;

      drivers.push({
        obligationId: o.id,
        title: o.title,
        overdueDays,
        attributedDays: Math.min(overdueDays, delayDays),
        blockingActivityId: o.blockingActivityId,
      });
    }
  }

  drivers.sort((a, b) => b.attributedDays - a.attributedDays);

  const agencyAttributableDays = Math.min(
    delayDays,
    drivers.reduce((sum, d) => sum + d.attributedDays, 0)
  );
  const vendorAttributableDays = delayDays - agencyAttributableDays;
  const agencyAttributablePct =
    delayDays > 0 ? (agencyAttributableDays / delayDays) * 100 : 0;

  return {
    delayDays,
    contractFinishDate,
    forecastFinishDate,
    ldExposure,
    ldCapReached,
    ldCapAmount,
    agencyAttributableDays,
    vendorAttributableDays,
    agencyAttributablePct,
    drivers,
  };
}

/** ₹ formatting for the stat block: ₹2.27 Cr / ₹48.6 L / ₹9,500. */
export function formatInr(amount: number): string {
  if (!Number.isFinite(amount)) return "—";
  const abs = Math.abs(amount);
  if (abs >= 10_000_000) return `₹${(amount / 10_000_000).toFixed(2)} Cr`;
  if (abs >= 100_000) return `₹${(amount / 100_000).toFixed(2)} L`;
  return `₹${Math.round(amount).toLocaleString("en-IN")}`;
}
