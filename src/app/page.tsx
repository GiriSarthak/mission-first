import { redirect } from "next/navigation";
import { currentUser, visibleProjects } from "@/lib/auth/authorize";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.orgType === "AGENCY") redirect("/portfolio");

  const projects = await visibleProjects(user);
  if (projects.length > 0) redirect(`/projects/${projects[0].id}/dashboard`);

  return (
    <div className="flex h-screen items-center justify-center bg-mf-surface-1">
      <div className="mf-panel w-96">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Mission First</span>
        </div>
        <div className="p-4 text-[12px] text-mf-text-2">
          No projects yet for {user.orgName}. Run{" "}
          <span className="mf-mono">npm run db:seed</span> to create the demo
          projects.
        </div>
      </div>
    </div>
  );
}
