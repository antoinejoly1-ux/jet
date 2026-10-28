import { Paperclip } from "lucide-react";
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
};

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
