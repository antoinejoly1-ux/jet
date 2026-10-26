"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { createInvitationAction, type InviteState } from "./actions";

export function InviteForm({
  owners,
  canInviteStaff,
  defaultTarget,
}: {
  defaultTarget?: string;
  owners: { id: string; legalName: string }[];
  canInviteStaff: boolean;
}) {
  const t = useTranslations("invitations");
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvitationAction, { status: "idle" });

  return (
    <form action={action} className="flex flex-col gap-4">
      {state.status === "error" ? <Alert tone="danger">{t(`errors.${state.code}`)}</Alert> : null}
      {state.status === "sent" ? (
        <Alert tone="success">
          {t("sent", { email: state.email })}
          <span className="mt-1 block font-mono text-xs break-all">{state.url}</span>
        </Alert>
      ) : null}
      <Field
        id="email"
        name="email"
        type="email"
        autoComplete="off"
        label={t("email")}
        defaultValue={state.status === "error" ? state.values.email : ""}
        required
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="target">{t("access")}</Label>
        <select
          key={state.status === "error" ? state.values.target : (defaultTarget ?? "")}
          id="target"
          name="target"
          defaultValue={state.status === "error" ? state.values.target : defaultTarget}
          required
          className="border-border bg-surface h-11 rounded-md border px-3 text-base sm:text-sm"
        >
          <optgroup label={t("ownersGroup")}>
            {owners.map((o) => (
              <option key={o.id} value={`owner:${o.id}`}>
                {o.legalName}
              </option>
            ))}
          </optgroup>
          {canInviteStaff ? (
            <optgroup label={t("staffGroup")}>
              {(["dispatcher", "finance", "admin"] as const).map((r) => (
                <option key={r} value={`staff:${r}`}>
                  {t(`staffRoles.${r}`)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
