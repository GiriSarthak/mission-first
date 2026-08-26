import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { modelFor } from "@/lib/ai/client";
import { SettingsForm } from "@/components/settings/settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
      />
    </div>
  );
}
