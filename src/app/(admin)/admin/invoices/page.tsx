import { FileText, Plus, Search } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { InvoiceRowActions } from "@/components/admin/invoice-row-actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { listInvoicesPage } from "@/lib/services/invoices";
import { zonedDay } from "@/lib/time";
import { markPaidAction, voidInvoiceAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("invoices") };
}

const TONE = { issued: "accent", paid: "success", void: "neutral" } as const;

export default async function AdminInvoicesPage({ searchParams }: PageProps<"/admin/invoices">) {
  const viewer = await requireStaff();
  const t = await getTranslations("invoices");
  const format = await getFormatter();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const status = str("status");
  const year = Number(str("year")) || undefined;
  const q = str("q");
  const page = Number(str("page")) || 1;

  if (!can(viewer, "finance:read")) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={FileText} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </>
    );
  }
  const list = await listInvoicesPage(db, viewer, { status, year, q, page });
  const rows = list.rows;
  const canWrite = can(viewer, "finance:write");
  const today = zonedDay(new Date());
  const thisYear = Number(today.slice(0, 4));
  const money = (c: number) => formatMoney(c, "CAD", viewer.locale);
  const pageHref = (p: number) =>
    `/admin/invoices?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}), ...(year ? { year: String(year) } : {}), ...(p > 1 ? { page: String(p) } : {}) })}`;
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });

  return (
    <>
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <DownloadLink
              href={`/admin/invoices/export?${new URLSearchParams({ status, q, ...(year ? { year: String(year) } : {}) })}`}
            >
              {t("exportCsv")}
            </DownloadLink>
            {canWrite ? (
              <Button asChild size="sm">
                <Link href="/admin/invoices/new">
                  <Plus aria-hidden />
                  {t("new")}
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {str("created") ? (
        <div className="mb-4">
          <Alert tone="success">{t("created")}</Alert>
        </div>
      ) : null}
      <dl className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="border-border bg-surface rounded-lg border p-5">
          <dt className="eyebrow">{t("receivable")}</dt>
          <dd className="tabular mt-2 text-2xl font-light tracking-tight">{money(list.receivableCents)}</dd>
          <dd className="text-muted mt-1 text-sm">{t("openCount", { count: list.receivableCount })}</dd>
        </div>
        <div
          className={`rounded-lg border p-5 ${list.overdueCount ? "border-danger/40 bg-danger/8" : "border-border bg-surface"}`}
        >
          <dt className="eyebrow">{t("overdueTotal")}</dt>
          <dd className={`tabular mt-2 text-2xl font-light tracking-tight ${list.overdueCount ? "text-danger" : ""}`}>
            {money(list.overdueCents)}
          </dd>
          <dd className="mt-1 text-sm">
            {list.overdueCount ? (
              <Link href="/admin/invoices?status=overdue" className="text-danger underline underline-offset-4">
                {t("openCount", { count: list.overdueCount })}
              </Link>
            ) : (
              <span className="text-muted">{t("noneOverdue")}</span>
            )}
          </dd>
        </div>
      </dl>
      <form role="search" className="mb-5 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t("searchPlaceholder")}
            aria-label={t("search")}
            className="pl-9"
          />
        </div>
        <Select name="status" defaultValue={status} aria-label={t("status")} className="w-44">
          <option value="">{t("allStatuses")}</option>
          {(["issued", "overdue", "paid", "void"] as const).map((s) => (
            <option key={s} value={s}>
              {s === "overdue" ? t("overdue") : t(`statuses.${s}`)}
            </option>
          ))}
        </Select>
        <Select name="year" defaultValue={year ? String(year) : ""} aria-label={t("year")} className="w-48">
          <option value="">{t("allYears")}</option>
          {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          {t("filter")}
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={FileText} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <ul className="bg-surface divide-border border-border divide-y rounded-lg border">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{r.number}</span>
                  <Badge tone={TONE[r.status]}>{t(`statuses.${r.status}`)}</Badge>
                  {r.overdue ? <Badge tone="danger">{t("overdue")}</Badge> : null}
                </p>
                <p className="text-muted truncate text-sm">
                  {r.registration} · {r.ownerName} · {day(r.issuedOn)}
                  {r.status === "issued" && r.dueOn ? ` · ${t("dueShort", { date: day(r.dueOn) })}` : ""}
                  {r.status === "paid" && r.paidOn ? ` · ${t("paidShort", { date: day(r.paidOn) })}` : ""}
                  {r.status === "void" && r.voidReason ? ` · ${r.voidReason}` : ""}
                </p>
              </div>
              <span
                className={`tabular text-right font-semibold ${r.status === "void" ? "text-muted line-through" : ""}`}
              >
                {formatMoney(r.totalCents, r.currency, viewer.locale)}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {/* One action for every invoice: open it (its page, or the uploaded PDF). */}
                {r.holdingCompanyId ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/admin/invoices/${r.id}`}>{t("open")}</Link>
                  </Button>
                ) : r.fileId ? (
                  <Button asChild size="sm" variant="ghost">
                    <a href={`/files/${r.fileId}?inline=1`} target="_blank" rel="noreferrer">
                      {t("open")}
                    </a>
                  </Button>
                ) : null}
                {canWrite ? (
                  <InvoiceRowActions
                    status={r.status}
                    today={today}
                    markPaid={markPaidAction.bind(null, r.id)}
                    voidAction={voidInvoiceAction.bind(null, r.id)}
                  />
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.pages > 1 ? (
        <nav aria-label={t("pagination")} className="mt-5 flex items-center justify-between gap-3 text-sm">
          {list.page > 1 ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={pageHref(list.page - 1) as Route}>{t("previous")}</Link>
            </Button>
          ) : (
            <span />
          )}
          <span className="text-muted">{t("pageOf", { page: list.page, pages: list.pages })}</span>
          {list.page < list.pages ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={pageHref(list.page + 1) as Route}>{t("next")}</Link>
            </Button>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </>
  );
}
