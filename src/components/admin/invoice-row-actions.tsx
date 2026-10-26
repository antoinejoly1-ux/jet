"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

export function InvoiceRowActions({
  status,
  markPaid,
  voidAction,
}: {
  status: "issued" | "paid" | "void";
  markPaid: (s: FormState) => Promise<FormState>;
  voidAction: (s: FormState, d: FormData) => Promise<FormState>;
}) {
  const t = useTranslations("invoices");
  const tc = useTranslations("common");
  const [paidState, paidAction, paying] = useActionState(markPaid, idle);
  const [voidState, voidFormAction, voiding] = useActionState(voidAction, idle);
  const [askingReason, setAskingReason] = useState(false);
  if (status === "void") return null;

  if (askingReason)
    return (
      <form action={voidFormAction} className="flex flex-wrap items-center gap-2">
        <FormAlert state={voidState} />
        <label className="sr-only" htmlFor="void-reason">
          {t("voidReason")}
        </label>
        <input
          id="void-reason"
          name="reason"
          autoFocus
          required
          placeholder={t("voidReason")}
          className="border-border bg-surface h-9 w-56 rounded-md border px-2 text-sm"
        />
        <Button type="submit" size="sm" variant="danger" disabled={voiding}>
          {t("void")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAskingReason(false)}>
          {tc("cancel")}
        </Button>
      </form>
    );

  return (
    <div className="flex items-center gap-1">
      <FormAlert state={paidState} />
      {status === "issued" ? (
        <form action={paidAction}>
          <Button type="submit" size="sm" variant="ghost" disabled={paying}>
            {t("markPaid")}
          </Button>
        </form>
      ) : null}
      <Button type="button" size="sm" variant="ghost" onClick={() => setAskingReason(true)}>
        {t("void")}
      </Button>
    </div>
  );
}
