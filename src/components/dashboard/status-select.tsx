"use client";

import { statusColor, statusLabel } from "@/components/status";

/** Dense inline status editor styled as a status badge. */
export function StatusSelect({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string;
  options: readonly string[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-block size-2 shrink-0" style={{ background: statusColor(value) }} />
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={
          disabled
            ? "h-5 max-w-24 cursor-default appearance-none border border-transparent bg-transparent pr-3 text-[11px] text-mf-text-2 outline-none"
            : "h-5 max-w-24 cursor-pointer appearance-none border border-transparent bg-transparent pr-3 text-[11px] text-mf-text-2 outline-none hover:border-mf-border hover:bg-white focus:border-mf-accent"
        }
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>
    </span>
  );
}
