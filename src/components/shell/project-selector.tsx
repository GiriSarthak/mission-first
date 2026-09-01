"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, LayoutGrid, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type ProjectSummary = {
  id: string;
  name: string;
  tenderRef: string;
};

export function ProjectSelector({
  projects,
  currentId,
  onCreateProject,
  portfolioHref,
}: {
  projects: ProjectSummary[];
  currentId: string;
  onCreateProject?: () => Promise<string | null>;
  portfolioHref?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const current = projects.find((p) => p.id === currentId);
  // keep the current sub-page when switching projects
  const subPage = pathname.split("/")[3] ?? "dashboard";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 border border-[#2c3b50] bg-[#243244] px-2 py-1.5 text-left outline-none hover:bg-[#2a3a4f] focus-visible:ring-1 focus-visible:ring-mf-accent">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium text-white">
            {current?.name ?? "Select project"}
          </div>
          <div className="mf-mono truncate text-[10px] text-[#8fa1b8]">
            {current?.tenderRef ?? "—"}
          </div>
        </div>
        <ChevronsUpDown className="size-3.5 shrink-0 text-[#8fa1b8]" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {projects.map((p) => (
          <DropdownMenuItem
            key={p.id}
            onSelect={() => router.push(`/projects/${p.id}/${subPage}`)}
          >
            <div className="min-w-0">
              <div className="truncate text-[12px]">{p.name}</div>
              <div className="mf-mono truncate text-[10px] text-mf-text-2">
                {p.tenderRef}
              </div>
            </div>
          </DropdownMenuItem>
        ))}
        {projects.length > 0 && (portfolioHref || onCreateProject) && (
          <DropdownMenuSeparator />
        )}
        {portfolioHref && (
          <DropdownMenuItem onSelect={() => router.push(portfolioHref)}>
            <LayoutGrid className="size-3.5" />
            <span className="text-[12px]">All projects (portfolio)</span>
          </DropdownMenuItem>
        )}
        {onCreateProject && (
          <DropdownMenuItem
            onSelect={async () => {
              const id = await onCreateProject();
              if (id) router.push(`/projects/${id}/settings`);
            }}
          >
            <Plus className="size-3.5" />
            <span className="text-[12px]">New project</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
