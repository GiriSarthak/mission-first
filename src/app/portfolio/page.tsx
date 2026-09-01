import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser, visibleProjects } from "@/lib/auth/authorize";

export const dynamic = "force-dynamic";

/** Agency home. Full triage table lands in build step 6. */
export default async function PortfolioPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.orgType !== "AGENCY") redirect("/");

  const projects = await visibleProjects(user);

  return (
    <div className="p-3">
      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Portfolio — {user.orgName}</span>
          <span className="mf-mono ml-auto text-[10px] text-mf-text-2">
            {projects.length} project{projects.length === 1 ? "" : "s"}
          </span>
        </div>
        <table className="w-full border-collapse">
          <tbody>
            {projects.map((p) => (
              <tr key={p.id} className="h-[27px] border-b border-mf-gridline text-[11px]">
                <td className="px-2">
                  <Link
                    href={`/projects/${p.id}/dashboard`}
                    className="text-mf-accent hover:underline"
                  >
                    {p.name}
                  </Link>
                </td>
                <td className="mf-mono px-2 text-mf-text-2">{p.tenderRef}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
