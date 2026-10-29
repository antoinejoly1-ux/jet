"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

const COMPONENTS = ["engine", "propeller", "airframe", "avionics"] as const;
type Action = (prev: FormState, data: FormData) => Promise<FormState>;

/**
 * Maintenance paid out of one reserve: « payé par la réserve hélice ». Asks
 * once more before paying; when the reserve doesn't hold enough, the server
 * refuses and the form offers to pay anyway (the reserve goes negative).
 */
export function ReserveWorkForm({ action, today }: { action: Action; today: string }) {
  const t = useTranslations("reserves");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const [asking, setAsking] = useState(false);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const short = state.status === "error" && state.code === "reserve_insufficient";
  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      noValidate
      key={state.status === "success" ? "done" : "form"}
    >
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          id="rw-component"
          name="component"
          label={t("component")}
          defaultValue={submitted(state, "component", "engine")}
        >
          {COMPONENTS.map((c) => (
            <option key={c} value={c}>
              {t(`components.${c}`)}
            </option>
          ))}
        </SelectField>
        <Field
          id="rw-amount"
          name="amount"
          label={t("amount")}
          inputMode="decimal"
          defaultValue={submitted(state, "amount")}
          error={err("amount")}
          required
        />
        <Field
          id="rw-date"
          name="occurredOn"
          type="date"
          label={t("date")}
          defaultValue={submitted(state, "occurredOn", today)}
          error={err("occurredOn")}
          required
        />
        <Field
          id="rw-note"
          name="note"
          label={t("note")}
          placeholder={t("notePlaceholder")}
          defaultValue={submitted(state, "note")}
          error={err("note")}
          required
        />
      </div>
      {short ? (
        <label className="flex min-h-11 items-start gap-2.5 text-sm">
          <input type="checkbox" name="override" className="mt-1" />
          <span>{t("payAnyway")}</span>
        </label>
      ) : null}
      {asking ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t("payConfirm")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={pending}>
              {t("payYes")}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAsking(false)}>
              {t("notYet")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setAsking(true)}>
            {t("pay")}
          </Button>
        </div>
      )}
    </form>
  );
}

/** What a reserve is saving towards. */
export function ReserveTargetForm({ action }: { action: Action }) {
  const t = useTranslations("reserves");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  return (
    <form
      action={formAction}
      className="flex flex-col gap-4"
      noValidate
      key={state.status === "success" ? "done" : "form"}
    >
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          id="rt-component"
          name="component"
          label={t("component")}
          defaultValue={submitted(state, "component", "propeller")}
        >
          {COMPONENTS.map((c) => (
            <option key={c} value={c}>
              {t(`components.${c}`)}
            </option>
          ))}
        </SelectField>
        <Field
          id="rt-target"
          name="target"
          label={t("target")}
          inputMode="decimal"
          placeholder="200 000"
          defaultValue={submitted(state, "target")}
          error={err("target")}
          required
        />
      </div>
      <Field
        id="rt-label"
        name="label"
        label={t("targetLabel")}
        placeholder={t("targetLabelPlaceholder")}
        defaultValue={submitted(state, "label")}
      />
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("setTarget")}
        </Button>
      </div>
    </form>
  );
}
