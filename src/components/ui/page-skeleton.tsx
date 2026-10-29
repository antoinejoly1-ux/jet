import { getTranslations } from "next-intl/server";
import { Skeleton } from "./skeleton";

/**
 * What a page looks like while it loads: an eyebrow and a light title, a hero
 * band, a strip of readings and a few hairline rows. Calm, with no spinner.
 */
export async function PageSkeleton({ hero = false }: { hero?: boolean }) {
  const t = await getTranslations("common");
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-10">
      <span className="sr-only">{t("loading")}</span>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-10 w-2/3 max-w-lg" />
      </div>
      {hero ? <Skeleton className="h-[420px] rounded-[28px] lg:h-[560px]" /> : null}
      <div className="border-border grid grid-cols-2 border-y lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-3 py-7 pr-6">
            <Skeleton className="h-2.5 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        ))}
      </div>
      <div className="border-border divide-border divide-y rounded-lg border">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 px-6 py-5">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
