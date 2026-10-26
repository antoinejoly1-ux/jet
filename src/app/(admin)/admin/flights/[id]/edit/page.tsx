import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { flightFormOptions } from "@/components/admin/flight-options";
import { FlightForm } from "@/components/admin/flight-form";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { getFlight } from "@/lib/services/flights";
import { utcToZonedLocal } from "@/lib/time";
import { updateFlightAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("flights"))("editTitle") };
}

export default async function EditFlightPage({ params }: PageProps<"/admin/flights/[id]/edit">) {
  const viewer = await requireStaff();
  if (!can(viewer, "operations:write")) redirect("/admin/flights");
  const { id } = await params;
  const t = await getTranslations("flights");
  const flight = await getFlight(db, viewer, id).catch((e) =>
    e instanceof NotFoundError ? notFound() : Promise.reject(e),
  );
  if (flight.status !== "scheduled") redirect("/admin/flights");
  const options = await flightFormOptions(viewer);
  return (
    <>
      <PageHeader
        title={t("editTitle")}
        description={`${flight.registration} · ${flight.fromAirport} → ${flight.toAirport}`}
      />
      <FlightForm
        action={updateFlightAction.bind(null, id)}
        {...options}
        defaults={{
          aircraftId: flight.aircraftId,
          shareId: flight.shareId ?? "",
          fromAirport: flight.fromAirport,
          toAirport: flight.toAirport,
          departsAt: utcToZonedLocal(flight.departsAt),
          arrivesAt: flight.arrivesAt ? utcToZonedLocal(flight.arrivesAt) : "",
        }}
      />
    </>
  );
}
