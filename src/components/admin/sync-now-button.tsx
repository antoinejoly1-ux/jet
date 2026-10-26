"use client";

import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/form-alert";
import { idle, type FormState } from "@/lib/forms";

export function SyncNowButton({ action }: { action: (s: FormState) => Promise<FormState> }) {
  const t = useTranslations("integrations");
  const [state, formAction, pending] = useActionState(action, idle);
  return (
    <form action={formAction} className="flex flex-col gap-2">
      <FormAlert state={state} />
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        <RefreshCw className={pending ? "animate-spin" : undefined} aria-hidden />
        {pending ? t("syncing") : t("syncNow")}
      </Button>
    </form>
  );
}
