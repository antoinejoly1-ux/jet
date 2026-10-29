import { ChevronRight, KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { getFormatter, getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { replayTourAction } from "@/app/actions/profile";
import { AnimatedIcon } from "@/components/animated-icons/AnimatedIcon";
import { AvatarPicker } from "@/components/account/avatar-picker";
import { EmailPreferencesForm } from "@/components/account/email-preferences-form";
import { PrivacyRequestForm } from "@/components/account/privacy-request-form";
import { ProfileForm } from "@/components/account/profile-form";
import { SettingsNav } from "@/components/account/settings-nav";
import { ThemePicker } from "@/components/account/theme-picker";
import { TeamFaces } from "@/components/brand/team";
import { ContactButtons } from "@/components/common/contact-buttons";
import { initials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DownloadLink } from "@/components/ui/download-link";
import { PageHeader } from "@/components/ui/page-header";
import { requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { scenes } from "@/lib/imagery";
import { listSignInMethods } from "@/lib/services/account";
import { getEmailPreferences } from "@/lib/services/notification-center";
import { listMyPrivacyRequests, RESPONSE_DAYS } from "@/lib/services/privacy";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { privacyRequestAction, saveEmailPreferencesAction, setLocaleAction, setThemeAction } from "./actions";
import { lang } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("settingsTitle") };
}

/** One settings section: a light title and a line of context, then its content on a hairline panel. */
function Section({
  id,
  title,
  body,
  children,
  bare = false,
}: {
  id: string;
  title: string;
  body?: ReactNode;
  children: ReactNode;
  bare?: boolean;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <h2 id={`${id}-title`} className="text-2xl font-light tracking-tight">
        {title}
      </h2>
      {body ? <p className="text-muted mt-1.5 max-w-xl text-sm leading-relaxed">{body}</p> : null}
      <div className={cn("mt-5", !bare && "border-border bg-surface rounded-lg border")}>{children}</div>
    </section>
  );
}

/** A hairline row: what it is on the left, its state or control on the right. */
function Row({
  icon,
  label,
  hint,
  children,
}: {
  icon?: ReactNode;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="border-border flex flex-col gap-3 border-b px-6 py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-7">
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <span className="text-muted mt-0.5">{icon}</span> : null}
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          {hint ? <div className="text-muted mt-0.5 text-sm">{hint}</div> : null}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export default async function AccountPage() {
  const viewer = await requireViewer();
  const t = await getTranslations("account");
  const tw = await getTranslations("welcome.settings");
  const locale = lang(await getLocale());
  const format = await getFormatter();
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  const readOnly = Boolean(viewer.viewingAs);
  const [methods, emails, requests] = await Promise.all([
    listSignInMethods(db, viewer.id),
    viewer.ownerIds.length && !readOnly ? getEmailPreferences(db, viewer) : Promise.resolve(null),
    listMyPrivacyRequests(db, viewer),
  ]);
  const [first = "", ...rest] = viewer.name.trim().split(/\s+/);

  const sections = [
    { id: "profile", title: t("sections.profile") },
    { id: "appearance", title: t("sections.appearance") },
    { id: "security", title: t("sections.security") },
    ...(emails ? [{ id: "notifications", title: t("sections.notifications") }] : []),
    ...(!readOnly ? [{ id: "privacy", title: t("sections.privacy") }] : []),
    { id: "team", title: t("sections.team") },
  ];

  return (
    <>
      <PageHeader eyebrow={t("title")} title={t("settingsTitle")} description={t("settingsBody")} />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-14">
        <SettingsNav label={t("sectionsLabel")} sections={sections} />

        <div className="flex max-w-3xl min-w-0 flex-col gap-14">
          <Section id="profile" title={t("sections.profile")} body={t("profileBody")} bare>
            <div className="border-border bg-surface overflow-hidden rounded-lg border">
              <div className="flex flex-col gap-8 px-6 py-7 sm:flex-row sm:items-start sm:px-7">
                <div className="relative">
                  {readOnly ? (
                    <div className="border-border bg-surface-muted flex size-28 items-center justify-center rounded-full border text-3xl font-light">
                      {initials(viewer.name)}
                    </div>
                  ) : (
                    <AvatarPicker initialImage={viewer.image} initials={initials(viewer.name)} size="md" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-6">
                  <ProfileForm firstName={first} lastName={rest.join(" ")} disabled={readOnly} />
                  <dl className="border-border grid gap-x-6 gap-y-3 border-t pt-5 text-sm sm:grid-cols-[120px_1fr]">
                    <dt className="text-muted">{t("email")}</dt>
                    <dd className="font-medium break-all">{viewer.email}</dd>
                    <dt className="text-muted">{t("signInMethods")}</dt>
                    <dd className="flex flex-wrap gap-2">
                      {methods.map((m) => (
                        <Badge key={m}>{t(`methods.${m === "google" ? "google" : "credential"}`)}</Badge>
                      ))}
                      <Badge>{t("methods.magicLink")}</Badge>
                    </dd>
                  </dl>
                  {readOnly ? (
                    <p className="text-muted text-xs">{t("readOnly")}</p>
                  ) : (
                    <form
                      action={replayTourAction}
                      className="border-border flex flex-wrap items-center gap-3 border-t pt-5"
                    >
                      <Button type="submit" variant="secondary" size="sm" className="ai-trigger">
                        <AnimatedIcon name="bulb" size={16} />
                        {tw("replayTour")}
                      </Button>
                      <span className="text-muted text-xs">{tw("replayTourBody")}</span>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section id="appearance" title={t("sections.appearance")} body={t("appearanceBody")}>
            <div className="border-border border-b px-6 py-6 sm:px-7">
              <p className="mb-4 text-sm font-medium">{t("theme")}</p>
              <ThemePicker current={theme} action={setThemeAction} />
            </div>
            <Row label={t("language")}>
              <form action={setLocaleAction} className="border-border flex rounded-full border p-1">
                {(["fr", "en"] as const).map((l) => (
                  <button
                    key={l}
                    type="submit"
                    name="locale"
                    value={l}
                    aria-pressed={locale === l}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm transition-colors",
                      locale === l ? "bg-text text-background font-medium" : "text-muted hover:text-text",
                    )}
                  >
                    {t(`languages.${l}`)}
                  </button>
                ))}
              </form>
            </Row>
          </Section>

          <Section id="security" title={t("sections.security")} body={t("securityBody")}>
            <Row
              icon={<ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden />}
              label={t("twoFactor")}
              hint={viewer.twoFactorEnabled ? t("twoFactorOn") : t("twoFactorOff")}
            >
              <Button asChild variant="secondary" size="sm">
                <Link href="/account/security">
                  {viewer.twoFactorEnabled ? t("manage") : t("enable")}
                  <ChevronRight aria-hidden />
                </Link>
              </Button>
            </Row>
            {methods.includes("credential") ? (
              <Row
                icon={<KeyRound className="size-4" strokeWidth={1.5} aria-hidden />}
                label={t("password")}
                hint={t("passwordHint")}
              >
                <Button asChild variant="secondary" size="sm">
                  <Link href="/forgot-password">{t("changePassword")}</Link>
                </Button>
              </Row>
            ) : null}
          </Section>

          {emails ? (
            <Section id="notifications" title={t("sections.notifications")} body={t("emailsBody")}>
              <div className="px-6 py-5 sm:px-7">
                <EmailPreferencesForm action={saveEmailPreferencesAction} preferences={emails} disabled={readOnly} />
              </div>
            </Section>
          ) : null}

          {!readOnly ? (
            <Section
              id="privacy"
              title={t("sections.privacy")}
              body={t.rich("privacyBody", {
                days: RESPONSE_DAYS,
                policy: (chunks) => (
                  <Link href="/privacy" className="text-accent font-medium underline underline-offset-4">
                    {chunks}
                  </Link>
                ),
              })}
            >
              <Row label={t("privacyTitle")}>
                <DownloadLink href="/account/data-export">{t("downloadData")}</DownloadLink>
              </Row>
              <div className="px-6 py-5 sm:px-7">
                <PrivacyRequestForm action={privacyRequestAction} />
                {requests.length ? (
                  <ul className="border-border mt-5 flex flex-col border-t text-sm">
                    {requests.map((r) => (
                      <li key={r.id} className="border-border border-b py-3 last:border-b-0">
                        <p className="font-medium">
                          {t(`privacyKinds.${r.kind}`)} · {t(`privacyStatuses.${r.status}`)}
                        </p>
                        <p className="text-muted text-xs">{format.dateTime(r.createdAt, { dateStyle: "medium" })}</p>
                        {r.response ? <p className="mt-1">{r.response}</p> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </Section>
          ) : null}

          <Section id="team" title={t("sections.team")} bare>
            <div className="theme-dark relative overflow-hidden rounded-lg">
              <Image
                src={scenes.toast}
                alt=""
                fill
                sizes="(min-width: 1024px) 768px, 100vw"
                placeholder="blur"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" aria-hidden />
              <div className="relative flex flex-col gap-6 p-7 text-white sm:p-10">
                <TeamFaces />
                <p className="max-w-md text-xl leading-snug font-light sm:text-2xl">{t("teamBody")}</p>
                <ContactButtons />
              </div>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
