import { Clock } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ContactButtons } from "@/components/common/contact-buttons";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import { Composer } from "@/components/messages/composer";
import { Thread } from "@/components/messages/thread";
import { Alert } from "@/components/ui/alert";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getOwnerThread } from "@/lib/services/messages";
import { OPERATOR_TIME_ZONE } from "@/lib/time";
import { sendOwnerMessageAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("messages") };
}

export default async function OwnerMessagesPage({ searchParams }: PageProps<"/messages">) {
  const viewer = await requireAccess();
  const t = await getTranslations("messages");
  const sp = await searchParams;
  const ownerId = viewer.ownerIds.find((id) => id === sp.owner) ?? viewer.ownerIds[0];

  if (!ownerId)
    return (
      <>
        <PageHeader title={t("title")} />
        <Alert>{t("noOwner")}</Alert>
      </>
    );

  // Staff viewing as the owner see the thread but don't mark it read for them.
  // Office hours, operator time: 7 h to 19 h. Outside them, say when to expect an answer and how to reach someone now.
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { hour: "numeric", hourCycle: "h23", timeZone: OPERATOR_TIME_ZONE }).format(
      new Date(),
    ),
  );
  const open = hour >= 7 && hour < 19;
  const thread = await getOwnerThread(db, viewer, ownerId, { markRead: !viewer.viewingAs });

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} actions={<ContactButtons />} />
      <AutoRefresh />
      <section
        aria-label={t("conversationLabel")}
        className="bg-surface shadow-card flex min-h-[50dvh] flex-col rounded-lg border border-(--card-border)"
      >
        {/* Focusable so keyboard users can scroll the thread. */}
        <div
          tabIndex={0}
          className="focus-visible:ring-ring flex max-h-[50dvh] flex-1 flex-col overflow-y-auto outline-none focus-visible:ring-2 sm:max-h-[60dvh]"
        >
          <Thread messages={thread.messages} perspective="owner" empty={t("ownerEmpty")} />
        </div>
        <div className="border-border border-t p-3 sm:p-4">
          {viewer.viewingAs ? (
            <p className="text-muted text-sm">{t("viewAsReadOnly")}</p>
          ) : !can(viewer, "messages:send", { ownerIds: [ownerId] }) ? (
            <p className="text-muted text-sm">{t("readOnlyMember")}</p>
          ) : (
            <Composer action={sendOwnerMessageAction.bind(null, ownerId)} placeholder={t("ownerPlaceholder")} />
          )}
        </div>
      </section>
      <p className="text-muted mt-3 flex items-center gap-1.5 text-xs">
        <Clock className="size-3.5" aria-hidden />
        {open ? t("responseHint") : t("responseHintClosed")}
      </p>
    </>
  );
}
