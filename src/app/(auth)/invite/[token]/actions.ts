"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireViewer } from "@/lib/auth/session";
import { acceptInvitation, InvitationError } from "@/lib/services/invitations";

export async function acceptInvitationAction(token: string) {
  const viewer = await requireViewer();
  let destination: Route = "/";
  try {
    const result = await acceptInvitation(db, token, viewer.id);
    if (result.staffRole) destination = "/admin";
  } catch (err) {
    if (err instanceof InvitationError) redirect(`/invite/${encodeURIComponent(token)}?error=${err.code}` as Route);
    throw err;
  }
  redirect(destination);
}
