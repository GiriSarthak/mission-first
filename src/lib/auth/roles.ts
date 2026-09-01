/**
 * Roles and the permission matrix (Phase 2 brief, Part A).
 *
 * This is the single source of truth for what each role may do. Server
 * actions and route handlers ask `can(role, "ACTION")`; the UI asks the same
 * question to disable controls. The UI never decides on its own — hiding a
 * button is presentation, `can()` on the server is the security boundary.
 */

export const ORG_TYPES = ["AGENCY", "VENDOR"] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ROLES = [
  "VENDOR_ADMIN",
  "VENDOR_MEMBER",
  "AGENCY_ADMIN",
  "AGENCY_REVIEWER",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  VENDOR_ADMIN: "Vendor Admin",
  VENDOR_MEMBER: "Vendor Member",
  AGENCY_ADMIN: "Agency Admin",
  AGENCY_REVIEWER: "Agency Reviewer",
};

export function orgTypeForRole(role: Role): OrgType {
  return role.startsWith("AGENCY") ? "AGENCY" : "VENDOR";
}

export function isAgencyRole(role: Role): boolean {
  return orgTypeForRole(role) === "AGENCY";
}

/** Every distinct permission checked anywhere in the app. */
export const PERMISSIONS = [
  "EDIT_PROJECT_DATA", // checklist items, activities, links
  "MANAGE_DOCUMENTS", // upload, reprocess, delete, run extraction, accept changesets
  "MARK_OBLIGATION_VENDOR_SIDE", // request, mark received, set escalation level
  "RESPOND_OBLIGATION_AGENCY_SIDE", // acknowledge + response note
  "APPROVE_AGENCY_ITEMS", // sign off checklist items flagged requiresAgencyApproval
  "VIEW_PROJECT", // dashboard, schedule, insights, time-cost panel
  "DRAFT_ESCALATION_LETTER", // agency roles may view existing drafts, not create
  "MANAGE_ORG_USERS",
  "CREATE_PROJECT",
  "VIEW_PORTFOLIO", // agency home across all projects under the org
  "REGENERATE_INSIGHTS",
  "EDIT_PROJECT_SETTINGS",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Permission>> = {
  VENDOR_ADMIN: new Set<Permission>([
    "EDIT_PROJECT_DATA",
    "MANAGE_DOCUMENTS",
    "MARK_OBLIGATION_VENDOR_SIDE",
    "VIEW_PROJECT",
    "DRAFT_ESCALATION_LETTER",
    "MANAGE_ORG_USERS",
    "CREATE_PROJECT",
    "REGENERATE_INSIGHTS",
    "EDIT_PROJECT_SETTINGS",
  ]),
  VENDOR_MEMBER: new Set<Permission>([
    "EDIT_PROJECT_DATA",
    "MANAGE_DOCUMENTS",
    "MARK_OBLIGATION_VENDOR_SIDE",
    "VIEW_PROJECT",
    "DRAFT_ESCALATION_LETTER",
    "REGENERATE_INSIGHTS",
  ]),
  AGENCY_ADMIN: new Set<Permission>([
    "RESPOND_OBLIGATION_AGENCY_SIDE",
    "APPROVE_AGENCY_ITEMS",
    "VIEW_PROJECT",
    "MANAGE_ORG_USERS",
    "VIEW_PORTFOLIO",
    "REGENERATE_INSIGHTS",
  ]),
  AGENCY_REVIEWER: new Set<Permission>([
    "RESPOND_OBLIGATION_AGENCY_SIDE",
    "VIEW_PROJECT",
    "VIEW_PORTFOLIO",
  ]),
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.has(permission) ?? false;
}

/** Where a user lands after login. */
export function homePathForRole(role: Role): string {
  return isAgencyRole(role) ? "/portfolio" : "/";
}
