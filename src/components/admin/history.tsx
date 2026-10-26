import { getFormatter, getTranslations } from "next-intl/server";

type Entry = { id: string; action: string; actorName: string | null; createdAt: Date };

/** Recent audit entries for one record, in plain words. */
export async function History({ entries }: { entries: Entry[] }) {
  const t = await getTranslations("audit");
  const format = await getFormatter();
  if (entries.length === 0) return <p className="text-muted text-sm">{t("empty")}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((e) => {
        const key = `actions.${e.action.replace(/\./g, "_")}`;
        return (
          <li key={e.id} className="flex flex-col text-sm sm:flex-row sm:items-baseline sm:gap-3">
            <span className="text-muted tabular shrink-0 text-xs sm:w-40">
              {format.dateTime(e.createdAt, { dateStyle: "medium", timeStyle: "short" })}
            </span>
            <span>
              <span className="font-medium">{e.actorName ?? t("system")}</span> · {t.has(key) ? t(key) : e.action}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
