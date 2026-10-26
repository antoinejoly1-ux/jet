"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getTranslations } from "next-intl/server";
import { formError, type FormState } from "@/lib/forms";
import { createInvitation, inviteOwnersWithoutAccess, revokeInvitation } from "@/lib/services/invitations";

export type InviteState =
  | { status: "idle" }
  | { status: "error"; code: "invalid" | "forbidden"; values: { email: string; target: string } }
  | { status: "sent"; email: string; url: string };

export async function createInvitationAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const viewer = await requireStaff();
  const target = String(formData.get("target") ?? "");
  const email = String(formData.get("email") ?? "");
  const input = target.startsWith("staff:")
    ? { kind: "staff" as const, email, staffRole: target.slice(6) as "admin" | "finance" | "dispatcher" }
    : { kind: "owner" as const, email, ownerId: target.replace(/^owner:/, "") };
  try {
    const { url } = await createInvitation(db, viewer, input, env.BETTER_AUTH_URL);
    revalidatePath("/admin/invitations");
    return { status: "sent", email: email.trim().toLowerCase(), url };
  } catch (err) {
    if (err instanceof ForbiddenError) return { status: "error", code: "forbidden", values: { email, target } };
    if (err instanceof z.ZodError) return { status: "error", code: "invalid", values: { email, target } };
    throw err;
  }
}

export async function revokeInvitationAction(invitationId: string) {
  const viewer = await requireStaff();
  await revokeInvitation(db, viewer, z.string().uuid().parse(invitationId));
  revalidatePath("/admin/invitations");
}

export async function inviteAllAction(_prev: FormState): Promise<FormState> {
  const viewer = await requireStaff();
  try {
    const { invited, missingEmail } = await inviteOwnersWithoutAccess(db, viewer, env.BETTER_AUTH_URL);
    revalidatePath("/admin", "layout");
    const t = await getTranslations("invitations");
    return {
      status: "success",
      message:
        t("bulkSent", { count: invited.length }) +
        (missingEmail.length ? ` ${t("bulkMissing", { count: missingEmail.length })}` : ""),
    };
  } catch (err) {
    return formError(err);
  }
}
