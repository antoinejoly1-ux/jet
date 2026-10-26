import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import { InboxList, inboxFilter } from "@/components/messages/inbox-list";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listInbox } from "@/lib/services/messages";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("messages") };
}

export default async function AdminMessagesPage({ searchParams }: PageProps<"/admin/messages">) {
  const viewer = await requireStaff();
  const t = await getTranslations("messages");
  if (!can(viewer, "messages:reply"))
    return (
      <>
        <PageHeader title={t("inboxTitle")} />
        <EmptyState icon={Inbox} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </>
    );
  const filter = inboxFilter((await searchParams).filter);
  const rows = await listInbox(db, viewer, filter);
  return (
    <>
      <PageHeader title={t("inboxTitle")} description={t("inboxSubtitle")} />
      <AutoRefresh />
      <div className="border-border bg-surface grid overflow-hidden rounded-lg border lg:h-[70dvh] lg:grid-cols-[320px_1fr]">
        <div className="lg:border-border lg:border-r">
          <InboxList rows={rows} filter={filter} />
        </div>
        <div className="hidden items-center justify-center p-10 lg:flex">
          <EmptyState icon={Inbox} title={t("pickTitle")} body={t("pickBody")} />
        </div>
      </div>
    </>
  );
}
