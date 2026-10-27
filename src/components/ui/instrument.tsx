import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A row of readings with hairlines between them and no boxes, like a panel of instruments. */
export function InstrumentStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl
      className={cn(
        "stagger divide-border border-border grid grid-cols-2 border-y lg:grid-cols-4 lg:divide-x [&>div]:py-7 lg:[&>div]:px-8 lg:[&>div:first-child]:pl-0",
        className,
      )}
    >
      {children}
    </dl>
  );
}

/** One reading: a small caption, a large light number, an optional line and a thin meter. */
export function Instrument({
  label,
  value,
  caption,
  meter,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  meter?: number | null;
}) {
  const percent = meter != null ? Math.min(100, Math.max(0, Math.round(meter * 100))) : null;
  return (
    <div className="min-w-0 pr-4">
      <dt className="eyebrow">{label}</dt>
      <dd className="tabular mt-3 text-3xl font-light tracking-tight sm:text-[2.6rem]">{value}</dd>
      {caption ? <dd className="text-muted mt-1 text-sm">{caption}</dd> : null}
      {percent != null ? (
        <dd className="mt-4">
          <div
            className="bg-border h-px w-full max-w-48"
            role="meter"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <div className="bg-accent h-px" style={{ width: `${percent}%` }} />
          </div>
        </dd>
      ) : null}
    </div>
  );
}
