import "server-only";
import { getFormatter } from "next-intl/server";
import type { Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { listShareOptions } from "@/lib/services/invoices";

/** Shares as picker options: "C-GJTA · Jean Tremblay (25 %)". Ended shares are labelled and listed last. */
export async function shareOptions(viewer: Actor, { includeEnded = false } = {}) {
  const format = await getFormatter();
  const rows = await listShareOptions(db, viewer);
  return rows
    .filter((s) => includeEnded || !s.ended)
    .map((s) => ({
      id: s.id,
      label: `${s.registration} · ${s.ownerName} (${format.number(s.percentageBp / 10000, { style: "percent", maximumFractionDigits: 2 })})${s.ended ? " ✕" : ""}`,
    }));
}
