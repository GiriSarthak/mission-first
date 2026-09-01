import { notFound, redirect } from "next/navigation";
import { NavLinks } from "@/components/shell/nav-links";
import { ProjectSelector } from "@/components/shell/project-selector";
import { Toolbar } from "@/components/shell/toolbar";
import { UserMenu } from "@/components/shell/user-menu";
import { formatDate } from "@/lib/format";
import { db } from "@/lib/db";
import { createProject } from "@/lib/actions/projects";
import {
  AuthorizationError,
  currentUser,
  getAuthorizedProject,
  visibleProjects,
} from "@/lib/auth/authorize";
import { can } from "@/lib/auth/roles";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect("/login");

  try {
    await getAuthorizedProject(id);
  } catch (err) {
    if (err instanceof AuthorizationError) notFound();
    throw err;
  }

  const [projects, current] = await Promise.all([
    visibleProjects(user),
    db.project.findUnique({ where: { id }, include: { vendorOrg: true } }),
  ]);
  if (!current) notFound();

  const isAgency = user.orgType === "AGENCY";

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 min-w-60 flex-col bg-mf-sidebar">
        <div className="px-4 pt-4 pb-3">
          <div className="text-[13px] font-semibold tracking-[0.18em] text-white">
            MISSION FIRST
          </div>
        </div>
        <div className="px-3">
          <ProjectSelector
            projects={projects.map((p) => ({
              id: p.id,
              name: p.name,
              tenderRef: p.tenderRef,
            }))}
            currentId={id}
            onCreateProject={
              can(user.role, "CREATE_PROJECT") ? createProject : undefined
            }
            portfolioHref={isAgency ? "/portfolio" : null}
          />
        </div>
        <NavLinks projectId={id} />
        <UserMenu name={user.name} orgName={user.orgName} role={user.role} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          projectName={current.name}
          dataDate={formatDate(new Date())}
          viewMode={isAgency ? "AGENCY" : "VENDOR"}
          counterpartyName={isAgency ? (current.vendorOrg?.name ?? null) : null}
        />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
