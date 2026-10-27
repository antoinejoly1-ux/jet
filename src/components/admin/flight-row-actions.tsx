"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

type Action = (s: FormState, d: FormData) => Promise<FormState>;

/** Complete (enter flight time) or cancel a flight, inline in the list. */
export function FlightRowActions({
  id,
  status,
  complete,
  cancel,
}: {
  id: string;
  status: "scheduled" | "completed" | "cancelled";
  complete: Action;
  cancel: Action;
}) {
  const t = useTranslations("flights");
  const tc = useTranslations("common");
  const [mode, setMode] = useState<"idle" | "complete" | "cancel">("idle");
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
          autoFocus
          required
          inputMode="decimal"
          placeholder={t("flightTimePlaceholder")}
          className="border-border bg-surface h-9 w-28 rounded-md border px-2 text-sm"
        />
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

  return (
    <div className="flex flex-wrap items-center gap-1">
      {status === "scheduled" ? (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={() => setMode("complete")}>
            {t("complete")}
          </Button>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/admin/flights/${id}/edit`}>{t("edit")}</Link>
          </Button>
        </>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={() => setMode("cancel")}>
        {t("cancelFlight")}
      </Button>
    </div>
  );
}
