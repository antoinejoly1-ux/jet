import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Says what will appear here and when, instead of leaving a blank area. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="border-border bg-surface flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
      <div className="bg-surface-muted text-muted mb-4 flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted mt-1 max-w-sm text-sm">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
