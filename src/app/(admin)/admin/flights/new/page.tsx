import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { flightFormOptions } from "@/components/admin/flight-options";
import { FlightForm } from "@/components/admin/flight-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { getFlightRequest } from "@/lib/services/flight-requests";
import { scheduleFlightAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("flights"))("newTitle") };
}

export default async function NewFlightPage({ searchParams }: PageProps<"/admin/flights/new">) {
  const viewer = await requireStaff();
  if (!can(viewer, "operations:write")) redirect("/admin/flights");
  const t = await getTranslations("flights");
  const sp = await searchParams;
  const requestId = typeof sp.request === "string" ? sp.request : undefined;
  const [options, request] = await Promise.all([
    flightFormOptions(viewer),
    requestId ? getFlightRequest(db, viewer, requestId).catch(() => null) : null,
  ]);
  // Planned from an owner's request: everything they asked for is already filled in.
  const defaults = request
    ? {
        aircraftId: request.aircraftId,
        shareId: request.shareId,
        fromAirport: request.from,
        toAirport: request.to,
        departsAt: `${request.date}T${request.time ?? "09:00"}`,
        arrivesAt: "",
      }
    : undefined;
  return (
    <>
      <PageHeader
        title={request ? t("planRequestTitle", { registration: request.registration }) : t("newTitle")}
        description={request ? t("planRequestSubtitle") : t("newSubtitle")}
      />
      <FlightForm
        action={scheduleFlightAction}
        {...options}
        defaults={defaults}
        requestId={request && request.status === "requested" ? requestId : undefined}
      />
    </>
  );
}
