import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { AddHoursForm, BudgetEditor, CopyBudgetButton } from "@/components/admin/budget-forms";
import { shareOptions } from "@/components/admin/share-options";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatHours, formatMoney } from "@/lib/format";
import { getBudget, listBudgetStatuses } from "@/lib/services/budgets";
import { listHours } from "@/lib/services/ledger";
import { addHoursAction, copyBudgetAction, saveBudgetAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("budgets") };
}

const TONE = { published: "success", draft: "warning" } as const;

export default async function BudgetsPage({ searchParams }: PageProps<"/admin/budgets">) {
  const viewer = await requireStaff();
  const t = await getTranslations("budgets");
  if (!can(viewer, "finance:read")) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={BarChart3} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </>
    );
  }
  const locale = await getLocale();
  const format = await getFormatter();
  const sp = await searchParams;
  const thisYear = new Date().getFullYear();
  const year = Number(typeof sp.year === "string" ? sp.year : "") || thisYear;
  const shareId = typeof sp.share === "string" ? sp.share : "";

  const [shares, statuses] = await Promise.all([shareOptions(viewer), listBudgetStatuses(db, viewer, year)]);
  const selected = shares.find((s) => s.id === shareId);
  const canWrite = can(viewer, "finance:write");
  const money = (cents: number) => formatMoney(cents, "CAD", locale);

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <form className="mb-6 flex flex-wrap gap-2">
        <Select name="share" defaultValue={shareId} aria-label={t("share")} className="w-full sm:w-96">
          <option value="">{t("chooseShare")}</option>
          {shares.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select name="year" defaultValue={String(year)} aria-label={t("year")} className="w-28">
          {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t("open")}
        </Button>
      </form>

      {!selected ? (
        <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
          {shares.map((s) => {
            const status = statuses.get(s.id);
            return (
              <li key={s.id}>
                <Link
                  href={`/admin/budgets?share=${s.id}&year=${year}`}
                  className="hover:bg-surface-muted flex items-center gap-3 px-4 py-3"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.label}</span>
                  <Badge tone={status ? TONE[status] : "neutral"}>{t(`statuses.${status ?? "none"}`, { year })}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <SelectedShare
          shareId={selected.id}
          label={selected.label}
          year={year}
          canWrite={canWrite}
          money={money}
          locale={locale}
          format={format}
          viewer={viewer}
        />
      )}
    </>
  );
}

async function SelectedShare({
  shareId,
  label,
  year,
  canWrite,
  money,
  locale,
  format,
  viewer,
}: {
  shareId: string;
  label: string;
  year: number;
  canWrite: boolean;
  money: (cents: number) => string;
  locale: string;
  format: Awaited<ReturnType<typeof getFormatter>>;
  viewer: Awaited<ReturnType<typeof requireStaff>>;
}) {
  const t = await getTranslations("budgets");
  const [view, hours] = await Promise.all([getBudget(db, viewer, shareId, year), listHours(db, viewer, shareId)]);
  const published = view.budget?.status === "published";
  const rows = view.rows.map((r) => ({
    categoryId: r.categoryId,
    name: locale === "en" ? r.nameEn : r.nameFr,
    plannedCents: r.plannedCents,
    spent: money(r.spentCents),
    remaining: money(r.remainingCents),
    over: r.remainingCents < 0 && r.plannedCents > 0,
  }));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <CardTitle className="text-text text-base">{t("budgetFor", { year })}</CardTitle>
          <Badge tone={view.budget ? TONE[view.budget.status] : "neutral"}>
            {t(`statuses.${view.budget?.status ?? "none"}`, { year })}
          </Badge>
          <span className="text-muted min-w-0 flex-1 text-sm">{label}</span>
          <DownloadLink href={`/admin/statements?share=${shareId}&year=${year}`}>{t("statementPdf")}</DownloadLink>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-3">
          {[
            [t("planned"), view.totals.plannedCents],
            [t("spent"), view.totals.spentCents],
            [t("remaining"), view.totals.plannedCents - view.totals.spentCents],
          ].map(([name, cents]) => (
            <div key={name as string} className="bg-surface-muted rounded-md px-3 py-2">
              <p className="text-muted text-xs">{name}</p>
              <p className="tabular font-semibold">{money(cents as number)}</p>
            </div>
          ))}
        </div>
        {canWrite ? (
          <>
            {!view.budget ? (
              <div className="mb-4">
                <CopyBudgetButton action={copyBudgetAction.bind(null, shareId, year)} />
              </div>
            ) : null}
            <BudgetEditor
              key={`${shareId}-${year}`}
              action={saveBudgetAction.bind(null, shareId, year)}
              rows={rows}
              published={published}
            />
          </>
        ) : (
          <ul className="divide-border divide-y text-sm">
            {rows.map((r) => (
              <li key={r.categoryId} className="flex justify-between py-2">
                <span>{r.name}</span>
                <span className="tabular">{money(r.plannedCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="self-start">
        <CardTitle className="mb-1">{t("hoursTitle")}</CardTitle>
        <p className="tabular mb-4 text-2xl font-bold tracking-tight">{formatHours(hours.balanceMinutes, locale)}</p>
        {canWrite ? <AddHoursForm action={addHoursAction.bind(null, shareId)} /> : null}
        <ol className="divide-border mt-4 divide-y text-sm">
          {hours.entries.slice(0, 12).map((e) => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="block truncate">{e.note ?? t(`hoursKinds.${e.kind}`)}</span>
                <span className="text-muted text-xs">{format.dateTime(e.createdAt, { dateStyle: "medium" })}</span>
              </span>
              <span className={`tabular shrink-0 font-medium ${e.minutes < 0 ? "text-muted" : "text-success"}`}>
                {e.minutes > 0 ? "+" : "−"}
                {formatHours(Math.abs(e.minutes), locale)}
              </span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
