"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

export function AddShareForm({
  action,
  owners,
  remainingPercent,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  owners: { id: string; legalName: string }[];
  remainingPercent: number;
}) {
  const t = useTranslations("aircraft");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const form = useRef<HTMLFormElement>(null);
  const err = (field: string) =>
    state.status === "error" && state.fields?.[field] ? tf(`fields.${field}`) : undefined;

  // Clear the form after a share is added, ready for the next one.
  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);

  if (remainingPercent <= 0) return <p className="text-muted text-sm">{t("fullyAssigned")}</p>;

  return (
    <form ref={form} action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      <SelectField
        id="ownerId"
        name="ownerId"
        label={t("owner")}
        error={err("ownerId")}
        defaultValue={submitted(state, "ownerId")}
      >
        <option value="" disabled>
          {t("chooseOwner")}
        </option>
        {owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.legalName}
          </option>
        ))}
      </SelectField>
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="percent"
          name="percent"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max={remainingPercent}
          label={t("percent")}
          hint={t("percentHint", { remaining: remainingPercent })}
          defaultValue={submitted(state, "percent", String(remainingPercent))}
          error={err("percent")}
        />
        <Field
          id="annualHours"
          name="annualHours"
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          label={t("annualHours")}
          defaultValue={submitted(state, "annualHours")}
          error={err("annualHours")}
        />
      </div>
      <Field
        id="startsOn"
        name="startsOn"
        type="date"
        label={t("startsOn")}
        defaultValue={submitted(state, "startsOn", new Date().toISOString().slice(0, 10))}
        error={err("startsOn")}
      />
      <Button type="submit" disabled={pending} className="self-start">
        {t("addShare")}
      </Button>
    </form>
  );
}

/** "End" opens a small inline step asking for the end date, then confirms. */
export function EndShareForm({
  action,
  ownerName,
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  ownerName: string;
}) {
  const t = useTranslations("aircraft");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, idle);
  const [open, setOpen] = useState(false);

  if (!open)
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {t("endShare")}
      </Button>
    );

  return (
    <form
      action={formAction}
      role="group"
      aria-label={t("endConfirm", { name: ownerName })}
      className="flex flex-wrap items-center gap-2"
    >
      <FormAlert state={state} />
      <label className="text-sm font-medium" htmlFor={`end-${ownerName}`}>
        {t("endsOn")}
      </label>
      <input
        id={`end-${ownerName}`}
        type="date"
        name="endsOn"
        autoFocus
        defaultValue={submitted(state, "endsOn", new Date().toISOString().slice(0, 10))}
        className="border-border bg-surface h-9 rounded-md border px-2 text-sm"
      />
      <Button type="submit" variant="danger" size="sm" disabled={pending}>
        {tc("confirm")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
        {tc("cancel")}
      </Button>
    </form>
  );
}
