"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { resetProjectData, updateProjectSettings } from "@/lib/actions/settings";

export function SettingsForm({
  projectId,
  initial,
  models,
}: {
  projectId: string;
  initial: {
    name: string;
    tenderRef: string;
    agencyName: string;
    contractStart: string | null; // yyyy-mm-dd
    contractDurationDays: number | null;
  };
  models: { heavy: string; light: string };
}) {
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const field =
    "h-[26px] w-full border border-mf-border bg-white px-2 text-[12px] outline-none focus:border-mf-accent";
  const label = "mf-heading mb-1 block text-mf-text-2";

  return (
    <div className="grid max-w-2xl gap-3">
      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Project</span>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 p-3">
          <div className="col-span-2">
            <label className={label}>Project name</label>
            <input
              className={field}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Tender ref</label>
            <input
              className={`${field} font-mono text-[11px]`}
              value={form.tenderRef}
              onChange={(e) => setForm({ ...form, tenderRef: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Agency</label>
            <input
              className={field}
              value={form.agencyName}
              onChange={(e) => setForm({ ...form, agencyName: e.target.value })}
            />
          </div>
          <div>
            <label className={label}>Contract start</label>
            <input
              type="date"
              className={`${field} font-mono text-[11px]`}
              value={form.contractStart ?? ""}
              onChange={(e) =>
                setForm({ ...form, contractStart: e.target.value || null })
              }
            />
          </div>
          <div>
            <label className={label}>Contract duration (days)</label>
            <input
              type="number"
              className={`${field} text-right font-mono text-[11px]`}
              value={form.contractDurationDays ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  contractDurationDays: e.target.value ? Number(e.target.value) : null,
                })
              }
            />
          </div>
          <div className="col-span-2 flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await updateProjectSettings(projectId, form);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 1500);
                })
              }
              className="border border-mf-accent bg-mf-accent px-3 py-1 text-[11px] text-white hover:bg-mf-accent-hover disabled:opacity-50"
            >
              {pending ? "Saving…" : saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">AI Models</span>
        </div>
        <div className="grid grid-cols-2 gap-4 p-3">
          <div>
            <label className={label}>Heavy (extraction, insights)</label>
            <div className="mf-mono text-[11px] text-mf-text-1">{models.heavy}</div>
          </div>
          <div>
            <label className={label}>Light (classification, chat)</label>
            <div className="mf-mono text-[11px] text-mf-text-1">{models.light}</div>
          </div>
          <div className="col-span-2 text-[10px] text-mf-text-2">
            Configured via AI_MODEL_HEAVY / AI_MODEL_LIGHT in .env — read-only here.
          </div>
        </div>
      </div>

      <div className="mf-panel">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Danger Zone</span>
        </div>
        <div className="flex items-center gap-3 p-3">
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="border border-mf-critical px-3 py-1 text-[11px] text-mf-critical hover:bg-[#fdf1ef]"
          >
            Reset project data
          </button>
          <span className="text-[11px] text-mf-text-2">
            Removes documents, checklists, obligations, schedule, insights and chat.
            The project record itself is kept.
          </span>
        </div>
      </div>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="max-w-sm rounded-[2px] p-0">
          <DialogHeader className="border-b border-mf-border px-3 py-2">
            <DialogTitle className="mf-heading text-mf-text-1">
              Reset project data
            </DialogTitle>
          </DialogHeader>
          <div className="px-3 py-3 text-[12px] text-mf-text-1">
            This permanently deletes all documents, extracted pages, checklists,
            obligations, activities, insights, changesets and chat history for
            this project. The project record and its settings remain. Continue?
          </div>
          <div className="flex justify-end gap-2 border-t border-mf-border px-3 py-2">
            <button
              type="button"
              onClick={() => setConfirmReset(false)}
              className="border border-mf-border bg-white px-3 py-1 text-[11px] text-mf-text-1 hover:bg-mf-surface-1"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={resetting}
              onClick={async () => {
                setResetting(true);
                try {
                  await resetProjectData(projectId);
                  setConfirmReset(false);
                  router.refresh();
                } finally {
                  setResetting(false);
                }
              }}
              className="flex items-center gap-1 border border-mf-critical bg-mf-critical px-3 py-1 text-[11px] text-white hover:opacity-90 disabled:opacity-50"
            >
              {resetting && <Loader2 className="size-3 animate-spin" />}
              Reset everything
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
