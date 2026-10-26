"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

type Action = (s: FormState) => Promise<FormState>;

export function MaintenanceRowActions({
  id,
  status,
  start,
  finish,
  cancel,
}: {
  id: string;
  status: "planned" | "in_progress" | "done" | "cancelled";
  start: Action;
  finish: Action;
  cancel: Action;
}) {
  const t = useTranslations("maintenance");
  const tc = useTranslations("common");
  const [startState, startAction, starting] = useActionState(start, idle);
  const [finishState, finishAction, finishing] = useActionState(finish, idle);
  const [cancelState, cancelAction] = useActionState(cancel, idle);
  if (status === "done" || status === "cancelled") return null;

  return (
    <div className="flex flex-wrap items-center gap-1">
      <FormAlert state={startState} />
      <FormAlert state={finishState} />
      <FormAlert state={cancelState} />
      {status === "planned" ? (
        <form action={startAction}>
          <Button type="submit" size="sm" variant="secondary" disabled={starting}>
            {t("start")}
          </Button>
        </form>
      ) : (
        <form action={finishAction}>
          <Button type="submit" size="sm" variant="secondary" disabled={finishing}>
            {t("finish")}
          </Button>
        </form>
      )}
      <Button asChild size="sm" variant="ghost">
        <Link href={`/admin/maintenance/${id}/edit`}>{t("edit")}</Link>
      </Button>
      <form action={cancelAction}>
        <ConfirmButton
          variant="ghost"
          question={t("cancelQuestion")}
          confirmLabel={t("cancelJob")}
          cancelLabel={tc("cancel")}
        >
          {t("cancelJob")}
        </ConfirmButton>
      </form>
    </div>
  );
}
