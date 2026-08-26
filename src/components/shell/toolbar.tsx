"use client";

import { usePathname } from "next/navigation";

const PAGE_NAMES: Record<string, string> = {
  dashboard: "Dashboard",
  documents: "Documents",
  settings: "Settings",
};

export function Toolbar({
  projectName,
  dataDate,
  children,
}: {
  projectName: string;
  dataDate: string;
  children?: React.ReactNode;
}) {
  const pathname = usePathname();
  const segment = pathname.split("/")[3] ?? "dashboard";
  const page = PAGE_NAMES[segment] ?? segment;

  return (
    <div className="flex h-9 min-h-9 items-center gap-3 border-b border-mf-border bg-mf-surface-1 px-3">
      <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
        <span className="truncate text-mf-text-2">{projectName}</span>
        <span className="text-mf-neutral">›</span>
        <span className="font-medium text-mf-text-1">{page}</span>
      </div>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-[11px] text-mf-text-2">
          Data date{" "}
          <span className="mf-mono text-mf-text-1">{dataDate}</span>
        </span>
        {children}
      </div>
    </div>
  );
}
