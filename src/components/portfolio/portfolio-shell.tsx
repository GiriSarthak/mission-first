import { UserMenu } from "@/components/shell/user-menu";
import { formatInr } from "@/lib/analysis/delayCost";
import { formatDate } from "@/lib/format";
import type { Role } from "@/lib/auth/roles";

/** Agency-side shell: same sidebar language as the project shell, no project selector. */
export function PortfolioShell({
  userName,
  orgName,
  role,
  totals,
  children,
}: {
  userName: string;
  orgName: string;
  role: Role;
  totals: {
    projects: number;
    delayed: number;
    exposure: number;
    agencyDays: number;
  };
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 min-w-60 flex-col bg-mf-sidebar">
        <div className="px-4 pt-4 pb-3">
          <div className="text-[13px] font-semibold tracking-[0.18em] text-white">
            MISSION FIRST
          </div>
        </div>
        <div className="px-3">
          <div className="border border-[#2c3b50] bg-[#243244] px-2 py-1.5">
            <div className="truncate text-[12px] font-medium text-white">
              {orgName}
            </div>
            <div className="mf-mono truncate text-[10px] text-[#8fa1b8]">
              Agency portfolio
            </div>
          </div>
        </div>
        <nav className="mt-4 flex flex-col">
          <span className="flex h-8 items-center gap-2.5 border-l-2 border-mf-accent bg-[#243244] px-4 text-[12px] text-white">
            Portfolio
          </span>
        </nav>
        <UserMenu name={userName} orgName={orgName} role={role} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 min-h-9 items-center gap-3 border-b border-mf-border bg-mf-surface-1 px-3">
          <div className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <span className="truncate text-mf-text-2">{orgName}</span>
            <span className="text-mf-neutral">›</span>
            <span className="font-medium text-mf-text-1">Portfolio</span>
          </div>
          <div className="ml-auto flex items-center gap-4 text-[11px]">
            <Total label="Projects" value={String(totals.projects)} />
            <Total
              label="Delayed"
              value={`${totals.delayed} / ${totals.projects}`}
              tone={totals.delayed > 0 ? "warn" : undefined}
            />
            <Total
              label="Total LD exposure"
              value={formatInr(totals.exposure)}
              tone={totals.exposure > 0 ? "warn" : undefined}
            />
            <Total label="Agency-attributable" value={`${totals.agencyDays} d`} />
            <span className="text-[11px] text-mf-text-2">
              Data date{" "}
              <span className="mf-mono text-mf-text-1">
                {formatDate(new Date())}
              </span>
            </span>
          </div>
        </div>
        <main className="min-h-0 flex-1 overflow-auto">{children}</main>
      </div>
    </div>
  );
}

function Total({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warn";
}) {
  return (
    <span className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px] tracking-wide text-mf-text-2 uppercase">
        {label}
      </span>
      <span
        className={
          tone === "warn"
            ? "mf-mono text-[11px] font-medium text-mf-warning"
            : "mf-mono text-[11px] font-medium text-mf-text-1"
        }
      >
        {value}
      </span>
    </span>
  );
}
