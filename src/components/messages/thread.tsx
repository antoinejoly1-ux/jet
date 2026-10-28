import { CalendarClock, PlaneTakeoff, Users } from "lucide-react";
import { Paperclip } from "lucide-react";
import Link from "next/link";
import type { MessageMeta } from "@/lib/services/flight-requests";
import { getFormatter, getTranslations } from "next-intl/server";
import { zonedDay } from "@/lib/time";
import { cn } from "@/lib/utils";
import { ScrollToEnd } from "./scroll-to-end";

export type ThreadMessage = {
  id: string;
  body: string;
  createdAt: Date;
  readAt: Date | null;
  senderUserId: string | null;
  senderName: string | null;
  fromStaff: boolean;
  attachmentFileId: string | null;
  attachmentName: string | null;
  meta?: MessageMeta | null;
};

/** A flight request as a card: the route large, the when and who below, and its state. */
async function FlightRequestCard({
  meta,
  messageId,
  perspective,
}: {
  meta: NonNullable<MessageMeta>;
  messageId: string;
  perspective: "owner" | "staff";
}) {
  const t = await getTranslations("requestFlight.card");
  const format = await getFormatter();
  const date = (d: string) =>
    format.dateTime(new Date(`${d}T12:00:00`), { weekday: "short", day: "numeric", month: "long" });
  const scheduled = meta.status === "scheduled";
  return (
    <div className="border-border bg-surface w-72 max-w-full rounded-2xl border p-4 text-left sm:w-80">
      <p className="eyebrow flex items-center gap-2">
        <PlaneTakeoff className="size-3.5" strokeWidth={1.5} aria-hidden />
        {t("title")} · {meta.registration}
      </p>
      <p className="mt-3 text-2xl font-light tracking-tight">
        {meta.from} <span className="text-muted">→</span> {meta.to}
      </p>
      <p className="text-muted mt-2 flex items-center gap-2 text-sm first-letter:uppercase">
        <CalendarClock className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
        <span className="first-letter:uppercase">
          {date(meta.date)} · {meta.time ?? t("flexible")}
        </span>
      </p>
      {meta.returnDate ? (
        <p className="text-muted mt-1 pl-5.5 text-sm">{t("return", { date: date(meta.returnDate) })}</p>
      ) : null}
      <p className="text-muted mt-1 flex items-center gap-2 text-sm">
        <Users className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden />
        {t("passengers", { count: meta.passengers })}
      </p>
      {meta.notes ? <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">{meta.notes}</p> : null}
      <div className="border-border mt-4 flex items-center justify-between gap-3 border-t pt-3">
        <span className={cn("text-xs font-medium", scheduled ? "text-success" : "text-warning")}>
          {scheduled ? t("scheduled") : t("requested")}
        </span>
        {perspective === "staff" && !scheduled ? (
          <Link
            href={`/admin/flights/new?request=${messageId}`}
            className="bg-primary text-primary-foreground rounded-full px-4 py-2 text-xs font-medium hover:opacity-90"
          >
            {t("plan")}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Messages as bubbles: the viewer's side on the right. Owners see "Dispatch"
 * plus the dispatcher's name; staff see who on the team wrote each reply.
 */
export async function Thread({
  messages,
  perspective,
  empty,
}: {
  messages: ThreadMessage[];
  /** Which side is "mine": the owner's messages, or the team's. */
  perspective: "owner" | "staff";
  empty: string;
}) {
  const t = await getTranslations("messages");
  const format = await getFormatter();
  const today = zonedDay(new Date());
  const lastMine = [...messages].reverse().find((m) => (perspective === "staff") === m.fromStaff);

  if (messages.length === 0)
    return <p className="text-muted flex flex-1 items-center justify-center px-6 py-16 text-center text-sm">{empty}</p>;

  const days = messages.map((m) => zonedDay(m.createdAt));
  return (
    <ol className="flex flex-col gap-2 px-4 py-4 sm:px-6" aria-label={t("threadLabel")}>
      {messages.map((m, i) => {
        const mine = (perspective === "staff") === m.fromStaff;
        const day = days[i]!;
        const separator = i === 0 || day !== days[i - 1];
        return (
          <li key={m.id} className="flex flex-col">
            {separator ? (
              <p className="text-muted my-3 text-center text-xs font-medium first-letter:uppercase">
                {day === today
                  ? t("today")
                  : format.dateTime(m.createdAt, { weekday: "long", day: "numeric", month: "long" })}
              </p>
            ) : null}
            <div
              className={cn(
                "flex max-w-[85%] flex-col gap-1 sm:max-w-[70%]",
                mine ? "items-end self-end" : "items-start",
              )}
            >
              {!mine ? (
                <span className="text-muted px-1 text-xs font-medium">
                  {m.fromStaff
                    ? perspective === "owner"
                      ? t("dispatchName", { name: m.senderName ?? "" })
                      : (m.senderName ?? t("team"))
                    : (m.senderName ?? "")}
                </span>
              ) : null}
              {m.meta?.kind === "flight_request" ? (
                <FlightRequestCard meta={m.meta} messageId={m.id} perspective={perspective} />
              ) : (
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap",
                    mine ? "bg-accent text-primary-foreground rounded-br-md" : "bg-surface-muted rounded-bl-md",
                  )}
                >
                  {m.body}
                  {m.attachmentFileId ? (
                    <a
                      href={`/files/${m.attachmentFileId}?inline=1`}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(
                        "mt-1 flex items-center gap-1.5 font-medium underline underline-offset-2",
                        !m.body && "mt-0",
                      )}
                    >
                      <Paperclip className="size-3.5 shrink-0" aria-hidden />
                      <span className="truncate">{m.attachmentName ?? t("attachment")}</span>
                    </a>
                  ) : null}
                </div>
              )}
              <span className="text-muted px-1 text-[11px]">
                {format.dateTime(m.createdAt, { hour: "numeric", minute: "2-digit" })}
                {mine && m.id === lastMine?.id && m.readAt ? ` · ${t("read")}` : ""}
              </span>
            </div>
          </li>
        );
      })}
      <ScrollToEnd marker={messages.at(-1)?.id ?? ""} />
    </ol>
  );
}
