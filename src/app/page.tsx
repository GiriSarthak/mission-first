import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const first = await db.project.findFirst({ orderBy: { createdAt: "asc" } });
  if (first) redirect(`/projects/${first.id}/dashboard`);

  return (
    <div className="flex h-screen items-center justify-center bg-mf-surface-1">
      <div className="mf-panel w-96">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Mission First</span>
        </div>
        <div className="p-4 text-mf-text-2">
          No projects found. Run <span className="mf-mono">npm run db:seed</span>{" "}
          to create the demo project.
        </div>
      </div>
    </div>
  );
}
