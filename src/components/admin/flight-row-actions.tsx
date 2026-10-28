"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { formatHours } from "@/lib/format";
import { idle, type FormState } from "@/lib/forms";
import { parseDurationToMinutes } from "@/lib/validation/operations";

type Action = (s: FormState, d: FormData) => Promise<FormState>;

const asHm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Complete (enter flight time) or cancel a flight, inline in the list. The
 * flight time starts at the planned duration and shows how it was read
 * (« = 2 h 15 · débite Jean Tremblay »), so "2.15" can't quietly mean 2 h 09.
 */
export function FlightRowActions({
  id,
  status,
  complete,
  cancel,
  plannedMinutes,
  ownerName,
  startOpen = false,
}: {
  id: string;
  status: "scheduled" | "completed" | "cancelled";
  complete: Action;
  cancel: Action;
  /** Scheduled arrival minus departure, to start the flight time from. */
  plannedMinutes?: number | null;
  ownerName?: string | null;
  /** Flights waiting to be closed open with the flight-time field ready. */
  startOpen?: boolean;
}) {
  const t = useTranslations("flights");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [mode, setMode] = useState<"idle" | "complete" | "cancel">(startOpen ? "complete" : "idle");
  const [menu, setMenu] = useState(false);
  const [entered, setEntered] = useState(plannedMinutes ? asHm(plannedMinutes) : "");
  const minutes = parseDurationToMinutes(entered);
  const [completeState, completeAction, completing] = useActionState(async (s: FormState, d: FormData) => {
    const next = await complete(s, d);
    if (next.status === "success") setMode("idle");
    return next;
  }, idle);
  const [cancelState, cancelAction, cancelling] = useActionState(async (s: FormState, d: FormData) => {
    const next = await cancel(s, d);
    if (next.status === "success") setMode("idle");
    return next;
  }, idle);
  if (status === "cancelled") return null;

  if (mode === "complete")
    return (
      <form action={completeAction} className="flex flex-wrap items-center gap-2">
        <FormAlert state={completeState} />
        <label className="sr-only" htmlFor={`block-${id}`}>
          {t("flightTime")}
        </label>
        <input
          id={`block-${id}`}
          name="flightTime"
          autoFocus={!startOpen}
          required
          inputMode="text"
          autoComplete="off"
          value={entered}
          onChange={(e) => setEntered(e.target.value)}
          placeholder={t("flightTimePlaceholder")}
          aria-describedby={`block-${id}-read`}
          className="border-border bg-surface-muted/40 h-10 w-24 rounded-[12px] border px-3 text-sm"
        />
        <span id={`block-${id}-read`} aria-live="polite" className="text-muted min-w-24 text-xs">
          {entered
            ? minutes
              ? ownerName
                ? t("flightTimeReadOwner", { hours: formatHours(minutes, locale), owner: ownerName })
                : t("flightTimeRead", { hours: formatHours(minutes, locale) })
              : t("flightTimeInvalid")
            : null}
        </span>
        <input type="hidden" name="arrivesAt" value="" />
        <Button type="submit" size="sm" disabled={completing}>
          {t("complete")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
          {tc("cancel")}
        </Button>
      </form>
    );

  if (mode === "cancel")
    return (
      <form action={cancelAction} className="flex flex-wrap items-center gap-2">
        <FormAlert state={cancelState} />
        <label className="sr-only" htmlFor={`reason-${id}`}>
          {t("cancelReason")}
        </label>
        <input
          id={`reason-${id}`}
          name="reason"
          autoFocus
          placeholder={t("cancelReason")}
          className="border-border bg-surface h-9 w-48 rounded-md border px-2 text-sm"
        />
        <Button type="submit" size="sm" variant="danger" disabled={cancelling}>
          {status === "completed" ? t("cancelCompleted") : t("cancelFlight")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setMode("idle")}>
          {tc("cancel")}
        </Button>
      </form>
    );

  // The main action stays in view; editing and cancelling wait behind "⋯".
  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {status === "scheduled" ? (
        <Button type="button" size="sm" variant="secondary" onClick={() => setMode("complete")}>
          {t("complete")}
        </Button>
      ) : null}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={t("moreActions")}
        aria-expanded={menu}
        onClick={() => setMenu((m) => !m)}
      >
        <MoreHorizontal aria-hidden />
      </Button>
      {menu ? (
        <div className="border-border bg-surface shadow-float absolute top-full right-0 z-20 mt-1 flex w-52 flex-col rounded-[14px] border p-1">
          {status === "scheduled" ? (
            <Link
              href={`/admin/flights/${id}/edit`}
              className="hover:bg-surface-muted flex h-11 items-center rounded-[10px] px-3 text-sm"
            >
              {t("edit")}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              setMode("cancel");
            }}
            className="text-danger hover:bg-surface-muted flex h-11 items-center rounded-[10px] px-3 text-left text-sm"
          >
            {status === "completed" ? t("cancelCompleted") : t("cancelFlight")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
