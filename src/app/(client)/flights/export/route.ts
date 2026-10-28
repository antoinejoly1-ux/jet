import { getLocale } from "next-intl/server";
import { requireAccess } from "@/lib/auth/session";
import { csvResponse } from "@/lib/csv";
import { db } from "@/lib/db";
import { flightsCsv } from "@/lib/exports";
import { orNotFound } from "@/lib/route-errors";
import { listOwnerFlights } from "@/lib/services/flights";

export async function GET() {
  const viewer = await requireAccess();
  return orNotFound(async () => {
    const { upcoming, past } = await listOwnerFlights(db, viewer);
    return csvResponse(
      await flightsCsv([...upcoming].reverse().concat(past)),
      (await getLocale()).startsWith("fr") ? "vols.csv" : "flights.csv",
    );
  });
}
