import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { AuthorizationError, getAuthorizedProject } from "@/lib/auth/authorize";
import { modelFor } from "@/lib/ai/client";
import { SettingsForm } from "@/components/settings/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let ctx;
  try {
    ctx = await getAuthorizedProject(id, "VIEW_PROJECT");
  } catch (err) {
    if (err instanceof AuthorizationError) notFound();
    throw err;
  }
  const project = await db.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <div className="p-3">
      <SettingsForm
        projectId={id}
        initial={{
          name: project.name,
          tenderRef: project.tenderRef,
          agencyName: project.agencyName,
          contractStart: project.contractStart
            ? project.contractStart.toISOString().slice(0, 10)
            : null,
          contractDurationDays: project.contractDurationDays,
        }}
        models={{ heavy: modelFor("heavy"), light: modelFor("light") }}
        canEdit={ctx.can("EDIT_PROJECT_SETTINGS")}
      />
    </div>
  );
}
