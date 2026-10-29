"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { TextareaField } from "@/components/ui/textarea";
import { idle, submitted, type FormState } from "@/lib/forms";

type Profile = {
  address: string | null;
  gstNumber: string | null;
  qstNumber: string | null;
  invoicePrefix: string | null;
  paymentTermsDays: number;
  paymentInstructions: string | null;
};

/** What the company's invoices say: address, tax numbers (empty: no tax), numbering, terms. */
export function BillingProfileForm({
  action,
  profile,
  suggestedPrefix,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  profile: Profile;
  suggestedPrefix: string;
}) {
  const t = useTranslations("billingProfile");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <TextareaField
        id="bp-address"
        name="address"
        label={t("address")}
        rows={3}
        defaultValue={submitted(state, "address", profile.address)}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          id="bp-gst"
          name="gstNumber"
          label={t("gstNumber")}
          hint={t("taxHint")}
          placeholder="123456789 RT0001"
          defaultValue={submitted(state, "gstNumber", profile.gstNumber)}
          error={err("gstNumber")}
        />
        <Field
          id="bp-qst"
          name="qstNumber"
          label={t("qstNumber")}
          hint={t("taxHint")}
          placeholder="1234567890 TQ0001"
          defaultValue={submitted(state, "qstNumber", profile.qstNumber)}
          error={err("qstNumber")}
        />
        <Field
          id="bp-prefix"
          name="invoicePrefix"
          label={t("prefix")}
          hint={t("prefixHint", {
            example: `${profile.invoicePrefix || suggestedPrefix}-${new Date().getFullYear()}-0001`,
          })}
          placeholder={suggestedPrefix}
          defaultValue={submitted(state, "invoicePrefix", profile.invoicePrefix)}
          error={err("invoicePrefix")}
        />
        <Field
          id="bp-terms"
          name="paymentTermsDays"
          type="number"
          min={0}
          max={120}
          label={t("terms")}
          defaultValue={submitted(state, "paymentTermsDays", String(profile.paymentTermsDays))}
          error={err("paymentTermsDays")}
        />
      </div>
      <TextareaField
        id="bp-instructions"
        name="paymentInstructions"
        label={t("instructions")}
        placeholder={t("instructionsPlaceholder")}
        rows={2}
        defaultValue={submitted(state, "paymentInstructions", profile.paymentInstructions)}
      />
      <div>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}

/** Adds someone who already has an account as one of the company's invoicing managers. */
export function AddManagerForm({ action }: { action: (prev: FormState, data: FormData) => Promise<FormState> }) {
  const t = useTranslations("billingProfile");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <FormAlert state={state} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            id="manager-email"
            name="email"
            type="email"
            label={t("managerEmail")}
            hint={t("managerHint")}
            defaultValue={state.status === "success" ? "" : submitted(state, "email")}
            error={state.status === "error" && state.fields?.email ? tf("fields.email") : undefined}
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending} className="sm:mb-6">
          {t("addManager")}
        </Button>
      </div>
    </form>
  );
}
