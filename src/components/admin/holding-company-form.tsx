"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { TextareaField } from "@/components/ui/textarea";
import { idle, submitted, type FormState } from "@/lib/forms";

type Defaults = {
  legalName: string;
  registrationNumber: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

export function HoldingCompanyForm({
  action,
  defaults,
  cancelHref,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  defaults?: Defaults;
  cancelHref: string;
}) {
  const t = useTranslations("holdingCompanies");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (field: string) =>
    state.status === "error" && state.fields?.[field] ? tf(`fields.${field}`) : undefined;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5" noValidate>
      <FormAlert state={state} />
      <Field
        id="legalName"
        name="legalName"
        label={t("legalName")}
        defaultValue={submitted(state, "legalName", defaults?.legalName)}
        error={err("legalName")}
        required
        autoFocus
      />
      <Field
        id="registrationNumber"
        name="registrationNumber"
        label={t("registrationNumber")}
        hint={t("registrationNumberHint")}
        defaultValue={submitted(state, "registrationNumber", defaults?.registrationNumber)}
        error={err("registrationNumber")}
      />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          id="email"
          name="email"
          type="email"
          label={t("email")}
          defaultValue={submitted(state, "email", defaults?.email)}
          error={err("email")}
        />
        <Field
          id="phone"
          name="phone"
          type="tel"
          label={t("phone")}
          defaultValue={submitted(state, "phone", defaults?.phone)}
          error={err("phone")}
        />
      </div>
      <TextareaField
        id="notes"
        name="notes"
        label={t("notes")}
        defaultValue={submitted(state, "notes", defaults?.notes)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
        <Button asChild variant="ghost">
          <Link href={cancelHref as never}>{t("cancel")}</Link>
        </Button>
      </div>
    </form>
  );
}
