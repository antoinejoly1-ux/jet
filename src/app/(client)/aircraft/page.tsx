import { CalendarDays, Plane, Wrench } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireAccess } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours } from "@/lib/format";
import { listOwnerAircraft } from "@/lib/services/availability";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { scenes } from "@/lib/imagery";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("aircraft") };
}

const STATUS_TONE = { available: "success", flying: "accent", maintenance: "warning", inactive: "neutral" } as const;
const JOB_TONE = { planned: "accent", in_progress: "warning", done: "success", cancelled: "neutral" } as const;

export default async function OwnerAircraftPage() {
  const viewer = await requireAccess();
  const t = await getTranslations("ownerAircraft");
  const th = await getTranslations("home");
  const tm = await getTranslations("maintenance");
  const format = await getFormatter();
  const locale = await getLocale();
  const fleet = await listOwnerAircraft(db, viewer);
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  const dt = (d: Date) => format.dateTime(d, { day: "numeric", month: "short", year: "numeric" });

  if (fleet.length === 0)
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={Plane} image={scenes.hangarBright} title={th("noShareTitle")} body={th("noShareBody")} />
      </>
    );

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="flex flex-col gap-8">
        {fleet.map((a) => (
          <section key={a.shareId} aria-labelledby={`plane-${a.shareId}`} className="grid gap-4 lg:grid-cols-3">
            <div className="bg-primary shadow-card relative h-64 overflow-hidden rounded-lg sm:h-80 lg:col-span-3">
              <Image
                src={aircraftPhoto(a.model)}
                alt=""
                fill
                priority
                sizes="(min-width: 1280px) 1200px, 100vw"
                placeholder="blur"
                className="object-cover"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent"
                aria-hidden
              />
              <div className="absolute inset-x-6 bottom-6 text-white sm:inset-x-8 sm:bottom-8">
                <p className="text-[11px] font-semibold tracking-[0.2em] text-white/75 uppercase">{a.model}</p>
                <p className="mt-1 text-5xl font-light tracking-[-0.03em] sm:text-6xl" aria-hidden>
                  {a.registration}
                </p>
              </div>
            </div>
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <h2 id={`plane-${a.shareId}`} className="text-xl font-light tracking-tight">
                  {a.registration}
                </h2>
                <Badge tone={STATUS_TONE[a.status]}>{th(`status.${a.status}`)}</Badge>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                {a.holdingCompanyName ? (
                  <>
                    <dt className="text-muted">{t("ownedBy")}</dt>
                    <dd className="font-medium">{a.holdingCompanyName}</dd>
                  </>
                ) : null}
                <dt className="text-muted">{t("model")}</dt>
                <dd className="font-medium">{a.model}</dd>
                {a.serialNumber ? (
                  <>
                    <dt className="text-muted">{t("serialNumber")}</dt>
                    <dd className="font-medium">{a.serialNumber}</dd>
                  </>
                ) : null}
                {a.homeBase ? (
                  <>
                    <dt className="text-muted">{t("homeBase")}</dt>
                    <dd className="font-medium">{a.homeBase}</dd>
                  </>
                ) : null}
                <dt className="text-muted">{t("yourShare")}</dt>
                <dd className="tabular font-medium">
                  {format.number(a.percentageBp / 10000, { style: "percent", maximumFractionDigits: 2 })}
                  {a.annualHoursMinutes
                    ? ` · ${t("perYear", { hours: formatHours(a.annualHoursMinutes, locale) })}`
                    : ""}
                </dd>
                <dt className="text-muted">{t("since")}</dt>
                <dd className="font-medium">{day(a.startsOn)}</dd>
              </dl>
              <Button asChild size="sm" variant="secondary" className="mt-4">
                <Link href={`/availability?aircraft=${a.id}`}>
                  <CalendarDays aria-hidden />
                  {t("seeAvailability")}
                </Link>
              </Button>
            </Card>
            <Card className="lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Wrench className="text-muted size-4" aria-hidden />
                <CardTitle>{t("maintenance")}</CardTitle>
              </div>
              {a.maintenance.length === 0 ? (
                <p className="text-muted text-sm">{t("noMaintenance")}</p>
              ) : (
                <ul className="divide-border divide-y">
                  {a.maintenance.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                      <p className="min-w-0 font-medium">
                        {m.endsAt
                          ? t("window", { from: dt(m.startsAt), to: dt(m.endsAt) })
                          : t("windowOpen", { from: dt(m.startsAt) })}
                      </p>
                      <Badge tone={JOB_TONE[m.status]}>{tm(`statuses.${m.status}`)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </section>
        ))}
      </div>
    </>
  );
}
