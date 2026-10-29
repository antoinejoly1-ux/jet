"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, submitted, type FormState } from "@/lib/forms";

const PARTS = ["fuel", "engine", "propeller", "airframe", "avionics", "pilot"] as const;

/** A new hourly rate from a date, prefilled with the one in force. Dollars per flight hour. */
export function RateForm({
  action,
  defaults,
  today,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  defaults: Partial<Record<(typeof PARTS)[number], string>>;
  today: string;
}) {
  const t = useTranslations("rates");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <Field
        id="rate-from"
        name="effectiveFrom"
        type="date"
        label={t("effectiveFrom")}
        defaultValue={submitted(state, "effectiveFrom", today)}
        error={err("effectiveFrom")}
        required
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PARTS.map((p) => (
          <Field
            key={p}
            id={`rate-${p}`}
            name={p}
            label={t(`parts.${p}`)}
            hint={t("perHourHint")}
            inputMode="decimal"
            defaultValue={submitted(state, p, defaults[p] ?? "")}
            error={err(p)}
          />
        ))}
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </form>
  );
}
