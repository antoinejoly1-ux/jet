import type { Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import type { InboxFilter } from "@/lib/services/messages";
import { zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";

type Row = {
  id: string;
  ownerName: string;
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
    `/admin/messages${id ? `/${id}` : ""}${f === "open" ? "" : `?filter=${f}`}` as Route;

  return (
    <div className="flex min-h-0 flex-col">
      <nav aria-label={t("filters")} className="border-border flex gap-1 border-b p-2">
        {(["open", "mine", "resolved"] as const).map((f) => (
          <Link
            key={f}
            href={href(f)}
            aria-current={f === filter ? "page" : undefined}
            className="text-muted aria-[current=page]:bg-surface-muted aria-[current=page]:text-text rounded-md px-3 py-1.5 text-sm font-medium"
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
                className="hover:bg-surface-muted aria-[current=true]:bg-surface-muted flex flex-col gap-0.5 px-4 py-3"
              >
                <span className="flex items-center gap-2">
                  <span className={cn("min-w-0 flex-1 truncate", r.unread ? "font-semibold" : "font-medium")}>
                    {r.ownerName}
                  </span>
                  {r.lastMessageAt ? (
                    <span className="text-muted tabular shrink-0 text-xs">{when(r.lastMessageAt)}</span>
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
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const inboxFilter = (value: unknown): InboxFilter => (value === "mine" || value === "resolved" ? value : "open");
