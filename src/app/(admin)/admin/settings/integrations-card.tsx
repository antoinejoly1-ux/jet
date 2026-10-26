import { CalendarSync } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { SyncNowButton } from "@/components/admin/sync-now-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardTitle } from "@/components/ui/card";
import type { Actor } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { getSchedulingAdapter } from "@/lib/integrations/scheduling";
import { getIntegrationStatus, type SyncCounts } from "@/lib/services/scheduling-sync";
import { syncNowAction } from "./actions";

const TONE = { connected: "success", error: "danger", disconnected: "neutral" } as const;

/** Scheduling software: whether it's connected, and how the latest pulls went. */
export async function IntegrationsCard({ viewer }: { viewer: Actor }) {
  const t = await getTranslations("integrations");
  const format = await getFormatter();
  const adapter = getSchedulingAdapter();
  const { integrations, recentRuns } = await getIntegrationStatus(db, viewer);
  const current = adapter ? integrations.find((i) => i.provider === adapter.provider) : undefined;
  const status = adapter ? (current?.status ?? "connected") : "disconnected";
  const runs = adapter ? recentRuns.filter((r) => r.provider === adapter.provider).slice(0, 3) : [];

  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <CalendarSync className="text-muted size-4" aria-hidden />
        <CardTitle>{t("title")}</CardTitle>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{t("scheduling")}</p>
        <Badge tone={TONE[status]}>{t(`statuses.${status}`)}</Badge>
      </div>
      {!adapter ? (
        <p className="text-muted mt-1 text-sm">{t("notConnectedBody")}</p>
      ) : (
        <>
          <p className="text-muted mt-1 text-sm">
            {current?.lastSyncedAt
              ? t("lastSync", { when: format.relativeTime(current.lastSyncedAt) })
              : t("neverSynced")}
          </p>
          {runs.length > 0 ? (
            <ul className="text-muted mt-3 flex flex-col gap-1 text-xs">
              {runs.map((r) => {
                const c = r.counts as Partial<SyncCounts>;
                return (
                  <li key={r.id} className="tabular">
                    {format.dateTime(r.startedAt, { dateStyle: "short", timeStyle: "short" })} ·{" "}
                    {t("runSummary", {
                      created: c.created ?? 0,
                      updated: c.updated ?? 0,
                      failed: c.failed ?? 0,
                    })}
                  </li>
                );
              })}
            </ul>
          ) : null}
          <div className="mt-4">
            <SyncNowButton action={syncNowAction} />
          </div>
        </>
      )}
    </Card>
  );
}
