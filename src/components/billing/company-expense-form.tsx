"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

const CATEGORIES = ["pilot_pay", "insurance", "hangar", "maintenance", "fuel", "fees", "other"] as const;

/** Something the company paid outside a flight report. */
export function CompanyExpenseForm({
  action,
  today,
}: {
  action: (prev: FormState, data: FormData) => Promise<FormState>;
  today: string;
}) {
  const t = useTranslations("pnl");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  const fresh = state.status === "success";
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate key={fresh ? "fresh" : "form"}>
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          id="ce-category"
          name="category"
          label={t("category")}
          defaultValue={submitted(state, "category", "pilot_pay")}
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`expenseLines.${c}`)}
            </option>
          ))}
        </SelectField>
        <Field
          id="ce-amount"
          name="amount"
          label={t("amount")}
          inputMode="decimal"
          defaultValue={submitted(state, "amount")}
          error={err("amount")}
          required
        />
        <Field
          id="ce-date"
          name="occurredOn"
          type="date"
          label={t("date")}
          defaultValue={submitted(state, "occurredOn", today)}
          error={err("occurredOn")}
          required
        />
        <Field
          id="ce-description"
          name="description"
          label={t("description")}
          defaultValue={submitted(state, "description")}
          error={err("description")}
        />
      </div>
      <div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {t("addExpense")}
        </Button>
      </div>
    </form>
  );
}
