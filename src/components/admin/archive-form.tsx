"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

/** A confirm-then-submit form for archiving a record, showing why it was refused. */
export function ArchiveForm({
  action,
  label,
  question,
}: {
  action: (s: FormState) => Promise<FormState>;
  label: string;
  question: string;
}) {
  const t = useTranslations("common");
  const [state, formAction] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormAlert state={state} />
      <div>
        <ConfirmButton question={question} confirmLabel={t("confirm")} cancelLabel={t("cancel")}>
          {label}
        </ConfirmButton>
      </div>
    </form>
  );
}
