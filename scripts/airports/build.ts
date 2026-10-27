/**
 * Builds src/lib/data/airports.json from OurAirports (public domain): every
 * large and medium airport with a four-letter ICAO code, plus Canada's small
 * aerodromes. Re-run with `pnpm airports:build` to refresh it.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";

const SOURCE = "https://davidmegginson.github.io/ourairports-data/airports.csv";

type Row = Record<string, string>;

async function main() {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`OurAirports: HTTP ${res.status}`);
  const { data } = Papa.parse<Row>(await res.text(), { header: true, skipEmptyLines: true });
  const airports: [string, string, string, number, number][] = [];
  const seen = new Set<string>();
  for (const r of data) {
    // An airport can go by more than one code (KPBI is now also KDJT): keep each.
    const codes = [...new Set([r.icao_code, r.gps_code, r.ident].map((c) => (c ?? "").trim()))].filter(
      (c) => /^[A-Z]{4}$/.test(c) && !seen.has(c),
    );
    if (codes.length === 0) continue;
    const code = codes[0]!;
    const major = r.type === "large_airport" || r.type === "medium_airport";
    const canadian = r.type === "small_airport" && r.iso_country === "CA" && code.startsWith("C");
    if (!major && !canadian) continue;
    const round = (n: string) => Math.round(Number(n) * 1000) / 1000;
    for (const c of codes) {
      seen.add(c);
      airports.push([c, r.name ?? "", r.municipality ?? "", round(r.latitude_deg!), round(r.longitude_deg!)]);
    }
  }
  airports.sort((a, b) => a[0].localeCompare(b[0]));
  const out = path.join(process.cwd(), "src/lib/data/airports.json");
  await writeFile(out, JSON.stringify(airports) + "\n");
  console.log(`${airports.length} airports written to ${out}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
