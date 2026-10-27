import { Clock } from "lucide-react";
import { ProductMark } from "@/components/brand/logo";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { UserMenu } from "@/components/shell/user-menu";
import { requireViewer } from "@/lib/auth/session";

/** Signed in, but not linked to an owner or a staff role yet. */
export default async function PendingPage() {
  const viewer = await requireViewer();
  if (viewer.staffRole || viewer.ownerIds.length > 0) redirect("/start");
  const t = await getTranslations("pending");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-16 items-center justify-between px-4 sm:px-6">
        <ProductMark />
        <UserMenu name={viewer.name} email={viewer.email} />
      </header>
      <main className="flex flex-1 flex-col items-center justify-center px-4 pb-16 text-center">
        <div className="bg-surface-muted text-muted mb-5 flex size-12 items-center justify-center rounded-full">
          <Clock className="size-5" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="text-muted mt-2 max-w-md text-sm">{t("body", { email: viewer.email })}</p>
      </main>
    </div>
  );
}
