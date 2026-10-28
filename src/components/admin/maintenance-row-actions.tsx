"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

type Action = (s: FormState) => Promise<FormState>;
type Status = "planned" | "in_progress" | "review" | "done" | "cancelled";

/**
 * A job's next step, one button (Commencer, Envoyer en vérification,
 * Approuver), with the rest (send back, edit, cancel) behind « ⋯ ».
 */
export function MaintenanceRowActions({
  id,
  status,
  actions,
}: {
  id: string;
  status: Status;
  actions: { start: Action; review: Action; done: Action; back: Action; cancel: Action };
}) {
  const t = useTranslations("maintenance");
  const tc = useTranslations("common");
  const next =
    status === "planned" ? "start" : status === "in_progress" ? "review" : status === "review" ? "done" : null;
  const [state, nextAction, pending] = useActionState(next ? actions[next] : actions.cancel, idle);
  const [backState, backAction] = useActionState(actions.back, idle);
  const [cancelState, cancelAction] = useActionState(actions.cancel, idle);
  const [more, setMore] = useState(false);
  if (!next) return null;

  return (
    <div className="flex flex-col gap-2">
      <FormAlert state={state} />
      <FormAlert state={backState} />
      <FormAlert state={cancelState} />
      <div className="flex flex-wrap items-center gap-1">
        <form action={nextAction}>
          <Button type="submit" size="sm" variant={next === "done" ? "primary" : "secondary"} disabled={pending}>
            {t(`next.${next}`)}
          </Button>
        </form>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={more}
          aria-label={t("moreActions")}
          onClick={() => setMore((m) => !m)}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </div>
      {more ? (
        <div className="flex flex-wrap items-center gap-1">
          {status === "review" ? (
            <form action={backAction}>
              <Button type="submit" size="sm" variant="ghost">
                {t("sendBack")}
              </Button>
            </form>
          ) : null}
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
      ) : null}
    </div>
  );
}
