"use client";

import { MailPlus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useRef } from "react";
import { createInvitationAction, type InviteState } from "@/app/(admin)/admin/invitations/actions";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";

const ROLES = ["dispatcher", "pilot", "finance", "admin"] as const;
const initial: InviteState = { status: "idle" };

/**
 * Inviting someone to the Univair team, from Settings: an email and a role.
 * Owners are invited from their aircraft instead.
 */
export function TeamInviteDialog() {
  const t = useTranslations("team");
  const ti = useTranslations("teamInvite");
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState(createInvitationAction, initial);
  return (
    <>
      <Button type="button" size="sm" variant="secondary" onClick={() => dialog.current?.showModal()}>
        <MailPlus aria-hidden />
        {t("invite")}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby="team-invite-title"
        className="bg-surface text-text border-border m-auto w-[calc(100%-2rem)] max-w-md rounded-[24px] border p-0 backdrop:bg-black/50 backdrop:backdrop-blur-sm"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="flex flex-col gap-5 p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="team-invite-title" className="text-2xl font-light tracking-tight">
                {ti("title")}
              </h2>
              <p className="text-muted mt-1 text-sm">{ti("body")}</p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              aria-label={ti("close")}
              className="text-muted hover:text-text hover:bg-surface-muted -mt-1 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full"
            >
              <X className="size-5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          {state.status === "sent" ? (
            <div className="flex flex-col gap-3">
              <p role="status" className="text-success text-sm font-medium">
                {ti("sent", { email: state.email })}
              </p>
              <div>
                <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
                  {ti("close")}
                </Button>
              </div>
            </div>
          ) : (
            <form action={action} className="flex flex-col gap-4" noValidate>
              {state.status === "error" ? (
                <p role="alert" className="text-danger text-sm font-medium">
                  {ti(state.code)}
                </p>
              ) : null}
              <Field
                id="team-invite-email"
                name="email"
                type="email"
                label={ti("email")}
                autoComplete="off"
                defaultValue={state.status === "error" ? state.values.email : ""}
                required
              />
              <SelectField
                id="team-invite-role"
                name="target"
                label={ti("role")}
                defaultValue={state.status === "error" ? state.values.target : "staff:dispatcher"}
              >
                {ROLES.map((r) => (
                  <option key={r} value={`staff:${r}`}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </SelectField>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => dialog.current?.close()}>
                  {ti("cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  {ti("send")}
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
    </>
  );
}
