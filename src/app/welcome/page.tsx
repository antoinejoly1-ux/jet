import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { TeamGallery } from "@/components/brand/team";
import { ContactButtons } from "@/components/common/contact-buttons";
import { aircraftPhoto } from "@/lib/aircraft-photos";
import { financeOwnerIds } from "@/lib/auth/policy";
import { needsWelcome, requireViewer } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { scenes } from "@/lib/imagery";
import { listOwnerAircraft } from "@/lib/services/availability";
import { WelcomeFlow } from "./welcome-flow";
import { lang } from "@/lib/locale";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("welcome"))("metaTitle") };
}

/** The welcome tour, once, for everyone: name, photo, what's inside, the team, and in. */
export default async function WelcomePage() {
  const viewer = await requireViewer();
  if (!needsWelcome(viewer)) redirect("/start");
  const [first, ...rest] = viewer.name.trim().split(/\s+/);
  const planes = viewer.ownerIds.length ? await listOwnerAircraft(db, viewer) : [];
  const plane = planes[0];
  return (
    <WelcomeFlow
      firstName={first ?? ""}
      lastName={rest.join(" ")}
      locale={lang(await getLocale())}
      image={viewer.image}
      seesFinances={Boolean(viewer.staffRole) || financeOwnerIds(viewer).length > 0}
      aircraft={plane ? { registration: plane.registration, model: plane.model } : null}
      finalPhoto={
        plane ? (/pc-?12/i.test(plane.model) ? scenes.hangarPilot : aircraftPhoto(plane.model)) : scenes.hangar
      }
      team={<TeamGallery />}
      contact={<ContactButtons />}
    />
  );
}
