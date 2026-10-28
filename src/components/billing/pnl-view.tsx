import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";
import type { getCompanyPnl } from "@/lib/services/pnl";
import { cn } from "@/lib/utils";

type Pnl = Awaited<ReturnType<typeof getCompanyPnl>>;

/** A company's year: what it billed, what it paid, the result, and its reserves. */
export async function PnlView({ pnl, locale }: { pnl: Pnl; locale: string }) {
  const t = await getTranslations("pnl");
  const cad = (c: number) => formatMoney(c, "CAD", locale);
  const positive = pnl.resultCents >= 0;
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure label={t("revenue")} value={cad(pnl.revenueCents)} />
        <Figure label={t("expenses")} value={cad(pnl.expensesCents)} />
        <Figure
          label={t("result")}
          value={cad(pnl.resultCents)}
          hint={positive ? t("surplus") : t("deficit")}
          tone={positive ? "text-success" : "text-danger"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Table title={t("revenue")} total={cad(pnl.revenueCents)} totalLabel={t("totalRevenue")}>
          {pnl.revenue
            .filter((r) => r.cents !== 0 || r.key !== "uploaded")
            .map((r) => (
              <Row
                key={r.key}
                label={
                  r.key === "uploaded" && pnl.uploadedIncludesTaxes
                    ? `${t("revenueLines.uploaded")} ${t("taxesIncluded")}`
                    : t(`revenueLines.${r.key}`)
                }
                value={cad(r.cents)}
              />
            ))}
        </Table>
        <Table title={t("expenses")} total={cad(pnl.expensesCents)} totalLabel={t("totalExpenses")}>
          {pnl.expenses.length === 0 ? (
            <li className="text-muted py-2.5 text-sm">{t("noExpenses")}</li>
          ) : (
            pnl.expenses.map((e) => <Row key={e.key} label={t(`expenseLines.${e.key}`)} value={cad(e.cents)} />)
          )}
        </Table>
      </div>

      <section className="border-border bg-surface rounded-lg border p-6">
        <h3 className="text-lg font-light tracking-tight">{t("reservesTitle")}</h3>
        <p className="text-muted mt-1 text-sm">{t("reservesBody")}</p>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-muted text-xs">{t("setAside", { year: pnl.year })}</dt>
            <dd className="tabular mt-1 text-xl font-light">{cad(pnl.reserves.setAsideCents)}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("spent", { year: pnl.year })}</dt>
            <dd className="tabular mt-1 text-xl font-light">{cad(pnl.reserves.spentCents)}</dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("balance")}</dt>
            <dd className="tabular mt-1 text-xl font-light">{cad(pnl.reserves.balanceCents)}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="border-border bg-surface rounded-lg border p-6">
      <p className="eyebrow">{label}</p>
      <p className={cn("tabular mt-3 text-3xl font-light tracking-tight", tone)}>{value}</p>
      {hint ? <p className="text-muted mt-1 text-sm">{hint}</p> : null}
    </div>
  );
}

function Table({
  title,
  total,
  totalLabel,
  children,
}: {
  title: string;
  total: string;
  totalLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-surface rounded-lg border p-6">
      <h3 className="mb-2 text-lg font-light tracking-tight">{title}</h3>
      <ul className="divide-border divide-y">{children}</ul>
      <p className="border-border mt-2 flex justify-between border-t pt-3 font-medium">
        <span>{totalLabel}</span>
        <span className="tabular">{total}</span>
      </p>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular">{value}</span>
    </li>
  );
}
