"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select";
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
  const to = useTranslations("owners");
  const [state, action, pending] = useActionState<InviteState, FormData>(createInvitationAction, { status: "idle" });
  const [target, setTarget] = useState(state.status === "error" ? state.values.target : (defaultTarget ?? ""));
  const [role, setRole] = useState<"owner" | "assistant" | "read_only">("owner");
  const forOwner = target.startsWith("owner:");

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
          // Nothing chosen until someone picks: inviting the wrong owner gives away their data.
          defaultValue={(state.status === "error" ? state.values.target : defaultTarget) ?? ""}
          onChange={(e) => setTarget(e.target.value)}
          required
          className="border-border bg-surface h-11 w-full min-w-0 rounded-md border px-3 text-base sm:text-sm"
        >
          <option value="" disabled>
            {canInviteStaff ? t("chooseTarget") : t("chooseOwner")}
          </option>
          <optgroup label={t("ownersGroup")}>
            {owners.map((o) => (
              <option key={o.id} value={`owner:${o.id}`}>
                {o.legalName}
              </option>
            ))}
          </optgroup>
          {canInviteStaff ? (
            <optgroup label={t("staffGroup")}>
              {(["dispatcher", "pilot", "finance", "admin"] as const).map((r) => (
                <option key={r} value={`staff:${r}`}>
                  {t(`staffRoles.${r}`)}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
      </div>
      {forOwner ? (
        <>
          <SelectField
            id="memberRole"
            name="memberRole"
            label={t("memberRole")}
            aria-describedby="memberRole-hint"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            {(["owner", "assistant", "read_only"] as const).map((r) => (
              <option key={r} value={r}>
                {to(`memberRoles.${r}`)}
              </option>
            ))}
          </SelectField>
          <p id="memberRole-hint" className="text-muted -mt-2 text-xs">
            {t(`memberRoleHints.${role}`)}
          </p>
          {role === "owner" ? null : (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="canSeeFinances" className="accent-accent size-4" />
              {t("canSeeFinances")}
            </label>
          )}
        </>
      ) : null}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? t("sending") : t("send")}
      </Button>
    </form>
  );
}
