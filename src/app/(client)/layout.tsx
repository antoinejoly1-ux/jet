import type { ReactNode } from "react";
import { RequestFlightProvider, type RequestableShare } from "@/components/flights/request-flight";
import { AppShell } from "@/components/shell/app-shell";
import { airport } from "@/lib/airports";
import { actingOwnerIds } from "@/lib/auth/policy";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listOwnerAircraft } from "@/lib/services/availability";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const viewer = await requireAccess();
  // Who may ask for a flight: members who act for an owner, never read-only logins or staff viewing as.
  const acting = viewer.viewingAs ? [] : actingOwnerIds(viewer);
  const planes = acting.length ? await listOwnerAircraft(db, viewer) : [];
  const requestable: RequestableShare[] = planes
    .filter((p) => acting.includes(p.ownerId))
    .map((p) => {
      const base = airport(p.homeBase);
      return {
        id: p.shareId,
        label: `${p.registration} · ${p.model}`,
        homeBase: p.homeBase,
        homeBaseLabel: base ? `${base.city || base.name} · ${base.name}` : "",
      };
    });
  return (
    <RequestFlightProvider shares={requestable}>
      <AppShell side="client" viewer={viewer}>
        {children}
      </AppShell>
    </RequestFlightProvider>
  );
}
