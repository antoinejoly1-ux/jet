import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { auditActionKey } from "../../src/lib/audit-labels";

const root = path.resolve(import.meta.dirname, "../../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

/** The scheduling sync records `sync.<entity>.<outcome>`. */
const OUTCOMES = ["created", "updated", "unchanged"];

/** Every action string passed to recordAudit: plain literals, both sides of a ternary, and the sync's template. */
function recordedActions() {
  const actions = new Set<string>();
  for (const file of files(root)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("recordAudit(")) continue;
    for (const [, line] of source.matchAll(/\baction:\s*([^\n]+)/g)) {
      if (/auditLog\.action/.test(line!)) continue;
      for (const [, literal] of line!.matchAll(/"([a-z_]+(?:\.[a-z_]+)+)"/g)) actions.add(literal!);
      for (const [, prefix] of line!.matchAll(/`([a-z_.]+)\.\$\{outcome\}`/g))
        for (const outcome of OUTCOMES) actions.add(`${prefix}.${outcome}`);
    }
  }
  return [...actions].sort();
}

const has = (messages: unknown, key: string) =>
  typeof key.split(".").reduce<unknown>((node, k) => (node as Record<string, unknown> | undefined)?.[k], messages) ===
  "string";

describe("audit labels", () => {
  const actions = recordedActions();

  it("finds the actions the services record", () => {
    expect(actions).toContain("flight.schedule");
    expect(actions).toContain("team.remove");
    expect(actions).toContain("sync.flight.created");
  });

  it("has a label for every recorded action, in French and in English", () => {
    const missing = (messages: unknown) => actions.filter((a) => !has(messages, `audit.${auditActionKey(a)}`));
    expect(missing(fr)).toEqual([]);
    expect(missing(en)).toEqual([]);
  });
});
