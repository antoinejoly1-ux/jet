"use client";

import { Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

export function InviteAllButton({ action, count }: { action: (s: FormState) => Promise<FormState>; count: number }) {
  const t = useTranslations("invitations");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormAlert state={state} />
      {count > 0 ? (
        <div>
          <Button type="submit" size="sm" disabled={pending}>
            <Send aria-hidden />
            {t("bulkInvite", { count })}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
