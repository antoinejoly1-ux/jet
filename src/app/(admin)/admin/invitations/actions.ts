"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { createInvitation, revokeInvitation } from "@/lib/services/invitations";

export type InviteState =
  | { status: "idle" }
  | { status: "error"; code: "invalid" | "forbidden" }
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
    if (err instanceof ForbiddenError) return { status: "error", code: "forbidden" };
    if (err instanceof z.ZodError) return { status: "error", code: "invalid" };
    throw err;
  }
}

export async function revokeInvitationAction(invitationId: string) {
  const viewer = await requireStaff();
  await revokeInvitation(db, viewer, z.string().uuid().parse(invitationId));
  revalidatePath("/admin/invitations");
}
