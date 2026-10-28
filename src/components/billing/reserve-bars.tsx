import { getTranslations } from "next-intl/server";
import { formatMoney } from "@/lib/format";

type Component = {
  component: string;
  balanceCents: number;
  targetCents: number | null;
  targetLabel: string | null;
  covered: number | null;
};

/** One bar per component: the balance, and how much of the job it's saving for is covered. */
export async function ReserveBars({
  components,
  locale,
  shareBp,
}: {
  components: Component[];
  locale: string;
  /** When set, also shows the owner's part of each balance. */
  shareBp?: number;
}) {
  const t = await getTranslations("reserves");
  const cad = (c: number) => formatMoney(c, "CAD", locale);
  const pct = (v: number) =>
    new Intl.NumberFormat(locale.startsWith("en") ? "en-CA" : "fr-CA", { style: "percent" }).format(v);
  return (
    <ul className="flex flex-col gap-5">
      {components.map((c) => (
        <li key={c.component}>
          {/* Name and amount stack on a phone (every row the same, whatever the name's length), side by side above. */}
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <p className="text-sm font-medium">{t(`components.${c.component}`)}</p>
            <p className="tabular text-sm sm:text-right">
              {cad(c.balanceCents)}
              {shareBp ? (
                <span className="text-muted ml-2 text-xs">
                  {t("yourPart", { amount: cad(Math.round((c.balanceCents * shareBp) / 10_000)) })}
                </span>
              ) : null}
            </p>
          </div>
          {c.targetCents ? (
            <>
              <div
                className="bg-surface-muted mt-2 h-1.5 overflow-hidden rounded-full"
                role="progressbar"
                aria-label={t(`components.${c.component}`)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((c.covered ?? 0) * 100)}
              >
                <div className="bg-accent h-full rounded-full" style={{ width: `${(c.covered ?? 0) * 100}%` }} />
              </div>
              <p className="text-muted mt-1.5 text-xs">
                {t("covered", {
                  label: c.targetLabel ?? t(`components.${c.component}`),
                  percent: pct(c.covered ?? 0),
                  target: cad(c.targetCents),
                })}
              </p>
            </>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
