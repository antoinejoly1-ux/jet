import type { Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Avatar } from "@/components/ui/avatar";
import type { InboxFilter } from "@/lib/services/messages";
import { zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  ownerName: string;
  ownerImage?: string | null;
  assignedToName: string | null;
  lastMessageAt: Date | string | null;
  lastBody: string | null;
  unread: number;
};

/** The conversation list: filter tabs, then one row per owner with the latest line. */
export async function InboxList({ rows, filter, activeId }: { rows: Row[]; filter: InboxFilter; activeId?: string }) {
  const t = await getTranslations("messages");
  const format = await getFormatter();
  const today = zonedDay(new Date());
  const when = (value: Date | string) => {
    const d = new Date(value);
    return zonedDay(d) === today
      ? format.dateTime(d, { hour: "numeric", minute: "2-digit" })
      : format.dateTime(d, { day: "numeric", month: "short" });
  };
  const href = (f: InboxFilter, id?: string) =>
    `/admin/messages${id ? `/${id}` : ""}${f === "waiting" ? "" : `?filter=${f}`}` as Route;

  return (
    <div className="flex min-h-0 flex-col">
      <nav aria-label={t("filters")} className="border-border flex gap-1 overflow-x-auto border-b p-2">
        {(["waiting", "open", "mine", "resolved"] as const).map((f) => (
          <Link
            key={f}
            href={href(f)}
            aria-current={f === filter ? "page" : undefined}
            className="text-muted aria-[current=page]:bg-surface-muted aria-[current=page]:text-text shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap"
          >
            {t(`filterNames.${f}`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <p className="text-muted px-4 py-10 text-center text-sm">{t(`emptyFilter.${filter}`)}</p>
      ) : (
        <ul className="divide-border min-h-0 flex-1 divide-y overflow-y-auto">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={href(filter, r.id)}
                aria-current={r.id === activeId ? "true" : undefined}
                className="hover:bg-surface-muted aria-[current=true]:bg-surface-muted flex items-start gap-3 px-4 py-3"
              >
                <Avatar name={r.ownerName} image={r.ownerImage} className="mt-0.5 size-9" />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className={cn("min-w-0 flex-1 truncate", r.unread ? "font-semibold" : "font-medium")}>
                      {r.ownerName}
                    </span>
                    {r.lastMessageAt ? (
                      <span
                        className={cn(
                          "tabular shrink-0 text-xs",
                          filter === "waiting" ? "text-warning font-medium" : "text-muted",
                        )}
                      >
                        {filter === "waiting" ? format.relativeTime(new Date(r.lastMessageAt)) : when(r.lastMessageAt)}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("min-w-0 flex-1 truncate text-sm", r.unread ? "text-text" : "text-muted")}>
                      {r.lastBody || t("attachment")}
                    </span>
                    {r.unread ? (
                      <span className="bg-accent text-primary-foreground tabular rounded-full px-1.5 text-[11px] leading-5 font-semibold">
                        {r.unread}
                        <span className="sr-only"> {t("unreadSuffix")}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className="text-muted text-xs">{r.assignedToName ?? t("unassigned")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const inboxFilter = (value: unknown): InboxFilter =>
  value === "open" || value === "mine" || value === "resolved" ? value : "waiting";
