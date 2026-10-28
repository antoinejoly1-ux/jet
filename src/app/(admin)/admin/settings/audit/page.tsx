import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { listAudit } from "@/lib/services/team";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("team"))("auditTitle") };
}

const FILTERS = [
  "",
  "auth.",
  "owner.",
  "aircraft.",
  "share.",
  "invoice.",
  "transaction.",
  "budget.",
  "invitation.",
  "team.",
] as const;

export default async function AuditPage({ searchParams }: PageProps<"/admin/settings/audit">) {
  const viewer = await requireStaff();
  if (!can(viewer, "audit:read")) redirect("/admin/settings");
  const { action, before } = await searchParams;
  const filter = typeof action === "string" && (FILTERS as readonly string[]).includes(action) ? action : "";
  const t = await getTranslations("audit");
  const tt = await getTranslations("team");
  const format = await getFormatter();
  const { rows, hasMore } = await listAudit(db, viewer, {
    action: filter,
    before: typeof before === "string" ? before : undefined,
  });
  const href = (params: Record<string, string>) => `/admin/settings/audit?${new URLSearchParams(params).toString()}`;

  return (
    <>
      <PageHeader title={tt("auditTitle")} description={tt("auditBody")} />
      <nav aria-label={t("filters")} className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f || "all"}
            href={href(f ? { action: f } : {}) as never}
            aria-current={filter === f ? "page" : undefined}
            className={cn(
              "border-border rounded-full border px-3 py-1.5 text-sm font-medium",
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-surface text-muted hover:text-text",
            )}
          >
            {t(`filter.${f ? f.slice(0, -1) : "all"}`)}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title={t("emptyTitle")} body={t("empty")} />
      ) : (
        <ol className="bg-surface divide-border border-border divide-y rounded-lg border">
          {rows.map((r) => {
            const key = `actions.${r.action.replace(/\./g, "_")}`;
            return (
              <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                <span className="text-muted tabular shrink-0 text-xs sm:w-44">
                  {format.dateTime(r.createdAt, { dateStyle: "medium", timeStyle: "medium" })}
                </span>
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-semibold">{r.actorName ?? t("system")}</span> · {t.has(key) ? t(key) : r.action}
                  {r.entityType ? <span className="text-muted"> · {r.entityType}</span> : null}
                </span>
                {r.ipAddress ? <span className="text-muted tabular text-xs">{r.ipAddress}</span> : null}
              </li>
            );
          })}
        </ol>
      )}
      {hasMore ? (
        <Button asChild variant="secondary" size="sm" className="mt-4">
          <Link
            href={
              href({ ...(filter ? { action: filter } : {}), before: rows.at(-1)!.createdAt.toISOString() }) as never
            }
          >
            {t("older")}
          </Link>
        </Button>
      ) : null}
    </>
  );
}
