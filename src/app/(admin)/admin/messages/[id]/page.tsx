import { ArrowLeft, CheckCheck, RotateCcw } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AssignForm } from "@/components/messages/assign-form";
import { AutoRefresh } from "@/components/messages/auto-refresh";
import { Composer } from "@/components/messages/composer";
import { InboxList, inboxFilter } from "@/components/messages/inbox-list";
import { Thread } from "@/components/messages/thread";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { getStaffThread, listInbox, listResponders } from "@/lib/services/messages";
import { assignAction, replyAction, resolveAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("messages") };
}

export default async function ConversationPage({ params, searchParams }: PageProps<"/admin/messages/[id]">) {
  const viewer = await requireStaff();
  if (!can(viewer, "messages:reply")) redirect("/admin/messages");
  const { id } = await params;
  const filter = inboxFilter((await searchParams).filter);
  const t = await getTranslations("messages");
  const [{ conversation, messages }, rows, responders] = await Promise.all([
    getStaffThread(db, viewer, id).catch((e) => (e instanceof NotFoundError ? notFound() : Promise.reject(e))),
    listInbox(db, viewer, filter),
    listResponders(db, viewer),
  ]);
  const resolved = !!conversation.resolvedAt;

  return (
    <>
      <h1 className="sr-only">{t("conversationWith", { name: conversation.ownerName })}</h1>
      <AutoRefresh />
      <div className="border-border bg-surface grid overflow-hidden rounded-lg border lg:h-[calc(100dvh-10rem)] lg:grid-cols-[320px_1fr]">
        <div className="lg:border-border hidden min-h-0 lg:flex lg:flex-col lg:border-r">
          <InboxList rows={rows} filter={filter} activeId={id} />
        </div>
        <section aria-label={t("conversationLabel")} className="flex min-h-[70dvh] min-w-0 flex-col lg:min-h-0">
          <header className="border-border flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
            <Link
              href="/admin/messages"
              className="hover:bg-surface-muted -ml-2 inline-flex size-9 items-center justify-center rounded-md lg:hidden"
              aria-label={t("backToInbox")}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/admin/owners/${conversation.ownerId}`} className="font-semibold hover:underline">
                {conversation.ownerName}
              </Link>
              <p className="text-muted truncate text-xs">
                {[conversation.ownerEmail, conversation.ownerPhone].filter(Boolean).join(" · ")}
              </p>
            </div>
            <AssignForm
              action={assignAction.bind(null, id)}
              current={conversation.assignedToUserId ?? ""}
              people={responders.map((r) => ({
                id: r.id,
                name: r.id === viewer.id ? t("me", { name: r.name }) : r.name,
              }))}
            />
            <form action={resolveAction.bind(null, id, !resolved)}>
              <Button type="submit" size="sm" variant="secondary">
                {resolved ? <RotateCcw aria-hidden /> : <CheckCheck aria-hidden />}
                {resolved ? t("reopen") : t("resolve")}
              </Button>
            </form>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <Thread messages={messages} perspective="staff" empty={t("staffEmpty")} />
          </div>
          <div className="border-border border-t p-3 sm:p-4">
            <Composer action={replyAction.bind(null, id)} placeholder={t("staffPlaceholder")} />
          </div>
        </section>
      </div>
    </>
  );
}
