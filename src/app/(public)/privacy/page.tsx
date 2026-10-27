import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { env } from "@/lib/env";

/** The date the policy text last changed. Update it with the text. */
const POLICY_UPDATED = "2026-10-26";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("privacyPolicy"))("title") };
}

type Section = { title: string; items: string[] };

export default async function PrivacyPage() {
  const t = await getTranslations("privacyPolicy");
  const format = await getFormatter();
  const sections = t.raw("sections") as Section[];
  const operator = env.OPERATOR_LEGAL_NAME || "Univair";

  return (
    <article className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted mt-2 text-sm">
          {t("updated", { date: format.dateTime(new Date(`${POLICY_UPDATED}T12:00:00`), { dateStyle: "long" }) })}
        </p>
        <p className="mt-4 leading-relaxed">{t("intro", { operator })}</p>
      </header>

      <section
        aria-labelledby="officer"
        className="bg-surface shadow-card rounded-lg border border-(--card-border) p-5"
      >
        <h2 id="officer" className="font-semibold">
          {t("officerTitle")}
        </h2>
        <p className="mt-1 text-sm leading-relaxed">
          {env.PRIVACY_OFFICER_NAME && env.PRIVACY_OFFICER_EMAIL
            ? t.rich("officerBody", {
                officer: env.PRIVACY_OFFICER_NAME,
                email: env.PRIVACY_OFFICER_EMAIL,
                mail: (chunks) => (
                  <a href={`mailto:${env.PRIVACY_OFFICER_EMAIL}`} className="text-accent font-medium underline">
                    {chunks}
                  </a>
                ),
              })
            : t("officerMissing")}
        </p>
      </section>

      {sections.map((s, i) => (
        <section key={i} aria-labelledby={`s-${i}`}>
          <h2 id={`s-${i}`} className="text-lg font-bold tracking-tight">
            {s.title}
          </h2>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 leading-relaxed">
            {s.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </section>
      ))}

      <p>
        <Link href="/account#privacy" className="text-accent font-medium underline">
          {t("requestCta")}
        </Link>
      </p>
    </article>
  );
}
