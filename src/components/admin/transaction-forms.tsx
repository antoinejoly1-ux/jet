"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

type Option = { id: string; label: string };

export function AddTransactionForm({
  action,
  shares,
  categories,
  defaultShareId,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  shares: Option[];
  categories: Option[];
  defaultShareId?: string;
}) {
  const t = useTranslations("transactions");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const amount = useRef<HTMLInputElement>(null);
  const description = useRef<HTMLInputElement>(null);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);

  // After saving, keep share, date and category (entries usually come in batches) and clear the amount.
  useEffect(() => {
    if (state.status !== "success" || !amount.current) return;
    amount.current.value = "";
    if (description.current) description.current.value = "";
    amount.current.focus();
  }, [state]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.status === "success" ? (
        <p className="text-success text-sm font-medium" role="status">
          {t("added")}
        </p>
      ) : (
        <FormAlert state={state} />
      )}
      <SelectField
        id="shareId"
        name="shareId"
        label={t("share")}
        defaultValue={submitted(state, "shareId", defaultShareId)}
        error={err("shareId")}
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
      <div className="grid grid-cols-2 gap-4">
        <Field
          id="occurredOn"
          name="occurredOn"
          type="date"
          label={t("date")}
          defaultValue={submitted(state, "occurredOn", new Date().toISOString().slice(0, 10))}
          error={err("occurredOn")}
        />
        <SelectField id="kind" name="kind" label={t("kind")} defaultValue={submitted(state, "kind", "cost")}>
          {(["cost", "revenue", "payment"] as const).map((k) => (
            <option key={k} value={k}>
              {t(`kinds.${k}`)}
            </option>
          ))}
        </SelectField>
        <Field
          ref={amount}
          id="amount"
          name="amount"
          inputMode="decimal"
          label={t("amount")}
          defaultValue={submitted(state, "amount")}
          error={err("amount")}
          required
        />
        <SelectField
          id="currency"
          name="currency"
          label={t("currency")}
          defaultValue={submitted(state, "currency", "CAD")}
        >
          <option value="CAD">CAD</option>
          <option value="USD">USD</option>
        </SelectField>
      </div>
      <SelectField
        id="categoryId"
        name="categoryId"
        label={t("category")}
        defaultValue={submitted(state, "categoryId")}
      >
        <option value="">{t("noCategory")}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </SelectField>
      <Field
        ref={description}
        id="description"
        name="description"
        label={t("description")}
        defaultValue={submitted(state, "description")}
      />
      <Button type="submit" disabled={pending} className="self-start">
        {t("add")}
      </Button>
    </form>
  );
}

export function ReverseButton({ action }: { action: (s: FormState, d: FormData) => Promise<FormState> }) {
  const t = useTranslations("transactions");
  const tc = useTranslations("common");
  const [state, formAction, pending] = useActionState(action, idle);
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {t("reverse")}
      </Button>
    );
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <FormAlert state={state} />
      <label className="sr-only" htmlFor="reverse-reason">
        {t("reverseReason")}
      </label>
      <input
        id="reverse-reason"
        name="reason"
        autoFocus
        placeholder={t("reverseReason")}
        className="border-border bg-surface h-9 w-48 rounded-md border px-2 text-sm"
      />
      <Button type="submit" size="sm" variant="danger" disabled={pending}>
        {t("reverse")}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
        {tc("cancel")}
      </Button>
    </form>
  );
}
