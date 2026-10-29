"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

/**
 * Issuing is final (numbered, sent to the owner): one click to ask, one to
 * confirm. A registered company can mark an international flight zero-rated
 * (no GST/QST) here; taxed by default.
 */
export function IssueInvoiceButton({
  action,
  taxable,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  taxable: boolean;
}) {
  const t = useTranslations("invoiceDetail");
  const [state, formAction, pending] = useActionState(action, idle);
  const [asking, setAsking] = useState(false);
  const [zeroRated, setZeroRated] = useState(false);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormAlert state={state} />
      {taxable ? (
        <label className="flex min-h-11 items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            name="zeroRated"
            checked={zeroRated}
            onChange={(e) => setZeroRated(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="font-medium">{t("zeroRated")}</span>
            <span className="text-muted block text-xs">{t("zeroRatedHint")}</span>
          </span>
        </label>
      ) : null}
      {asking ? (
        <>
          <p className="text-sm">{zeroRated ? t("issueConfirmZeroRated") : t("issueConfirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? t("issuing") : t("issueYes")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              {t("notYet")}
            </Button>
          </div>
        </>
      ) : (
        <div>
          <Button type="button" onClick={() => setAsking(true)}>
            {t("issue")}
          </Button>
        </div>
      )}
    </form>
  );
}
