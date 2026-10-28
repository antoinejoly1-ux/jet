import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AuthFrame } from "@/components/auth/auth-frame";
import { TeamFaces } from "@/components/brand/team";
import { ContactButtons } from "@/components/common/contact-buttons";
import { UserMenu } from "@/components/shell/user-menu";
import { requireViewer } from "@/lib/auth/session";

/** Signed in, but not linked to an owner or a staff role yet. */
export default async function PendingPage() {
  const viewer = await requireViewer();
  if (viewer.staffRole || viewer.ownerIds.length > 0) redirect("/start");
  const t = await getTranslations("pending");
  return (
    <AuthFrame corner={<UserMenu name={viewer.name} email={viewer.email} image={viewer.image} />}>
      <div className="flex flex-col gap-6">
        <TeamFaces />
        <div>
          <h1 className="text-[2rem] leading-tight font-light tracking-tight">{t("title")}</h1>
          <p className="text-muted mt-3 text-sm leading-relaxed">{t("body", { email: viewer.email })}</p>
        </div>
        <ContactButtons />
        <p className="text-muted text-xs">
          {t("delay")}{" "}
          <Link href="/start" className="text-accent font-medium underline-offset-4 hover:underline">
            {t("refresh")}
          </Link>
        </p>
      </div>
    </AuthFrame>
  );
}
