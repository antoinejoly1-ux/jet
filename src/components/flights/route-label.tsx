import { placeName } from "@/lib/airports";

/**
 * A route as people say it, « Saint-Hubert → Québec », with the ICAO codes
 * quietly after for those who think in codes. Server only (the airport list
 * stays on the server).
 */
export function RouteLabel({ from, to, codes = true }: { from: string; to: string; codes?: boolean }) {
  return (
    <>
      {placeName(from)} <span className="text-muted">→</span> {placeName(to)}
      {codes ? (
        <>
          {" "}
          <span className="text-muted inline-block text-[0.75em] font-normal tracking-wide whitespace-nowrap">
            {from} → {to}
          </span>
        </>
      ) : null}
    </>
  );
}

/** The plain-text form, for titles and labels. */
export const routeText = (from: string, to: string) => `${placeName(from)} → ${placeName(to)}`;
