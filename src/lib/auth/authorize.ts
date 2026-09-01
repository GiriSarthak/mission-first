import "server-only";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can, isAgencyRole, type Permission, type Role } from "@/lib/auth/roles";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  orgId: string;
  orgName: string;
  orgType: "AGENCY" | "VENDOR";
};

export class AuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthorizationError";
  }
}

/** The signed-in user, or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "",
    email: session.user.email ?? "",
    role: session.user.role,
    orgId: session.user.orgId,
    orgName: session.user.orgName,
    orgType: session.user.orgType,
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthorizationError("Not signed in.");
  return user;
}

export type AuthorizedProject = {
  user: SessionUser;
  project: {
    id: string;
    name: string;
    vendorOrgId: string | null;
    agencyOrgId: string | null;
  };
  /** Which side of the contract this user sits on for this project. */
  side: "VENDOR" | "AGENCY";
  can: (permission: Permission) => boolean;
};

/**
 * THE authorization boundary for project data.
 *
 * Every server action and route handler that reads or writes anything scoped
 * to a project calls this first, passing the projectId from the request. It
 * resolves the session, confirms the user's org is either the project's vendor
 * org or its agency org, and optionally checks a permission. A projectId in a
 * request body is never trusted without this call.
 */
export async function getAuthorizedProject(
  projectId: string,
  permission?: Permission
): Promise<AuthorizedProject> {
  const user = await requireUser();

  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, vendorOrgId: true, agencyOrgId: true },
  });
  if (!project) throw new AuthorizationError("Project not found.");

  const isVendorSide = !!project.vendorOrgId && project.vendorOrgId === user.orgId;
  const isAgencySide = !!project.agencyOrgId && project.agencyOrgId === user.orgId;
  if (!isVendorSide && !isAgencySide) {
    throw new AuthorizationError("You do not have access to this project.");
  }

  // An agency-role user must be on the agency side of this project (and the
  // reverse), so an org can never act with the wrong hat.
  const roleIsAgency = isAgencyRole(user.role);
  if (roleIsAgency !== isAgencySide) {
    throw new AuthorizationError("You do not have access to this project.");
  }

  if (permission && !can(user.role, permission)) {
    throw new AuthorizationError(
      `Your role (${user.role}) cannot perform this action.`
    );
  }

  return {
    user,
    project,
    side: isAgencySide ? "AGENCY" : "VENDOR",
    can: (p: Permission) => can(user.role, p),
  };
}

/** Same boundary, resolving the project from a child record. */
export async function authorizeByChecklistItem(
  itemId: string,
  permission?: Permission
): Promise<AuthorizedProject & { phaseId: string }> {
  const item = await db.checklistItem.findUnique({
    where: { id: itemId },
    select: { phaseId: true, phase: { select: { projectId: true } } },
  });
  if (!item) throw new AuthorizationError("Checklist item not found.");
  const ctx = await getAuthorizedProject(item.phase.projectId, permission);
  return { ...ctx, phaseId: item.phaseId };
}

export async function authorizeByObligation(
  obligationId: string,
  permission?: Permission
): Promise<AuthorizedProject> {
  const o = await db.obligation.findUnique({
    where: { id: obligationId },
    select: { projectId: true },
  });
  if (!o) throw new AuthorizationError("Obligation not found.");
  return getAuthorizedProject(o.projectId, permission);
}

export async function authorizeByActivity(
  activityId: string,
  permission?: Permission
): Promise<AuthorizedProject> {
  const a = await db.activity.findUnique({
    where: { id: activityId },
    select: { projectId: true },
  });
  if (!a) throw new AuthorizationError("Activity not found.");
  return getAuthorizedProject(a.projectId, permission);
}

export async function authorizeByDocument(
  documentId: string,
  permission?: Permission
): Promise<AuthorizedProject> {
  const d = await db.document.findUnique({
    where: { id: documentId },
    select: { projectId: true },
  });
  if (!d) throw new AuthorizationError("Document not found.");
  return getAuthorizedProject(d.projectId, permission);
}

/** Projects the signed-in user may see, newest first. */
export async function visibleProjects(user: SessionUser) {
  return db.project.findMany({
    where:
      user.orgType === "AGENCY"
        ? { agencyOrgId: user.orgId }
        : { vendorOrgId: user.orgId },
    orderBy: { createdAt: "asc" },
  });
}
