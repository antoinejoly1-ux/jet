import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { NotificationsPage } from "@/components/notifications/notifications-page";
import { requireStaff } from "@/lib/auth/session";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("notifications"))("title") };
}

export default async function Page() {
  return <NotificationsPage viewer={await requireStaff()} />;
}
