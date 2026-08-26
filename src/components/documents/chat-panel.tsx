"use client";

import { useState } from "react";
import { SendHorizonal } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export type ChatMessageRow = {
  id: string;
  role: string;
  content: string;
  createdAt: string;
};

/**
 * Project chat shell (milestone 7). Milestone 8 wires uploads, changeset
 * review cards, and document Q&A into this panel.
 */
export function ChatPanel({
  messages,
}: {
  projectId: string;
  messages: ChatMessageRow[];
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex h-full flex-col border-l border-mf-border bg-white">
      <div className="mf-panel-header border-b border-mf-border">
        <span className="mf-panel-title">Project Chat</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-2">
        {messages.length === 0 ? (
          <div className="p-2 text-[11px] text-mf-text-2">
            Describe an upload (&ldquo;This is Volume 2 of the SECL Dipka tender —
            equipment specs&rdquo;) or ask a question about the stored documents.
            Answers cite page numbers. Available once AI processing is wired
            (milestone 8).
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="mb-2">
              <div className="mf-mono text-[9px] text-mf-neutral uppercase">
                {m.role === "USER" ? "You" : "Assistant"} ·{" "}
                {formatDateTime(m.createdAt)}
              </div>
              <div
                className={
                  m.role === "USER"
                    ? "border-l-2 border-mf-accent bg-[#f4f7fa] px-2 py-1 text-[12px] text-mf-text-1"
                    : "border-l-2 border-mf-border px-2 py-1 text-[12px] text-mf-text-1"
                }
              >
                {m.content}
              </div>
            </div>
          ))
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-mf-border p-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Chat arrives with AI processing (milestone 8)…"
          disabled
          className="h-[26px] min-w-0 flex-1 border border-mf-border bg-mf-surface-1 px-2 text-[12px] outline-none placeholder:text-mf-neutral disabled:cursor-not-allowed"
        />
        <button
          type="button"
          disabled
          className="flex h-[26px] items-center border border-mf-border bg-white px-2 text-mf-text-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizonal className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
