import { ClipboardList } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import { shareOptions } from "@/components/admin/share-options";
import { AddTransactionForm, ReverseButton } from "@/components/admin/transaction-forms";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import { can } from "@/lib/auth/policy";
import { requireStaff } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { listCategories, listTransactions } from "@/lib/services/ledger";
import { addTransactionAction, reverseTransactionAction } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("nav.items"))("transactions") };
}

export default async function TransactionsPage({ searchParams }: PageProps<"/admin/transactions">) {
  const viewer = await requireStaff();
  const t = await getTranslations("transactions");
  if (!can(viewer, "finance:read")) {
    return (
      <>
        <PageHeader title={t("title")} />
        <EmptyState icon={ClipboardList} title={t("noAccessTitle")} body={t("noAccessBody")} />
      </>
    );
  }
  const locale = await getLocale();
  const format = await getFormatter();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const shareId = str("share");
  const kind = str("kind");
  const thisYear = new Date().getFullYear();
  const year = Number(str("year")) || thisYear;

  const [rows, shares, categories] = await Promise.all([
    listTransactions(db, viewer, { shareId: shareId || undefined, year, kind }),
    shareOptions(viewer, { includeEnded: true }),
    listCategories(db),
  ]);
  const shareLabel = new Map(shares.map((s) => [s.id, s.label]));
  const day = (iso: string) => format.dateTime(new Date(`${iso}T12:00:00`), { dateStyle: "medium" });
  const canWrite = can(viewer, "finance:write");

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <form className="mb-4 flex flex-wrap gap-2">
            <Select name="share" defaultValue={shareId} aria-label={t("share")} className="min-w-56 flex-1">
              <option value="">{t("allShares")}</option>
              {shares.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select name="year" defaultValue={String(year)} aria-label={t("year")} className="w-28">
              {[thisYear, thisYear - 1, thisYear - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
            <Select name="kind" defaultValue={kind} aria-label={t("kind")} className="w-36">
              <option value="">{t("allKinds")}</option>
              {(["cost", "revenue", "payment"] as const).map((k) => (
                <option key={k} value={k}>
                  {t(`kinds.${k}`)}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              {t("filter")}
            </Button>
          </form>
          {rows.length === 0 ? (
            <EmptyState icon={ClipboardList} title={t("emptyTitle")} body={t("emptyBody")} />
          ) : (
            <ul className="border-border bg-surface divide-border divide-y rounded-lg border">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {r.description ?? (locale === "en" ? r.categoryEn : r.categoryFr) ?? t(`kinds.${r.kind}`)}
                      {r.source === "import" ? <Badge>{t("imported")}</Badge> : null}
                      {r.reversesId ? <Badge tone="warning">{t("reversal")}</Badge> : null}
                      {r.reversedById ? <Badge>{t("reversed")}</Badge> : null}
                    </p>
                    <p className="text-muted truncate text-xs">
                      {day(r.occurredOn)} · {t(`kinds.${r.kind}`)}
                      {r.categoryFr ? ` · ${locale === "en" ? r.categoryEn : r.categoryFr}` : ""} ·{" "}
                      {shareLabel.get(r.shareId)}
                    </p>
                  </div>
                  <span
                    className={`tabular font-semibold ${r.amountCents < 0 ? "text-muted" : ""} ${r.reversedById ? "line-through" : ""}`}
                  >
                    {formatMoney(r.amountCents, r.currency, locale)}
                  </span>
                  {canWrite && !r.reversesId && !r.reversedById ? (
                    <ReverseButton action={reverseTransactionAction.bind(null, r.id)} />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
        {canWrite ? (
          <Card className="self-start">
            <CardTitle className="mb-4">{t("newEntry")}</CardTitle>
            <AddTransactionForm
              action={addTransactionAction}
              shares={shares}
              defaultShareId={shareId || undefined}
              categories={categories.map((c) => ({ id: c.id, label: locale === "en" ? c.nameEn : c.nameFr }))}
            />
            <p className="text-muted mt-4 text-xs">{t("ledgerRule")}</p>
          </Card>
        ) : null}
      </div>
    </>
  );
}
