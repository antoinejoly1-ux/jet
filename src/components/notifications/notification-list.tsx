import { Bell } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { EmptyState } from "@/components/ui/empty-state";
import type { listNotifications } from "@/lib/services/notification-center";
import { cn } from "@/lib/utils";

type Item = Awaited<ReturnType<typeof listNotifications>>[number];

/** The bell's page: newest first, unread ones marked, each a link to what it's about. */
export async function NotificationList({ items }: { items: Item[] }) {
  const t = await getTranslations("notifications");
  const format = await getFormatter();
  if (items.length === 0) return <EmptyState icon={Bell} title={t("emptyTitle")} body={t("emptyBody")} />;
  return (
    <ul className="bg-surface shadow-card divide-border divide-y rounded-lg border border-(--card-border)">
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
                {t(`types.${n.type}`, n.data)}
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
