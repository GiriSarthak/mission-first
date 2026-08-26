"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { segment: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { segment: "documents", label: "Documents", icon: FileText },
  { segment: "settings", label: "Settings", icon: Settings },
] as const;

export function NavLinks({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav className="mt-4 flex flex-col">
      {NAV.map(({ segment, label, icon: Icon }) => {
        const href = `/projects/${projectId}/${segment}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={segment}
            href={href}
            className={cn(
              "flex h-8 items-center gap-2.5 border-l-2 px-4 text-[12px] transition-colors duration-100",
              active
                ? "border-mf-accent bg-[#243244] text-white"
                : "border-transparent text-[#aeb9c8] hover:bg-[#243244] hover:text-white"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
