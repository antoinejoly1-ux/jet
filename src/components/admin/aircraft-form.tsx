"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

type Defaults = {
  registration: string;
  model: string;
  serialNumber: string | null;
  homeBase: string | null;
  status: string;
  icaoHex: string | null;
  holdingCompanyId: string | null;
};

export function AircraftForm({
  action,
  defaults,
  cancelHref,
  holdingCompanies,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  defaults?: Defaults;
  cancelHref: string;
  holdingCompanies: { id: string; legalName: string }[];
}) {
  const t = useTranslations("aircraft");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (field: string) =>
    state.status === "error" && state.fields?.[field] ? tf(`fields.${field}`) : undefined;

  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-5" noValidate>
      <FormAlert state={state} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          id="registration"
          name="registration"
          label={t("registration")}
          hint={t("registrationHint")}
          defaultValue={submitted(state, "registration", defaults?.registration)}
          error={err("registration")}
          autoCapitalize="characters"
          required
          autoFocus
        />
        <Field
          id="model"
          name="model"
          label={t("model")}
          defaultValue={submitted(state, "model", defaults?.model)}
          error={err("model")}
          required
        />
        <Field
          id="serialNumber"
          name="serialNumber"
          label={t("serialNumber")}
          defaultValue={submitted(state, "serialNumber", defaults?.serialNumber)}
          error={err("serialNumber")}
        />
        <Field
          id="homeBase"
          name="homeBase"
          label={t("homeBase")}
          hint={t("homeBaseHint")}
          defaultValue={submitted(state, "homeBase", defaults?.homeBase)}
          error={err("homeBase")}
          autoCapitalize="characters"
        />
        <Field
          id="icaoHex"
          name="icaoHex"
          label={t("icaoHex")}
          hint={t("icaoHexHint")}
          defaultValue={submitted(state, "icaoHex", defaults?.icaoHex)}
          error={err("icaoHex")}
        />
        <SelectField
          id="status"
          name="status"
          label={t("status")}
          defaultValue={submitted(state, "status", defaults?.status ?? "available")}
        >
          {(["available", "flying", "maintenance", "inactive"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </SelectField>
      </div>
      <SelectField
        id="holdingCompanyId"
        name="holdingCompanyId"
        label={t("holdingCompany")}
        defaultValue={submitted(state, "holdingCompanyId", defaults?.holdingCompanyId ?? "")}
        error={err("holdingCompanyId")}
      >
        <option value="">{t("noHoldingCompany")}</option>
        {holdingCompanies.map((c) => (
          <option key={c.id} value={c.id}>
            {c.legalName}
          </option>
        ))}
      </SelectField>
      <div className="flex gap-2">
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
