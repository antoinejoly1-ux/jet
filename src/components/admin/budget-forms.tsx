"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";
import { localeTag } from "@/lib/locale";

type Row = { categoryId: string; name: string; plannedCents: number; spent: string; remaining: string; over: boolean };

/** Amounts shown in the user's own number format ("105 000,00" in French); the server reads both. */
const asInput = (cents: number, locale: string) =>
  cents
    ? new Intl.NumberFormat(localeTag(locale), {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(cents / 100)
    : "";

/** Planned amounts per category, side by side with what has actually been spent. */
export function BudgetEditor({
  action,
  rows,
  published,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  rows: Row[];
  published: boolean;
}) {
  const t = useTranslations("budgets");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.status === "success" ? (
        <p role="status" className="text-success text-sm font-medium">
          {t("saved")}
        </p>
      ) : (
        <FormAlert state={state} />
      )}
      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="bg-surface-muted text-muted text-xs font-semibold">
            <tr>
              <th scope="col" className="px-4 py-2.5 text-left">
                {t("category")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                {t("planned")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                {t("spent")}
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                {t("remaining")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-border bg-surface divide-y">
            {rows.map((r) => (
              <tr key={r.categoryId}>
                <th scope="row" className="px-4 py-2 text-left font-medium">
                  <label htmlFor={`p-${r.categoryId}`}>{r.name}</label>
                </th>
                <td className="px-4 py-2 text-right">
                  <input
                    id={`p-${r.categoryId}`}
                    name={`planned:${r.categoryId}`}
                    inputMode="decimal"
                    defaultValue={submitted(state, `planned:${r.categoryId}`, asInput(r.plannedCents, locale))}
                    placeholder="0,00"
                    className="border-border bg-surface tabular h-9 w-36 rounded-md border px-2 text-right"
                  />
                </td>
                <td className="tabular px-4 py-2 text-right">{r.spent}</td>
                <td className={`tabular px-4 py-2 text-right font-medium ${r.over ? "text-danger" : ""}`}>
                  {r.remaining}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending}>
          {published ? t("saveChanges") : t("saveDraft")}
        </Button>
        {!published ? (
          <Button type="submit" name="intent" value="publish" disabled={pending}>
            {t("publish")}
          </Button>
        ) : null}
      </div>
      <p className="text-muted text-xs">{published ? t("publishedHint") : t("draftHint")}</p>
    </form>
  );
}

export function CopyBudgetButton({ action }: { action: (s: FormState) => Promise<FormState> }) {
  const t = useTranslations("budgets");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormAlert state={state} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="self-start">
        {t("copyPrevious")}
      </Button>
    </form>
  );
}

export function AddHoursForm({ action }: { action: (s: FormState, d: FormData) => Promise<FormState> }) {
  const t = useTranslations("budgets");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") form.current?.reset();
  }, [state]);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  return (
    <form ref={form} action={formAction} className="flex flex-col gap-3" noValidate>
      <FormAlert state={state} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          id="hours-kind"
          name="kind"
          label={t("hoursKind")}
          defaultValue={submitted(state, "kind", "purchase")}
        >
          <option value="purchase">{t("hoursKinds.purchase")}</option>
          <option value="adjustment">{t("hoursKinds.adjustment")}</option>
        </SelectField>
        <Field
          id="hours"
          name="hours"
          inputMode="decimal"
          label={t("hours")}
          hint={t("hoursHint")}
          defaultValue={submitted(state, "hours")}
          error={err("hours")}
        />
      </div>
      <Field id="hours-note" name="note" label={t("note")} defaultValue={submitted(state, "note")} />
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t("addHours")}
      </Button>
    </form>
  );
}
