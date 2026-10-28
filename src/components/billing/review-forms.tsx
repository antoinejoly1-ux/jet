"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { TextareaField } from "@/components/ui/textarea";
import { idle, submitted, type FormState } from "@/lib/forms";

type Action = (prev: FormState, data: FormData) => Promise<FormState>;

/** Approve with the share billed (who flew), or send back to the pilot with a note. */
export function ReviewForms({
  approve,
  sendBack,
  shares,
  shareId,
  needsUsdRate = false,
}: {
  approve: Action;
  sendBack: Action;
  shares: { id: string; label: string }[];
  shareId: string | null;
  /** Some receipts are in USD: finance enters the rate that turns them into CAD. */
  needsUsdRate?: boolean;
}) {
  const t = useTranslations("flightReports");
  const tf = useTranslations("formErrors");
  const [approveState, approveAction, approving] = useActionState(approve, idle);
  const [returnState, returnAction, returning] = useActionState(sendBack, idle);
  const [returningOpen, setReturningOpen] = useState(returnState.status === "error");
  return (
    <div className="flex flex-col gap-6">
      <form action={approveAction} className="flex flex-col gap-4">
        <FormAlert state={approveState} />
        <SelectField
          id="review-share"
          name="shareId"
          label={t("billedTo")}
          defaultValue={submitted(approveState, "shareId", shareId)}
          required
        >
          <option value="" disabled>
            {t("chooseShare")}
          </option>
          {shares.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </SelectField>
        {needsUsdRate ? (
          <Field
            id="review-usd-rate"
            name="usdRate"
            label={t("usdRate")}
            hint={t("usdRateHint")}
            inputMode="decimal"
            placeholder="1,3850"
            defaultValue={submitted(approveState, "usdRate")}
            error={approveState.status === "error" && approveState.fields?.usdRate ? tf("fields.usdRate") : undefined}
            required
          />
        ) : null}
        <Button type="submit" disabled={approving || shares.length === 0}>
          {t("approve")}
        </Button>
      </form>
      {returningOpen ? (
        <form action={returnAction} className="border-border flex flex-col gap-3 border-t pt-6">
          <FormAlert state={returnState} />
          <TextareaField
            id="review-note"
            name="note"
            label={t("returnNote")}
            placeholder={t("returnNotePlaceholder")}
            rows={3}
            required
            defaultValue={submitted(returnState, "note")}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" disabled={returning}>
              {t("sendBack")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setReturningOpen(false)}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setReturningOpen(true)}>
          {t("sendBackOpen")}
        </Button>
      )}
    </div>
  );
}
