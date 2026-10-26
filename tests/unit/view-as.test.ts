import { describe, expect, it } from "vitest";
import { decodeViewAs, encodeViewAs, VIEW_AS_TTL_SECONDS } from "@/lib/auth/view-as";

const SECRET = "x".repeat(40);
const STAFF = "staff-user";
const OWNER = "owner-1";

describe("view-as cookie", () => {
  it("round-trips for the staff member who started it", () => {
    expect(decodeViewAs(SECRET, STAFF, encodeViewAs(SECRET, STAFF, OWNER))).toBe(OWNER);
  });

  it("is refused for anyone else", () => {
    expect(decodeViewAs(SECRET, "another-user", encodeViewAs(SECRET, STAFF, OWNER))).toBeNull();
  });

  it("is refused once expired", () => {
    const now = Date.now();
    const value = encodeViewAs(SECRET, STAFF, OWNER, now);
    expect(decodeViewAs(SECRET, STAFF, value, now + VIEW_AS_TTL_SECONDS * 1000 + 1)).toBeNull();
  });

  it("is refused when tampered with", () => {
    const value = encodeViewAs(SECRET, STAFF, OWNER);
    expect(decodeViewAs(SECRET, STAFF, value.replace(OWNER, "owner-2"))).toBeNull();
    expect(decodeViewAs("y".repeat(40), STAFF, value)).toBeNull();
    expect(decodeViewAs(SECRET, STAFF, "garbage")).toBeNull();
    expect(decodeViewAs(SECRET, STAFF, undefined)).toBeNull();
  });
});
