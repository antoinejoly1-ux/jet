import { CalendarDays, Phone, PlaneTakeoff } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { RequestFlightButton } from "@/components/flights/request-flight";
import { AvailabilityCalendar } from "@/components/operations/availability-calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { isMonth, monthRange } from "@/lib/availability-days";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getAvailability, listOwnerAircraft } from "@/lib/services/availability";
import { zonedDay } from "@/lib/time";
import { scenes } from "@/lib/imagery";
import { telHref } from "@/lib/phone";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("availability") };
}

export default async function OwnerAvailabilityPage({ searchParams }: PageProps<"/availability">) {
  const viewer = await requireAccess();
  const t = await getTranslations("availability");
  const sp = await searchParams;
  const month = typeof sp.month === "string" && isMonth(sp.month) ? sp.month : zonedDay(new Date()).slice(0, 7);
  const fleet = await listOwnerAircraft(db, viewer);
  const unique = [...new Map(fleet.map((a) => [a.id, a])).values()];
  if (unique.length === 0)
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={CalendarDays} image={scenes.hangar} title={t("noAircraftTitle")} body={t("noAircraftBody")} />
      </>
    );

  const chosen = unique.find((a) => a.id === sp.aircraft) ?? unique[0]!;
  const { from, to } = monthRange(month);
  const { periods } = await getAvailability(db, viewer, chosen.id, from, to, { ownerView: true });
  const phone = env.OPERATOR_PHONE;
  const tr = await getTranslations("requestFlight");
  const href = (m: string, aircraft = chosen.id) =>
    `/availability?${new URLSearchParams({ month: m, ...(unique.length > 1 ? { aircraft } : {}) })}`;

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <RequestFlightButton>
              <PlaneTakeoff aria-hidden />
              {tr("open")}
            </RequestFlightButton>
            {phone ? (
              <Button asChild variant="secondary">
                <a href={telHref(phone)}>
                  <Phone aria-hidden />
                  {t("callToBook")}
                </a>
              </Button>
            ) : null}
          </>
        }
      />
      {unique.length > 1 ? (
        <nav aria-label={t("chooseAircraft")} className="mb-4 flex flex-wrap gap-2">
          {unique.map((a) => (
            <Button key={a.id} asChild size="sm" variant={a.id === chosen.id ? "primary" : "secondary"}>
              <a href={href(month, a.id)} aria-current={a.id === chosen.id ? "page" : undefined}>
                {a.registration}
              </a>
            </Button>
          ))}
        </nav>
      ) : null}
      <Card>
        <p className="text-muted mb-4 text-sm">
          {chosen.registration} · {chosen.model}
        </p>
        <AvailabilityCalendar month={month} periods={periods} hrefFor={(m) => href(m)} requestable />
      </Card>
      <p className="text-muted mt-4 text-sm">{phone ? t("bookingHint") : t("bookingHintNoPhone")}</p>
    </>
  );
}
