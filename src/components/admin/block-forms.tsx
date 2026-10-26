"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field } from "@/components/ui/field";
import { FormAlert } from "@/components/ui/form-alert";
import { SelectField } from "@/components/ui/select";
import { idle, submitted, type FormState } from "@/lib/forms";

/** Blocks a period by hand: the aircraft is lent out, or unavailable for a known reason. */
export function AddBlockForm({ action }: { action: (s: FormState, d: FormData) => Promise<FormState> }) {
  const t = useTranslations("availability");
  const tf = useTranslations("formErrors");
  const [state, formAction, pending] = useActionState(action, idle);
  const err = (f: string) => (state.status === "error" && state.fields?.[f] ? tf(`fields.${f}`) : undefined);
  // After a successful save the form resets to empty; after an error it keeps what was typed.
  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <FormAlert state={state} />
      {state.status === "success" ? <p className="text-success text-sm font-medium">{t("blockAdded")}</p> : null}
      <Field
        id="block-startsAt"
        name="startsAt"
        type="datetime-local"
        label={t("blockStarts")}
        defaultValue={submitted(state, "startsAt")}
        error={err("startsAt")}
        required
      />
      <Field
        id="block-endsAt"
        name="endsAt"
        type="datetime-local"
        label={t("blockEnds")}
        defaultValue={submitted(state, "endsAt")}
        error={err("endsAt")}
        required
      />
      <SelectField id="block-kind" name="kind" label={t("blockKind")} defaultValue={submitted(state, "kind", "booked")}>
        <option value="booked">{t("legend.booked")}</option>
        <option value="maintenance">{t("legend.maintenance")}</option>
      </SelectField>
      <Button type="submit" disabled={pending}>
        {t("addBlock")}
      </Button>
    </form>
  );
}

export function RemoveBlockButton({ action }: { action: (s: FormState) => Promise<FormState> }) {
  const t = useTranslations("availability");
  const tc = useTranslations("common");
  const [state, formAction] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <FormAlert state={state} />
      <ConfirmButton
        variant="ghost"
        question={t("removeQuestion")}
        confirmLabel={t("remove")}
        cancelLabel={tc("cancel")}
      >
        {t("remove")}
      </ConfirmButton>
    </form>
  );
}
