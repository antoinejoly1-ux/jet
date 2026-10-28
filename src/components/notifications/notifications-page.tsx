import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import type { Viewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listNotifications, markAllNotificationsRead } from "@/lib/services/notification-center";
import { NotificationList } from "./notification-list";

/** Shows the list as it was, then marks everything read: opening the bell is reading it. */
export async function NotificationsPage({ viewer, staff = false }: { viewer: Viewer; staff?: boolean }) {
  const t = await getTranslations("notifications");
  const items = await listNotifications(db, viewer);
  if (!viewer.viewingAs && items.some((n) => !n.readAt)) await markAllNotificationsRead(db, viewer);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <NotificationList items={items} staff={staff} />
    </>
  );
}
