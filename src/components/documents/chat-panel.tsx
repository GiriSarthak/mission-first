"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Paperclip, SendHorizonal, X } from "lucide-react";
import { sendChatMessage } from "@/lib/actions/chat";
import { applyChangeset } from "@/lib/actions/changesets";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChatMessageRow = {
  id: string;
  role: string;
  content: string;
  changesetId: string | null;
  createdAt: string;
};

type ChangesetItem = {
  id: string;
  entityType: string;
  accepted: boolean | null;
  payload: {
    title?: string;
    clause?: string | null;
    page?: number | null;
    phaseKey?: string | null;
    owedBy?: string | null;
    stipulatedDays?: number | null;
    durationDays?: number | null;
    code?: string;
    confidence?: number;
  };
};

type ChangesetData = {
  id: string;
  status: string;
  summary: string;
  items: ChangesetItem[];
};

export function ChatPanel({
  projectId,
  messages: initialMessages,
  canManage,
}: {
  projectId: string;
  messages: ChatMessageRow[];
  /** uploads and changeset acceptance are vendor-side actions */
  canManage: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const lastCount = useRef(initialMessages.length);

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/chat`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { messages: ChatMessageRow[] };
      setMessages(data.messages);
    }
  }, [projectId]);

  // poll for job-produced messages (acks, summaries, review cards)
  useEffect(() => {
    const t = setInterval(refresh, 3000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (messages.length !== lastCount.current) {
      lastCount.current = messages.length;
      scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
    }
  }, [messages]);

  async function submit() {
    const text = draft.trim();
    if (busy) return;
    if (files.length > 0) {
      setBusy(true);
      try {
        const form = new FormData();
        for (const f of files) form.append("files", f);
        form.append("description", text);
        const res = await fetch(`/api/projects/${projectId}/upload`, {
          method: "POST",
          body: form,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          alert(data?.error ?? `Upload failed (${res.status})`);
        }
        setFiles([]);
        setDraft("");
        await refresh();
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!text) return;
    setBusy(true);
    setDraft("");
    // optimistic user message while the answer is generated
    setMessages((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        role: "USER",
        content: text,
        changesetId: null,
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      await sendChatMessage(projectId, text);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col border-l border-mf-border bg-white">
      <div className="mf-panel-header border-b border-mf-border">
        <span className="mf-panel-title">Project Chat</span>
        {busy && <Loader2 className="ml-auto size-3 animate-spin text-mf-progress" />}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-auto p-2">
        {messages.length === 0 ? (
          <div className="p-2 text-[11px] text-mf-text-2">
            Attach a tender PDF and describe it (&ldquo;This is Volume 2 of the
            SECL Dipka tender — equipment specs&rdquo;), or ask a question about
            the stored documents. Answers cite page numbers.
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="mb-2">
              <div className="mf-mono text-[9px] uppercase text-mf-neutral">
                {m.role === "USER" ? "You" : "Assistant"} · {formatDateTime(m.createdAt)}
              </div>
              <div
                className={cn(
                  "border-l-2 px-2 py-1 text-[12px] whitespace-pre-wrap text-mf-text-1",
                  m.role === "USER" ? "border-mf-accent bg-[#f4f7fa]" : "border-mf-border"
                )}
              >
                {m.content}
              </div>
              {m.changesetId && (
                <ChangesetCard
                  changesetId={m.changesetId}
                  canApply={canManage}
                  onApplied={refresh}
                />
              )}
            </div>
          ))
        )}
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-mf-border px-2 py-1">
          {files.map((f, i) => (
            <span
              key={i}
              className="mf-mono flex items-center gap-1 border border-mf-border bg-mf-surface-1 px-1.5 py-0.5 text-[10px] text-mf-text-2"
            >
              {f.name}
              <button
                type="button"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="hover:text-mf-critical"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1 border-t border-mf-border p-2">
        {canManage && (
        <button
          type="button"
          title="Attach PDF(s)"
          onClick={() => fileInput.current?.click()}
          className="flex h-[26px] items-center border border-mf-border bg-white px-1.5 text-mf-text-2 hover:bg-mf-surface-1"
        >
          <Paperclip className="size-3.5" />
        </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
            e.target.value = "";
          }}
        />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && submit()}
          placeholder={
            files.length > 0
              ? "Describe the attached document(s)…"
              : "Ask about the tender documents…"
          }
          disabled={busy}
          className="h-[26px] min-w-0 flex-1 border border-mf-border bg-white px-2 text-[12px] outline-none placeholder:text-mf-neutral focus:border-mf-accent disabled:bg-mf-surface-1"
        />
        <button
          type="button"
          onClick={submit}
          disabled={busy || (files.length === 0 && !draft.trim())}
          className="flex h-[26px] items-center border border-mf-accent bg-mf-accent px-2 text-white hover:bg-mf-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizonal className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

const ENTITY_LABELS: Record<string, string> = {
  CHECKLIST_ITEM: "Checklist items",
  OBLIGATION: "Obligations",
  ACTIVITY: "Schedule activities",
  INSIGHT: "Insights",
};

function ChangesetCard({
  changesetId,
  canApply,
  onApplied,
}: {
  changesetId: string;
  canApply: boolean;
  onApplied: () => void;
}) {
  const [data, setData] = useState<ChangesetData | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/changesets/${changesetId}`, { cache: "no-store" });
      if (!res.ok || cancelled) return;
      const d = (await res.json()) as ChangesetData;
      if (!cancelled) {
        setData(d);
        setChecked(Object.fromEntries(d.items.map((i) => [i.id, true])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [changesetId]);

  if (!data) {
    return (
      <div className="mt-1 border border-mf-border bg-[#fafbfc] p-2 text-[11px] text-mf-text-2">
        Loading changeset…
      </div>
    );
  }

  const pending = data.status === "PROPOSED" && canApply;
  const groups = Object.entries(ENTITY_LABELS)
    .map(([type, label]) => ({
      type,
      label,
      items: data.items.filter((i) => i.entityType === type),
    }))
    .filter((g) => g.items.length > 0);
  const selectedCount = Object.values(checked).filter(Boolean).length;

  async function apply(ids: string[] | null) {
    setApplying(true);
    try {
      await applyChangeset(changesetId, ids);
      const res = await fetch(`/api/changesets/${changesetId}`, { cache: "no-store" });
      if (res.ok) setData((await res.json()) as ChangesetData);
      onApplied();
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mt-1 border border-mf-border bg-[#fafbfc]">
      <div className="flex items-center gap-2 border-b border-mf-border px-2 py-1">
        <span className="mf-heading text-mf-text-2">Proposed changes</span>
        <span
          className={cn(
            "mf-mono ml-auto text-[10px]",
            data.status === "PROPOSED" && "text-mf-warning",
            data.status === "ACCEPTED" && "text-mf-done",
            data.status === "PARTIAL" && "text-mf-progress",
            data.status === "REJECTED" && "text-mf-critical"
          )}
        >
          {data.status}
        </span>
      </div>
      <div className="max-h-72 overflow-auto">
        {groups.map((g) => (
          <div key={g.type}>
            <div className="mf-heading bg-white px-2 py-1 text-[10px] text-mf-text-2">
              {g.label} ({g.items.length})
            </div>
            {g.items.map((item) => (
              <label
                key={item.id}
                className={cn(
                  "flex items-start gap-2 border-b border-mf-gridline px-2 py-1 text-[11px] last:border-0",
                  pending && "cursor-pointer hover:bg-white",
                  !pending && item.accepted === false && "opacity-45"
                )}
              >
                {pending ? (
                  <input
                    type="checkbox"
                    checked={checked[item.id] ?? true}
                    onChange={(e) =>
                      setChecked((prev) => ({ ...prev, [item.id]: e.target.checked }))
                    }
                    className="mt-0.5 size-3 accent-[#2f5f8f]"
                  />
                ) : (
                  <span
                    className={cn(
                      "mf-mono mt-0.5 text-[9px]",
                      item.accepted ? "text-mf-done" : "text-mf-critical"
                    )}
                  >
                    {item.accepted ? "✓" : "✗"}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="text-mf-text-1">
                    {item.payload.code ? `${item.payload.code} — ` : ""}
                    {item.payload.title}
                  </span>
                  <span className="mf-mono ml-1 text-[9px] text-mf-text-2">
                    {[
                      item.payload.phaseKey ?? undefined,
                      item.payload.owedBy ? `owed by ${item.payload.owedBy}` : undefined,
                      item.payload.stipulatedDays
                        ? `${item.payload.stipulatedDays}d stipulated`
                        : undefined,
                      item.payload.durationDays
                        ? `${item.payload.durationDays}d`
                        : undefined,
                      item.payload.clause ?? undefined,
                      item.payload.page != null ? `p.${item.payload.page}` : undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ))}
      </div>
      {pending && (
        <div className="flex items-center gap-1 border-t border-mf-border px-2 py-1.5">
          <button
            type="button"
            disabled={applying}
            onClick={() => apply(null)}
            className="border border-mf-accent bg-mf-accent px-2 py-0.5 text-[11px] text-white hover:bg-mf-accent-hover disabled:opacity-50"
          >
            Accept all
          </button>
          <button
            type="button"
            disabled={applying || selectedCount === 0}
            onClick={() =>
              apply(Object.keys(checked).filter((id) => checked[id]))
            }
            className="border border-mf-border bg-white px-2 py-0.5 text-[11px] text-mf-text-1 hover:bg-mf-surface-1 disabled:opacity-50"
          >
            Accept selected ({selectedCount})
          </button>
          <button
            type="button"
            disabled={applying}
            onClick={() => apply([])}
            className="ml-auto border border-mf-border bg-white px-2 py-0.5 text-[11px] text-mf-critical hover:bg-mf-surface-1 disabled:opacity-50"
          >
            Reject
          </button>
          {applying && <Loader2 className="size-3 animate-spin text-mf-progress" />}
        </div>
      )}
    </div>
  );
}
