"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, submitted, type FormState } from "@/lib/forms";

type Action = (s: FormState, d: FormData) => Promise<FormState>;

/**
 * What finance does with an open invoice: record its payment (the day it came
 * in, an optional reference) or void it with a reason. A paid invoice is not
 * voided (that would be a refund or a credit); a voided one has no actions.
 */
export function InvoiceRowActions({
  status,
  today,
  markPaid,
  voidAction,
}: {
  status: "issued" | "paid" | "void";
  today: string;
  markPaid: Action;
  voidAction: Action;
}) {
  const t = useTranslations("invoices");
  const [paidState, paidAction, paying] = useActionState(markPaid, idle);
  const [voidState, voidFormAction, voiding] = useActionState(voidAction, idle);
  const [open, setOpen] = useState<"paid" | "void" | null>(null);
  if (status !== "issued") return null;

  if (open === "paid" && paidState.status !== "success")
    return (
      <form
        action={paidAction}
        className="border-border bg-surface-muted flex w-full flex-col gap-3 rounded-lg border p-3 sm:w-auto"
      >
        <FormAlert state={paidState} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field
            id="paid-on"
            name="paidOn"
            type="date"
            label={t("paidOn")}
            max={today}
            defaultValue={submitted(paidState, "paidOn", today)}
            required
          />
          <Field
            id="paid-reference"
            name="reference"
            label={t("paymentReference")}
            placeholder={t("paymentReferencePlaceholder")}
            defaultValue={submitted(paidState, "reference")}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={paying}>
            {t("recordPayment")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>
            {t("close")}
          </Button>
        </div>
      </form>
    );

  if (open === "void" && voidState.status !== "success")
    return (
      <form
        action={voidFormAction}
        className="border-border bg-surface-muted flex w-full flex-col gap-3 rounded-lg border p-3 sm:w-auto"
      >
        <FormAlert state={voidState} />
        <Field
          id="void-reason"
          name="reason"
          label={t("voidReason")}
          hint={t("voidHint")}
          autoFocus
          required
          defaultValue={submitted(voidState, "reason")}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" variant="danger" disabled={voiding}>
            {t("void")}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(null)}>
            {t("keepInvoice")}
          </Button>
        </div>
      </form>
    );

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen("paid")}>
        {t("markPaid")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen("void")}>
        {t("void")}
      </Button>
    </div>
  );
}
