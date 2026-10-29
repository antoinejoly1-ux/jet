import { AlertTriangle, Plane, Plus } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { AvatarStack } from "@/components/ui/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { aircraftPhotoUrl } from "@/lib/aircraft-photo-url";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { listFleetCards } from "@/lib/services/aircraft";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("aircraft") };
}

const STATUS_TONE = { available: "success", flying: "accent", maintenance: "warning", inactive: "neutral" } as const;

/**
 * « Appareils »: each aircraft as a card with its photo, the company that owns
 * it and its owners' faces. Everything about an aircraft opens from here.
 */
export default async function AircraftListPage() {
  const viewer = await requireStaff();
  const t = await getTranslations("aircraft");
  const format = await getFormatter();
  const rows = await listFleetCards(db, viewer);

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          can(viewer, "fleet:write") ? (
            <Button asChild size="sm">
              <Link href="/admin/aircraft/new">
                <Plus aria-hidden />
                {t("new")}
              </Link>
            </Button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon={Plane} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((a) => (
            <li key={a.id}>
              <Link href={`/admin/aircraft/${a.id}`} className="group block">
                <div className="bg-surface-muted relative aspect-[4/3] overflow-hidden rounded-[22px]">
                  <Image
                    src={aircraftPhotoUrl(a.id, a.photoFileId) ?? aircraftPhoto(a.model)}
                    // An uploaded photo sits behind sign-in: the browser fetches it, not the optimiser.
                    unoptimized={Boolean(a.photoFileId)}
                    alt=""
                    fill
                    sizes="(min-width: 1280px) 400px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                  <Badge
                    tone={STATUS_TONE[a.status]}
                    className="bg-surface/90 absolute top-3 left-3 border-transparent backdrop-blur"
                  >
                    {t(`statuses.${a.status}`)}
                  </Badge>
                </div>
                <div className="mt-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-lg font-medium tracking-tight group-hover:underline">{a.registration}</p>
                    <p className="text-muted truncate text-sm">
                      {[a.model, a.holdingCompanyName].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {a.holders.length ? (
                    <AvatarStack
                      label={t("owners")}
                      people={a.holders.map((h) => ({ id: h.ownerId, name: h.name, image: h.image }))}
                    />
                  ) : null}
                </div>
                {a.assignedBp !== 10_000 ? (
                  <p className="text-warning mt-2 flex items-center gap-1.5 text-xs font-medium">
                    <AlertTriangle className="size-3.5" aria-hidden />
                    {t("assignedWarning", {
                      percent: format.number(a.assignedBp / 10000, { style: "percent", maximumFractionDigits: 2 }),
                    })}
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
