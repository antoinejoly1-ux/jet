"use client";

import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import Image, { type StaticImageData } from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { finishWelcomeAction, saveProfileAction } from "@/app/actions/profile";
import { AvatarPicker } from "@/components/account/avatar-picker";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import type { WelcomeAudience } from "@/lib/auth/welcome";
import { scenes, type Scene } from "@/lib/imagery";
import { cn } from "@/lib/utils";

const STEPS = ["welcome", "name", "tour", "team", "ready"] as const;
type Step = (typeof STEPS)[number];

/** What the platform holds for each kind of person, one photograph each. */
const TOURS: Record<WelcomeAudience, { key: string; scene: Scene; finance?: boolean }[]> = {
  owner: [
    { key: "live", scene: "cockpit" },
    { key: "hours", scene: "rampDusk" },
    { key: "finances", scene: "cabinDoor", finance: true },
    { key: "flights", scene: "boarding" },
  ],
  staff: [
    { key: "todo", scene: "hangarBright" },
    { key: "fleet", scene: "hangar" },
    { key: "ops", scene: "hangarCrew" },
    { key: "billing", scene: "terminal", finance: true },
  ],
  pilot: [
    { key: "report", scene: "cockpit" },
    { key: "receipts", scene: "pilot" },
    { key: "returned", scene: "hangarPilot" },
  ],
  manager: [
    { key: "approved", scene: "terminal" },
    { key: "taxes", scene: "cabinDoor" },
    { key: "results", scene: "rampDusk" },
  ],
};

const STEP_SCENE: Record<Exclude<Step, "tour" | "ready">, Scene> = {
  welcome: "hangar",
  name: "cabinWindow",
  team: "hangarCrew",
};

export function WelcomeFlow({
  firstName: initialFirst,
  lastName: initialLast,
  locale: initialLocale,
  image,
  audience,
  needsTwoFactor,
  seesFinances,
  aircraft,
  finalPhoto,
  team,
  contact,
}: {
  firstName: string;
  lastName: string;
  locale: "fr" | "en";
  image: string | null;
  audience: WelcomeAudience;
  /** Staff and pilots who still have to set up a sign-in code: the last step says so. */
  needsTwoFactor: boolean;
  seesFinances: boolean;
  aircraft: { registration: string; model: string } | null;
  finalPhoto: StaticImageData;
  team: ReactNode;
  contact: ReactNode;
}) {
  const t = useTranslations("welcome");
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [slide, setSlide] = useState(0);
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [locale, setLocale] = useState(initialLocale);
  const [avatar, setAvatar] = useState<string | null>(image);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const tour = TOURS[audience].filter((s) => !s.finance || seesFinances);
  /** The team and pilots work with the people shown; owners and managers are served by them. */
  const colleague = audience === "staff" || audience === "pilot";
  const tk = (key: string) => (audience === "owner" ? key : `${key}${audience[0]!.toUpperCase()}${audience.slice(1)}`);
  const index = STEPS.indexOf(step);
  const go = (to: Step) => {
    setError(null);
    setStep(to);
    window.scrollTo({ top: 0 });
  };
  const next = () => go(STEPS[Math.min(STEPS.length - 1, index + 1)]!);
  const back = () => (step === "tour" && slide > 0 ? setSlide((s) => s - 1) : go(STEPS[Math.max(0, index - 1)]!));

  // Arrow keys move through the tour's slides.
  useEffect(() => {
    if (step !== "tour") return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowRight") setSlide((s) => Math.min(tour.length - 1, s + 1));
      if (e.key === "ArrowLeft") setSlide((s) => Math.max(0, s - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step, tour.length]);

  const photo: StaticImageData =
    step === "tour" ? scenes[tour[slide]!.scene] : step === "ready" ? finalPhoto : scenes[STEP_SCENE[step]];

  function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!first.trim()) {
      setError(t("name.required"));
      return;
    }
    startTransition(async () => {
      const result = await saveProfileAction({ firstName: first, lastName: last, locale });
      if (result.status === "error") setError(t("name.failed"));
      else next();
    });
  }

  function chooseLocale(l: "fr" | "en") {
    setLocale(l);
    // The whole tour switches language at once.
    startTransition(async () => {
      await saveProfileAction({ firstName: first || initialFirst || "—", lastName: last, locale: l });
      router.refresh();
    });
  }

  return (
    <div className="bg-background text-text flex min-h-dvh flex-col lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      {/* The photograph: full height beside the content on desktop, a band on top on phones. */}
      <div
        className={cn(
          "relative overflow-hidden lg:sticky",
          // On a phone the band shrinks on the steps with a form or a list, so their button stays in view.
          step === "welcome" || step === "ready" ? "h-[38vh] min-h-64" : "h-[24vh] min-h-44",
          "lg:top-0 lg:m-4 lg:h-[calc(100dvh-2rem)] lg:min-h-0 lg:rounded-[28px]",
        )}
      >
        <div className="absolute inset-0">
          <Image
            key={photo.src}
            src={photo}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            placeholder="blur"
            className="animate-ken-burns animate-photo-in object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/30" aria-hidden />
        <div className="absolute inset-x-6 top-6 flex justify-center lg:justify-start">
          <span className="flex flex-col items-center gap-1 text-white lg:items-start">
            <Logo className="h-5 w-auto" title="Univair Management" />
            <span aria-hidden className="text-[8px] font-medium tracking-[0.55em] text-white/70 uppercase">
              Management
            </span>
          </span>
        </div>
        {step === "tour" ? (
          <p
            key={slide}
            className="animate-rise absolute inset-x-6 bottom-5 text-white sm:bottom-6 lg:inset-x-10 lg:bottom-10"
          >
            <span className="block max-w-md text-xl font-light sm:text-2xl lg:text-4xl">
              {t(`tour.${tour[slide]!.key}.caption`)}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col px-6 py-8 sm:px-12 lg:min-h-dvh lg:py-12">
        {/* Progress: thin segments, one per step; "Passer" goes straight to the end. */}
        <div className="flex items-center gap-4">
          <ol className="flex flex-1 gap-1.5" aria-label={t("progress", { n: index + 1, total: STEPS.length })}>
            {STEPS.map((s, i) => (
              <li
                key={s}
                className={cn(
                  "h-0.5 flex-1 rounded-full transition-colors duration-500",
                  i <= index ? "bg-accent" : "bg-border",
                )}
              />
            ))}
          </ol>
          {/* Not on the name step: skipping there would silently drop what was typed. */}
          {step !== "welcome" && step !== "name" && step !== "ready" ? (
            <button
              type="button"
              onClick={() => go("ready")}
              className="text-muted hover:text-text -my-2 h-11 shrink-0 px-2 text-sm"
            >
              {t("skip")}
            </button>
          ) : null}
        </div>

        <div key={step} className="animate-rise flex flex-1 flex-col justify-center py-10 lg:py-16">
          {step === "welcome" ? (
            <div className="max-w-md">
              <p className="eyebrow">{t("welcome.eyebrow")}</p>
              <h1 className="mt-4 text-5xl leading-[1.02] font-light tracking-[-0.03em] sm:text-6xl">
                {t(tk("welcome.title") as "welcome.title", { name: initialFirst })}
              </h1>
              <p className="text-muted mt-6 text-lg leading-relaxed font-light">
                {t(tk("welcome.body") as "welcome.body")}
              </p>
              <p className="text-muted mt-3 text-sm">{t("welcome.time")}</p>
              <Button className="mt-10" size="lg" onClick={next}>
                {t("welcome.start")}
                <ArrowRight aria-hidden />
              </Button>
            </div>
          ) : null}

          {step === "name" ? (
            <form onSubmit={saveName} className="flex max-w-md flex-col gap-6" noValidate>
              <div>
                <p className="eyebrow">{t("name.eyebrow")}</p>
                <h1 className="mt-4 text-4xl leading-tight font-light tracking-tight sm:text-5xl">{t("name.title")}</h1>
                <p className="text-muted mt-4 font-light">{t("name.body")}</p>
              </div>
              {/* The face first: the team will recognize them. A photo is optional. */}
              <AvatarPicker
                initialImage={avatar}
                initials={`${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()}
                onSaved={setAvatar}
                size="md"
                align="start"
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="firstName"
                  label={t("name.first")}
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  autoComplete="given-name"
                  autoFocus
                  required
                  error={error ?? undefined}
                />
                <Field
                  id="lastName"
                  label={t("name.last")}
                  value={last}
                  onChange={(e) => setLast(e.target.value)}
                  autoComplete="family-name"
                />
              </div>
              <fieldset>
                <legend className="text-muted mb-2 text-xs font-medium tracking-[0.04em]">{t("name.language")}</legend>
                <div className="border-border inline-flex rounded-full border p-1">
                  {(["fr", "en"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={locale === l}
                      onClick={() => chooseLocale(l)}
                      className="text-muted aria-pressed:bg-primary aria-pressed:text-primary-foreground h-9 rounded-full px-5 text-sm transition-colors"
                    >
                      {l === "fr" ? "Français" : "English"}
                    </button>
                  ))}
                </div>
              </fieldset>
              <Nav onBack={back} pending={pending} submit label={t("continue")} backLabel={t("back")} />
            </form>
          ) : null}

          {step === "tour" ? (
            <div className="flex max-w-md flex-col gap-8">
              <div key={slide} className="animate-rise">
                <p className="eyebrow">{t(colleague ? "tour.eyebrowStaff" : "tour.eyebrow")}</p>
                <h1 className="mt-4 text-4xl leading-tight font-light tracking-tight sm:text-5xl">
                  {t(`tour.${tour[slide]!.key}.title`)}
                </h1>
                <p className="text-muted mt-4 text-lg font-light">{t(`tour.${tour[slide]!.key}.body`)}</p>
                <ul className="mt-6 flex flex-col gap-3">
                  {(["a", "b"] as const).map((k) => (
                    <li key={k} className="flex items-start gap-3 text-sm">
                      <span className="border-accent/50 text-accent mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border">
                        <Check className="size-3" strokeWidth={2} aria-hidden />
                      </span>
                      {t(`tour.${tour[slide]!.key}.${k}`)}
                    </li>
                  ))}
                </ul>
              </div>
              <Nav
                onBack={back}
                onNext={() => (slide < tour.length - 1 ? setSlide((s) => s + 1) : next())}
                label={slide < tour.length - 1 ? t("next") : t("continue")}
                backLabel={t("back")}
              />
            </div>
          ) : null}

          {step === "team" ? (
            <div className="flex max-w-xl flex-col gap-8">
              <div>
                <p className="eyebrow">{t(colleague ? "team.eyebrowStaff" : "team.eyebrow")}</p>
                <h1 className="mt-4 text-4xl leading-tight font-light tracking-tight sm:text-5xl">
                  {t(colleague ? "team.titleStaff" : "team.title")}
                </h1>
                <p className="text-muted mt-4 text-lg font-light">{t(colleague ? "team.bodyStaff" : "team.body")}</p>
              </div>
              {team}
              {colleague ? null : (
                <div className="flex flex-col gap-3">
                  {contact}
                  <p className="text-muted text-sm">{t("team.inApp")}</p>
                </div>
              )}
              <Nav onBack={back} onNext={next} label={t("continue")} backLabel={t("back")} />
            </div>
          ) : null}

          {step === "ready" ? (
            <form action={finishWelcomeAction} className="flex max-w-md flex-col gap-8">
              <div className="border-accent/60 relative size-28 overflow-hidden rounded-full border-2">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatar} alt="" className="size-full object-cover" />
                ) : (
                  <span className="bg-surface-muted flex size-full items-center justify-center text-3xl font-light">
                    {`${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="eyebrow">{t("ready.eyebrow")}</p>
                <h1 className="mt-4 text-5xl leading-[1.02] font-light tracking-[-0.03em] sm:text-6xl">
                  {t("ready.title", { name: first || initialFirst })}
                </h1>
                <p className="text-muted mt-5 text-lg font-light">
                  {needsTwoFactor
                    ? t("ready.bodySecurity")
                    : audience === "owner" && aircraft
                      ? t("ready.bodyAircraft", { registration: aircraft.registration })
                      : t(tk("ready.body") as "ready.body")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <EnterButton label={needsTwoFactor ? t("ready.secure") : t(tk("ready.enter") as "ready.enter")} />
                {audience === "owner" && aircraft ? (
                  <Button type="submit" name="then" value="request" variant="secondary" size="lg">
                    {t("ready.request")}
                  </Button>
                ) : null}
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Nav({
  onBack,
  onNext,
  label,
  backLabel,
  pending = false,
  submit = false,
  quiet = false,
}: {
  onBack: () => void;
  onNext?: () => void;
  label: string;
  backLabel: string;
  pending?: boolean;
  submit?: boolean;
  quiet?: boolean;
}) {
  return (
    // On a phone the buttons stay at the foot of the screen, clear of the home indicator.
    <div className="bg-background sticky bottom-0 z-10 -mx-6 flex items-center gap-3 px-6 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-2 sm:pb-0 sm:backdrop-blur-none">
      <Button type="button" variant="ghost" onClick={onBack} aria-label={backLabel}>
        <ArrowLeft aria-hidden />
      </Button>
      <Button
        type={submit ? "submit" : "button"}
        variant={quiet ? "secondary" : "primary"}
        onClick={onNext}
        disabled={pending}
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {label}
        {pending ? null : <ArrowRight aria-hidden />}
      </Button>
    </div>
  );
}

function EnterButton({ label }: { label: string }) {
  const [entering, setEntering] = useState(false);
  return (
    <Button type="submit" size="lg" onClick={() => setEntering(true)} className="self-start">
      {entering ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {label}
      {entering ? null : <ArrowRight aria-hidden />}
    </Button>
  );
}
