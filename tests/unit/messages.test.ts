import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { frenchTypography } from "../../scripts/i18n-typography";

/** Every string in a messages file, by its key path. */
function strings(value: unknown, path = ""): [string, string][] {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (value && typeof value === "object")
    return Object.entries(value).flatMap(([k, v]) => strings(v, path ? `${path}.${k}` : k));
  return [];
}

const frStrings = strings(fr);
const enStrings = strings(en);

describe("messages", () => {
  it("has the same keys in French and English", () => {
    const frKeys = frStrings.map(([k]) => k).sort();
    const enKeys = enStrings.map(([k]) => k).sort();
    expect(enKeys.filter((k) => !frKeys.includes(k))).toEqual([]);
    expect(frKeys.filter((k) => !enKeys.includes(k))).toEqual([]);
  });

  it("follows French typography (non-breaking spaces before : % $ », after «, before units)", () => {
    const off = frStrings.filter(([, v]) => frenchTypography(v) !== v).map(([k]) => k);
    expect(off, "run: pnpm tsx scripts/i18n-typography.ts").toEqual([]);
  });

  it("uses the same placeholders in both languages, with balanced braces", () => {
    const enByKey = new Map(enStrings);
    // Argument names, not the text of plural branches ("one {is} other {are}").
    const names = (s: string) =>
      [...new Set([...s.matchAll(/(?<!(?:zero|one|two|few|many|other|=\d+)\s*)\{(\w+)(?=[,}])/g)].map((m) => m[1]))]
        .sort()
        .join(",");
    const balanced = (s: string) => [...s].reduce((n, c) => (n < 0 ? n : n + (c === "{" ? 1 : c === "}" ? -1 : 0)), 0);
    for (const [key, value] of frStrings) {
      expect(balanced(value), key).toBe(0);
      expect(names(enByKey.get(key) ?? ""), key).toBe(names(value));
    }
  });

  it("keeps Canadian English spelling", () => {
    const british = /\b(recognis|organis|authoris|anonymis|colour|maths\b|centre)/i;
    expect(enStrings.filter(([, v]) => british.test(v)).map(([k]) => k)).toEqual([]);
  });
});
