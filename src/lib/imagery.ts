/**
 * The photographs the portal uses, all Univair's own (from univairaviation.com),
 * and the team owners can call. Scenes are picked by mood, never decoration.
 */
import type { StaticImageData } from "next/image";
import boarding from "../../public/images/scenes/boarding.webp";
import cabinDoor from "../../public/images/scenes/cabin-door.webp";
import cabinLifestyle from "../../public/images/scenes/cabin-lifestyle.webp";
import cabinWindow from "../../public/images/scenes/cabin-window.webp";
import cockpit from "../../public/images/scenes/cockpit.webp";
import hangarBright from "../../public/images/scenes/hangar-bright.webp";
import hangarCrew from "../../public/images/scenes/hangar-crew.webp";
import hangarPilot from "../../public/images/scenes/hangar-pilot.webp";
import pilot from "../../public/images/scenes/pilot.webp";
import rampDusk from "../../public/images/scenes/ramp-dusk.webp";
import toast from "../../public/images/scenes/toast.webp";
import antoine from "../../public/images/team/antoine-tremblay.webp";
import charlesAntoine from "../../public/images/team/charles-antoine-bertrand.webp";
import louisCharles from "../../public/images/team/louis-charles-laverdure.webp";
import marieLaurence from "../../public/images/team/marie-laurence-boisvert.webp";
import michelle from "../../public/images/team/michelle-ducharme.webp";
import hangar from "../../public/images/hangar-pc12.webp";
import terminal from "../../public/images/terminal.webp";

export const scenes = {
  hangar,
  hangarPilot,
  hangarBright,
  hangarCrew,
  cockpit,
  pilot,
  boarding,
  toast,
  cabinLifestyle,
  cabinWindow,
  cabinDoor,
  rampDusk,
  terminal,
} satisfies Record<string, StaticImageData>;

export type Scene = keyof typeof scenes;

/** The people who answer owners' calls and texts, with their roles in both languages. */
export const team: { key: string; name: string; role: { fr: string; en: string }; photo: StaticImageData }[] = [
  {
    key: "marie-laurence-boisvert",
    name: "Marie-Laurence Boisvert",
    role: { fr: "Opérations", en: "Operations" },
    photo: marieLaurence,
  },
  {
    key: "antoine-tremblay",
    name: "Antoine Tremblay",
    role: { fr: "Opérations et répartition", en: "Operations and dispatch" },
    photo: antoine,
  },
  {
    key: "michelle-ducharme",
    name: "Michelle Ducharme",
    role: { fr: "Directrice des ventes", en: "Director of Sales" },
    photo: michelle,
  },
  {
    key: "charles-antoine-bertrand",
    name: "Charles-Antoine Bertrand",
    role: { fr: "Directeur général", en: "General Manager" },
    photo: charlesAntoine,
  },
  {
    key: "louis-charles-laverdure",
    name: "Louis-Charles Laverdure",
    role: { fr: "Commercial et flotte", en: "Commercial and fleet" },
    photo: louisCharles,
  },
];
