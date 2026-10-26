import { Clock, Phone } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import { Composer } from "@/components/messages/composer";
import { Thread } from "@/components/messages/thread";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getOwnerThread } from "@/lib/services/messages";
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
  const thread = await getOwnerThread(db, viewer, ownerId, { markRead: !viewer.viewingAs });
  const phone = env.OPERATOR_PHONE;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          phone ? (
            <Button asChild size="sm" variant="secondary">
              <a href={`tel:${phone.replace(/[^\d+]/g, "")}`}>
                <Phone aria-hidden />
                {t("callUs")}
              </a>
            </Button>
          ) : null
        }
      />
      <AutoRefresh />
      <section
        aria-label={t("conversationLabel")}
        className="border-border bg-surface flex min-h-[50dvh] flex-col rounded-lg border"
      >
        <div className="flex max-h-[50dvh] flex-1 flex-col overflow-y-auto sm:max-h-[60dvh]">
          <Thread messages={thread.messages} perspective="owner" empty={t("ownerEmpty")} />
        </div>
        <div className="border-border border-t p-3 sm:p-4">
          {viewer.viewingAs ? (
            <p className="text-muted text-sm">{t("viewAsReadOnly")}</p>
          ) : (
            <Composer action={sendOwnerMessageAction.bind(null, ownerId)} placeholder={t("ownerPlaceholder")} />
          )}
        </div>
      </section>
      <p className="text-muted mt-3 flex items-center gap-1.5 text-xs">
        <Clock className="size-3.5" aria-hidden />
        {t("responseHint")}
      </p>
    </>
  );
}
