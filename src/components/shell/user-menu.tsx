"use client";

import { LogOut } from "lucide-react";
import { logoutAction } from "@/lib/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/auth/roles";

export function UserMenu({
  name,
  orgName,
  role,
}: {
  name: string;
  orgName: string;
  role: Role;
}) {
  return (
    <div className="mt-auto border-t border-[#2c3b50] px-4 py-3">
      <div className="truncate text-[12px] text-white">{name}</div>
      <div className="mf-mono truncate text-[10px] text-[#8fa1b8]">{orgName}</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="mf-mono border border-[#3a4c63] px-1 py-px text-[9px] tracking-wide text-[#aeb9c8] uppercase">
          {ROLE_LABELS[role]}
        </span>
        <button
          type="button"
          onClick={() => logoutAction()}
          title="Sign out"
          className="ml-auto flex items-center gap-1 text-[10px] text-[#8fa1b8] transition-colors duration-100 hover:text-white"
        >
          <LogOut className="size-3" />
          Sign out
        </button>
      </div>
    </div>
  );
}
