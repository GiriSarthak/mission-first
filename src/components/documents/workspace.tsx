"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileUp,
  Loader2,
  RefreshCw,
  ScanLine,
  Trash2,
} from "lucide-react";
import { DOC_TYPES, type DocType } from "@/lib/enums";
import {
  deleteDocument,
  reprocessDocument,
  updateDocumentType,
} from "@/lib/actions/documents";
import { StatusBadge } from "@/components/status";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export type DocumentRow = {
  id: string;
  filename: string;
  docType: string;
  isScanned: boolean;
  pageCount: number;
  processingStatus: string;
  processingError: string | null;
  userDescription: string | null;
  uploadedAt: string;
};

type Findings = {
  checklistItems: Array<{ id: string; title: string; phase: string; status: string; page: number | null; clause: string | null }>;
  obligations: Array<{ id: string; title: string; status: string; page: number | null; clause: string | null }>;
  activities: Array<{ id: string; code: string; name: string; page: number | null }>;
  insights: Array<{ id: string; title: string; severity: string; page: number | null }>;
};

export function DocumentsWorkspace({
  projectId,
  initialDocuments,
  initialDocId,
  initialPage,
  canManage,
}: {
  projectId: string;
  initialDocuments: DocumentRow[];
  initialDocId: string | null;
  initialPage: number;
  /** agency roles read the bundle but cannot upload, reprocess or delete */
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [selectedId, setSelectedId] = useState<string | null>(initialDocId);
  const [page, setPage] = useState(initialPage);
  const [pageText, setPageText] = useState<string | null>(null);
  const [findings, setFindings] = useState<Findings | null>(null);
  const [viewerTab, setViewerTab] = useState<"TEXT" | "FINDINGS">("TEXT");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const selected = documents.find((d) => d.id === selectedId) ?? null;

  const refreshDocuments = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/documents`, { cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { documents: DocumentRow[] };
      setDocuments(data.documents);
    }
  }, [projectId]);

  // Poll the job runner every 3 s while anything is pending/processing.
  const hasWork = documents.some(
    (d) => d.processingStatus === "PENDING" || d.processingStatus === "PROCESSING"
  );
  useEffect(() => {
    if (!hasWork) return;
    const tick = async () => {
      await fetch("/api/jobs/run", { method: "POST" }).catch(() => {});
      await refreshDocuments();
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => clearInterval(t);
  }, [hasWork, refreshDocuments]);

  // Load viewer data when selection/page changes.
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/documents/${selectedId}?page=${page}`, {
        cache: "no-store",
      });
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as {
        pageText: string | null;
        findings: Findings;
      };
      if (!cancelled) {
        setPageText(data.pageText);
        setFindings(data.findings);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, page]);

  async function uploadFiles(files: FileList | File[]) {
    const pdfs = Array.from(files);
    if (pdfs.length === 0) return;
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    for (const f of pdfs) form.append("files", f);
    try {
      const res = await fetch(`/api/projects/${projectId}/upload`, {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setUploadError(data?.error ?? `Upload failed (${res.status})`);
      }
      await refreshDocuments();
    } finally {
      setUploading(false);
    }
  }

  if (selected) {
    return (
      <Viewer
        doc={selected}
        page={page}
        setPage={setPage}
        pageText={pageText}
        findings={findings}
        tab={viewerTab}
        setTab={setViewerTab}
        onBack={() => {
          setSelectedId(null);
          setPageText(null);
          setFindings(null);
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {/* Drop zone */}
      {canManage && (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void uploadFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInput.current?.click()}
        className={cn(
          "flex h-20 cursor-pointer items-center justify-center gap-2 border border-dashed text-[12px] transition-colors duration-100",
          dragOver
            ? "border-mf-accent bg-[#eef3f8] text-mf-accent"
            : "border-mf-border bg-white text-mf-text-2 hover:border-mf-accent"
        )}
      >
        {uploading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileUp className="size-4" />
        )}
        Drop tender PDFs here or click to browse (PDF only, multiple allowed)
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void uploadFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      )}
      {uploadError && (
        <div className="border border-mf-critical/40 bg-[#fdf1ef] px-2 py-1 text-[11px] text-mf-critical">
          {uploadError}
        </div>
      )}

      {/* Document table */}
      <div className="mf-panel min-h-0 flex-1">
        <div className="mf-panel-header">
          <span className="mf-panel-title">Documents</span>
          <span className="mf-mono ml-auto text-[10px] text-mf-text-2">
            {documents.length} file{documents.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[#fafbfc]">
              <tr className="h-7 border-b border-mf-border text-[10px] uppercase tracking-wide text-mf-text-2">
                <th className="px-2 text-left font-medium">Filename</th>
                <th className="w-28 px-2 text-left font-medium">Type</th>
                <th className="w-12 px-2 text-right font-medium">Pages</th>
                <th className="w-16 px-2 text-left font-medium">Scanned</th>
                <th className="w-24 px-2 text-left font-medium">Status</th>
                <th className="w-20 px-2 text-right font-medium">Uploaded</th>
                <th className="w-20 px-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.id} className="h-[27px] border-b border-mf-gridline text-[11px] hover:bg-[#f8f9fb]">
                  <td
                    className="cursor-pointer px-2 text-mf-accent hover:underline"
                    onClick={() => setSelectedId(d.id)}
                    title={d.userDescription ?? d.filename}
                  >
                    {d.filename}
                  </td>
                  <td className="px-2">
                    <select
                      value={d.docType}
                      disabled={!canManage}
                      onChange={(e) => {
                        const t = e.target.value as DocType;
                        setDocuments((prev) =>
                          prev.map((x) => (x.id === d.id ? { ...x, docType: t } : x))
                        );
                        startTransition(() => updateDocumentType(d.id, t));
                      }}
                      className="mf-mono h-5 w-full cursor-pointer border border-transparent bg-transparent text-[10px] text-mf-text-2 outline-none hover:border-mf-border focus:border-mf-accent"
                    >
                      {DOC_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="mf-mono px-2 text-right text-mf-text-2">{d.pageCount || "—"}</td>
                  <td className="px-2">
                    {d.isScanned && (
                      <span className="flex items-center gap-1 text-[10px] text-mf-warning">
                        <ScanLine className="size-3" /> scanned
                      </span>
                    )}
                  </td>
                  <td className="px-2">
                    <span className="flex items-center gap-1.5">
                      {(d.processingStatus === "PROCESSING" ||
                        d.processingStatus === "PENDING") && (
                        <Loader2 className="size-3 animate-spin text-mf-progress" />
                      )}
                      <StatusBadge status={d.processingStatus} />
                    </span>
                    {d.processingStatus === "FAILED" && d.processingError && (
                      <div className="max-w-40 truncate text-[10px] text-mf-critical" title={d.processingError}>
                        {d.processingError}
                      </div>
                    )}
                  </td>
                  <td className="mf-mono px-2 text-right whitespace-nowrap text-mf-text-2">
                    {formatDate(d.uploadedAt)}
                  </td>
                  <td className="px-2">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title="View"
                        onClick={() => setSelectedId(d.id)}
                        className="text-mf-text-2 hover:text-mf-accent"
                      >
                        <Eye className="size-3.5" />
                      </button>
                      {canManage && (
                      <button
                        type="button"
                        title="Reprocess"
                        onClick={() => {
                          setDocuments((prev) =>
                            prev.map((x) =>
                              x.id === d.id ? { ...x, processingStatus: "PENDING" } : x
                            )
                          );
                          startTransition(() => reprocessDocument(d.id));
                        }}
                        className="text-mf-text-2 hover:text-mf-accent"
                      >
                        <RefreshCw className="size-3.5" />
                      </button>
                      )}
                      {canManage && (
                      <button
                        type="button"
                        title="Delete"
                        onClick={() => {
                          if (!confirm(`Delete ${d.filename}? Extracted pages are removed; accepted items remain.`))
                            return;
                          setDocuments((prev) => prev.filter((x) => x.id !== d.id));
                          startTransition(() => deleteDocument(d.id));
                        }}
                        className="text-mf-text-2 hover:text-mf-critical"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-center text-[11px] text-mf-text-2">
                    {canManage
                      ? "No documents yet — drop the tender bundle above."
                      : "The vendor has not uploaded any documents yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Viewer({
  doc,
  page,
  setPage,
  pageText,
  findings,
  tab,
  setTab,
  onBack,
}: {
  doc: DocumentRow;
  page: number;
  setPage: (p: number) => void;
  pageText: string | null;
  findings: Findings | null;
  tab: "TEXT" | "FINDINGS";
  setTab: (t: "TEXT" | "FINDINGS") => void;
  onBack: () => void;
}) {
  const clamp = (p: number) => Math.max(1, Math.min(doc.pageCount || 1, p));
  const findingsCount = findings
    ? findings.checklistItems.length +
      findings.obligations.length +
      findings.activities.length +
      findings.insights.length
    : 0;

  return (
    <div className="flex h-full flex-col p-3">
      <div className="mf-panel min-h-0 flex-1">
        <div className="mf-panel-header">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-[11px] text-mf-accent hover:underline"
          >
            <ArrowLeft className="size-3.5" /> Documents
          </button>
          <span className="mf-panel-title ml-2 max-w-72 truncate normal-case tracking-normal">
            {doc.filename}
          </span>
          {doc.isScanned && (
            <span className="flex items-center gap-1 text-[10px] text-mf-warning">
              <ScanLine className="size-3" /> scanned
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex">
              {(
                [
                  ["TEXT", "Text"],
                  ["FINDINGS", `Findings (${findingsCount})`],
                ] as Array<["TEXT" | "FINDINGS", string]>
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "border-b-2 px-2 py-1 text-[11px]",
                    tab === t
                      ? "border-mf-accent font-medium text-mf-text-1"
                      : "border-transparent text-mf-text-2 hover:text-mf-text-1"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(clamp(page - 1))}
                className="border border-mf-border bg-white p-0.5 text-mf-text-2 hover:bg-mf-surface-1"
              >
                <ChevronLeft className="size-3" />
              </button>
              <span className="mf-mono text-[10px] text-mf-text-2">
                <input
                  type="number"
                  value={page}
                  onChange={(e) => setPage(clamp(Number(e.target.value) || 1))}
                  className="h-5 w-10 border border-mf-border bg-white px-1 text-right text-[10px] outline-none focus:border-mf-accent"
                />{" "}
                / {doc.pageCount || "?"}
              </span>
              <button
                type="button"
                onClick={() => setPage(clamp(page + 1))}
                className="border border-mf-border bg-white p-0.5 text-mf-text-2 hover:bg-mf-surface-1"
              >
                <ChevronRight className="size-3" />
              </button>
            </div>
          </div>
        </div>

        {tab === "TEXT" ? (
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {pageText ? (
              <pre className="font-mono text-[11px] leading-4.5 whitespace-pre-wrap text-mf-text-1">
                {pageText}
              </pre>
            ) : (
              <div className="text-[11px] text-mf-text-2">
                {doc.isScanned
                  ? "Scanned page — text arrives after AI transcription (process the document first)."
                  : doc.processingStatus === "DONE"
                    ? "No text extracted for this page."
                    : "Text appears once processing completes."}
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <FindingsList findings={findings} goToPage={(p) => { setTab("TEXT"); setPage(clamp(p)); }} />
          </div>
        )}
      </div>
    </div>
  );
}

function FindingsList({
  findings,
  goToPage,
}: {
  findings: Findings | null;
  goToPage: (page: number) => void;
}) {
  if (!findings) return <div className="p-3 text-[11px] text-mf-text-2">Loading…</div>;
  const sections: Array<[string, Array<{ id: string; label: string; meta: string; page: number | null }>]> = [
    [
      "Checklist items",
      findings.checklistItems.map((c) => ({
        id: c.id,
        label: c.title,
        meta: [c.phase, c.clause].filter(Boolean).join(" · "),
        page: c.page,
      })),
    ],
    [
      "Obligations",
      findings.obligations.map((o) => ({
        id: o.id,
        label: o.title,
        meta: o.clause ?? "",
        page: o.page,
      })),
    ],
    [
      "Activities",
      findings.activities.map((a) => ({
        id: a.id,
        label: `${a.code} — ${a.name}`,
        meta: "",
        page: a.page,
      })),
    ],
    [
      "Insights",
      findings.insights.map((i) => ({
        id: i.id,
        label: i.title,
        meta: i.severity,
        page: i.page,
      })),
    ],
  ];
  const total = sections.reduce((s, [, rows]) => s + rows.length, 0);
  if (total === 0)
    return (
      <div className="p-3 text-[11px] text-mf-text-2">
        Nothing extracted from this document yet.
      </div>
    );
  return (
    <div className="p-2">
      {sections.map(
        ([title, rows]) =>
          rows.length > 0 && (
            <div key={title} className="mb-2">
              <div className="mf-heading px-1 py-1 text-mf-text-2">
                {title} ({rows.length})
              </div>
              {rows.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 border-b border-mf-gridline px-1 py-1 text-[11px] last:border-0"
                >
                  <span className="min-w-0 flex-1 truncate text-mf-text-1">{r.label}</span>
                  {r.meta && (
                    <span className="mf-mono shrink-0 text-[10px] text-mf-text-2">{r.meta}</span>
                  )}
                  {r.page != null && (
                    <button
                      type="button"
                      onClick={() => goToPage(r.page!)}
                      className="mf-mono shrink-0 text-[10px] text-mf-accent hover:underline"
                    >
                      p.{r.page}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
      )}
    </div>
  );
}
