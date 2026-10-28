"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { FormAlert } from "@/components/ui/form-alert";
import { Select } from "@/components/ui/select";
import { idle, type FormState } from "@/lib/forms";

/** Picking someone saves straight away; there's no separate button. */
export function AssignForm({
  action,
  current,
  people,
}: {
  action: (s: FormState, d: FormData) => Promise<FormState>;
  current: string;
  people: { id: string; name: string }[];
}) {
  const t = useTranslations("messages");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <FormAlert state={state} />
      <label htmlFor="assignee" className="text-muted text-sm whitespace-nowrap">
        {t("assignedTo")}
      </label>
      <Select
        key={current}
        id="assignee"
        name="assignee"
        defaultValue={current}
        disabled={pending}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 w-44"
      >
        <option value="">{t("unassigned")}</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </form>
  );
}
