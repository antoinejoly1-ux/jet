import { describe, expect, it } from "vitest";
import { searchAirports } from "@/lib/airports";

describe("searchAirports", () => {
  it("finds an airport by code, city or name, accents ignored", () => {
    expect(searchAirports("cyhu")[0]?.icao).toBe("CYHU");
    expect(searchAirports("montreal").map((a) => a.icao)).toContain("CYUL");
    expect(searchAirports("Teterboro")[0]?.icao).toBe("KTEB");
  });

  it("needs two characters and caps the list", () => {
    expect(searchAirports("c")).toEqual([]);
    expect(searchAirports("ky", 5)).toHaveLength(5);
  });
});
