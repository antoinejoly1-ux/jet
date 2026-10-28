"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

/** Issuing is final (numbered, sent to the owner): one click to ask, one to confirm. */
export function IssueInvoiceButton({ action }: { action: (prev: FormState, data: FormData) => Promise<FormState> }) {
  const t = useTranslations("invoiceDetail");
  const [state, formAction, pending] = useActionState(action, idle);
  const [asking, setAsking] = useState(false);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormAlert state={state} />
      {asking ? (
        <>
          <p className="text-sm">{t("issueConfirm")}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? t("issuing") : t("issueYes")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              {t("cancel")}
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
