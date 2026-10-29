/**
 * French typography for the app's strings (OQLF): a non-breaking space before
 * « : », « % » and « $ », inside « », and between a number and its unit, so
 * a lone colon or unit never wraps onto its own line. Idempotent.
 *
 *   pnpm tsx scripts/i18n-typography.ts
 */
import { readFileSync, writeFileSync } from "node:fs";

const NBSP = " ";
const UNITS = "h|min|j|jours?|mois|ans?|Mo|Ko|Go|pi|kt|nœuds?|%|\\$";

export function frenchTypography(text: string): string {
  return text
    .replace(/ +([:%$»])/g, `${NBSP}$1`)
    .replace(/« +/g, `«${NBSP}`)
    .replace(new RegExp(`([\\d}#]) +(${UNITS})(?=[\\s,.;:!?)»}]|$)`, "g"), `$1${NBSP}$2`);
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return frenchTypography(value);
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
  return value;
}

if (process.argv[1]?.endsWith("i18n-typography.ts")) {
  const file = "messages/fr.json";
  writeFileSync(file, JSON.stringify(walk(JSON.parse(readFileSync(file, "utf8"))), null, 2) + "\n");
  console.log(`French typography applied to ${file}`);
}
