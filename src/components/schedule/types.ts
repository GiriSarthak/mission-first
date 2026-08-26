export type ActivityState = {
  id: string;
  code: string;
  name: string;
  wbsPath: string | null;
  optimistic: number | null;
  mostLikely: number;
  pessimistic: number | null;
  actualStart: string | null; // ISO
  actualFinish: string | null; // ISO
  percentComplete: number;
  remainingDays: number | null;
};

export type LinkState = {
  id: string;
  predecessorId: string;
  successorId: string;
  type: string;
  lagDays: number;
};
