import { Bell } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import type { listNotifications } from "@/lib/services/notification-center";
import { cn } from "@/lib/utils";
import { notificationValues } from "@/lib/notification-types";

type Item = Awaited<ReturnType<typeof listNotifications>>[number];

/** The bell's page: newest first, unread ones marked, each a link to what it's about. */
export async function NotificationList({ items, staff = false }: { items: Item[]; staff?: boolean }) {
  const t = await getTranslations("notifications");
  const format = await getFormatter();
  // The team's bell isn't about invoices and budgets: it says what it does carry.
  if (items.length === 0)
    return <EmptyState icon={Bell} title={t("emptyTitle")} body={t(staff ? "emptyBodyStaff" : "emptyBody")} />;
  return (
    <ul className="bg-surface divide-border border-border divide-y rounded-lg border">
      {items.map((n) => (
        <li key={n.id}>
          <Link
            href={n.href as Route}
            className={cn("hover:bg-surface-muted flex items-start gap-3 px-4 py-3", !n.readAt && "bg-accent/5")}
          >
            <span
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className={cn("block text-sm", !n.readAt && "font-semibold")}>
                {t(`types.${n.type}`, notificationValues(n.data))}
                {!n.readAt ? <span className="sr-only"> ({t("unread")})</span> : null}
              </span>
              <span className="text-muted text-xs">{format.relativeTime(n.createdAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
