import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb } from "../support/db";

const t = createTestDb();
// The database backend reaches for @/lib/db; point it at the test database.
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  return { db: t.db, schema };
});
const { backends } = await import("@/lib/storage/blobs");

beforeAll(t.setup);
afterAll(t.close);
beforeEach(t.reset);

describe("database file storage (staging)", () => {
  it("keeps, reads, sizes and removes files", async () => {
    const key = "avatars/01a1d000-0000-7000-8000-000000000001.webp";
    const bytes = Buffer.from("RIFF fake webp");
    const store = backends.database;
    expect(await store.get(key)).toBeNull();
    await store.put(key, "image/webp", bytes);
    expect(await store.size(key)).toBe(bytes.length);
    expect((await store.get(key))?.equals(bytes)).toBe(true);
    await store.put(key, "image/webp", Buffer.from("replaced"));
    expect(await store.size(key)).toBe(8);
    await store.remove(key);
    expect(await store.size(key)).toBeNull();
  });

  it("refuses keys that aren't storage keys", async () => {
    await expect(backends.database.put("../etc/passwd", "text/plain", Buffer.from("x"))).rejects.toThrow();
  });
});
