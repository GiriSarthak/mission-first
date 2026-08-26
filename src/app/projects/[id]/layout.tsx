import { notFound } from "next/navigation";
import { NavLinks } from "@/components/shell/nav-links";
import { ProjectSelector } from "@/components/shell/project-selector";
import { Toolbar } from "@/components/shell/toolbar";
import { formatDate } from "@/lib/format";
import { db } from "@/lib/db";
import { createProject } from "@/lib/actions/projects";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projects = await db.project.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, tenderRef: true },
  });
  const current = projects.find((p) => p.id === id);
  if (!current) notFound();

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
            projects={projects}
            currentId={id}
            onCreateProject={createProject}
          />
        </div>
        <NavLinks projectId={id} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar projectName={current.name} dataDate={formatDate(new Date())} />
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
