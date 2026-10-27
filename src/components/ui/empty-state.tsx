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
    <div className="group bg-surface shadow-card flex flex-col items-center rounded-lg border border-(--card-border) px-6 py-14 text-center">
      <div className="bg-accent/10 text-accent mb-4 flex size-14 items-center justify-center rounded-full">
        <Icon className="size-6" aria-hidden data-anim="bounce" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="text-muted mt-1 max-w-sm text-sm">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
