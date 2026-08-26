// Enum-like string unions mirrored by the Prisma schema comments.
// SQLite has no native enums, so these are Strings in the DB.

export const DOC_TYPES = [
  "TENDER_NIT",
  "GCC",
  "SCC",
  "SOW",
  "BOQ",
  "TECH_SPEC",
  "DRAWING",
  "CORRESPONDENCE",
  "OTHER",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const PROCESSING_STATUSES = ["PENDING", "PROCESSING", "DONE", "FAILED"] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const PHASE_KEYS = [
  "PRE_BID",
  "BID_SUBMISSION",
  "POST_AWARD",
  "SOW",
  "EXECUTION",
  "CLOSEOUT",
] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export const CHECKLIST_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "DONE",
  "BLOCKED",
  "NA",
] as const;
export type ChecklistStatus = (typeof CHECKLIST_STATUSES)[number];

export const OBLIGATION_STATUSES = [
  "PENDING",
  "REQUESTED",
  "OVERDUE",
  "RECEIVED",
  "WAIVED",
] as const;
export type ObligationStatus = (typeof OBLIGATION_STATUSES)[number];

export const OWED_BY = ["AGENCY", "VENDOR"] as const;
export type OwedBy = (typeof OWED_BY)[number];

export const LINK_TYPES = ["FS", "SS", "FF", "SF"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

export const SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const INSIGHT_CATEGORIES = [
  "SCHEDULE",
  "COMPLIANCE",
  "OBLIGATION",
  "DOCUMENT",
] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export const INSIGHT_STATUSES = ["OPEN", "DISMISSED", "DONE"] as const;
export type InsightStatus = (typeof INSIGHT_STATUSES)[number];

export const CHANGESET_STATUSES = ["PROPOSED", "ACCEPTED", "REJECTED", "PARTIAL"] as const;
export type ChangesetStatus = (typeof CHANGESET_STATUSES)[number];

export const CHANGESET_ENTITY_TYPES = [
  "CHECKLIST_ITEM",
  "OBLIGATION",
  "ACTIVITY",
  "INSIGHT",
] as const;
export type ChangesetEntityType = (typeof CHANGESET_ENTITY_TYPES)[number];

export const SOURCE_TYPES = ["AI", "MANUAL"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const JOB_STATUSES = ["PENDING", "RUNNING", "DONE", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TYPES = ["PROCESS_DOCUMENT", "GENERATE_INSIGHTS"] as const;
export type JobType = (typeof JOB_TYPES)[number];
