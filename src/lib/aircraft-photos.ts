import type { StaticImageData } from "next/image";
import challenger from "../../public/images/aircraft/challenger.webp";
import global from "../../public/images/aircraft/global.webp";
import kingAir from "../../public/images/aircraft/king-air.webp";
import learjet from "../../public/images/aircraft/learjet.webp";
import pc12 from "../../public/images/aircraft/pc12.webp";

/** A photograph for an aircraft, picked by model, with the PC-12 as the house default. */
export function aircraftPhoto(model: string): StaticImageData {
  const m = model.toLowerCase();
  if (m.includes("challenger")) return challenger;
  if (m.includes("global")) return global;
  if (m.includes("king air")) return kingAir;
  if (m.includes("learjet")) return learjet;
  return pc12;
}
