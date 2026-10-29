// The icon set, drawn like the Lustra Airline admin's: plain strokes on a 24px grid, each
// path given pathLength=1 so CSS can redraw it exactly on hover (animated-icons.css). The
// paths marked "Lustra" are theirs verbatim; the others are Univair's, drawn the same way.

export const ICONS = {
  // Tableau de bord: Lustra's "overview" tiles.
  gauge: ["M4 4h7v7H4z", "M13 4h7v4h-7z", "M13 10h7v10h-7z", "M4 13h7v7H4z"],
  grid: ["M4 4h7v7H4z", "M13 4h7v4h-7z", "M13 10h7v10h-7z", "M4 13h7v7H4z"],
  // Lustra
  inbox: [
    "M3 13l2.6-7.2A2 2 0 0 1 7.5 4.5h9a2 2 0 0 1 1.9 1.3L21 13",
    "M3 13v4.5A2 2 0 0 0 5 19.5h14a2 2 0 0 0 2-2V13h-5.2a3 3 0 0 1-5.6 0z",
  ],
  people: [
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M2.5 20a6.5 6.5 0 0 1 13 0",
    "M16 4.3a3.5 3.5 0 0 1 0 6.4",
    "M18 14.2a6.5 6.5 0 0 1 3.5 5.8",
  ],
  shield: ["M12 3l7.5 3v5.5c0 4.6-3.1 8.3-7.5 9.5-4.4-1.2-7.5-4.9-7.5-9.5V6z", "M8.8 12l2.3 2.3 4.2-4.6"],
  logout: ["M10 4.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h4", "M15 8l4 4-4 4", "M19 12H9.5"],
  plus: ["M12 5v14", "M5 12h14"],
  mail: ["M3.5 6h17v12h-17z", "M3.5 7l8.5 6.5L20.5 7"],
  search: ["M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M15.5 15.5L20 20"],
  clock: ["M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z", "M12 7.5V12l3 2"],
  phone: [
    "M5 4h4l1.5 4-2 1.5a11 11 0 0 0 5 5L15 12.5l4 1.5v4a1.5 1.5 0 0 1-1.5 1.5A14.5 14.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z",
  ],
  key: ["M8 14a4 4 0 1 1 3.8-5.2H21v3h-2v2.5h-2.5V12H11.8A4 4 0 0 1 8 14z"],
  plane: ["M10.5 13.5L3 11l1.5-1.5 8 .5 4.5-4.5a2 2 0 0 1 3 3L15.5 13l.5 8-1.5 1.5L12 15z"],
  receipt: ["M6 3.5h12v17l-2.5-1.5-2 1.5-1.5-1.5-1.5 1.5-2-1.5L6 20.5z", "M9 8h6", "M9 11.5h6", "M9 15h3"],
  // Transactions: Lustra's "table".
  ledger: ["M4 5h16v14H4z", "M4 10h16", "M4 14.5h16", "M10 10v9"],
  // Importations: Lustra's "up" over a tray.
  upload: ["M12 15V4.5", "M7.5 9L12 4.5 16.5 9", "M4.5 19.5h15"],

  // Univair's, in the same hand.
  home: ["M4 10.5L12 4l8 6.5", "M6 9v10.5h12V9", "M10 19.5v-5h4v5"],
  calendar: ["M4 6h16v14H4z", "M4 10h16", "M8.5 3.5v4", "M15.5 3.5v4", "M8 14h3"],
  planeTakeoff: [
    "M3 20.5h18",
    "M6.4 16.8 4 16.4l-1.6-3.6 1-.5a2 2 0 0 1 1.8 0l.2.1a2 2 0 0 0 1.8 0L8.3 12 5.5 6.6l.8-.4a2 2 0 0 1 2.1.2l3.9 2.9a2 2 0 0 0 2.1.2l4.1-2a2.4 2.4 0 0 1 1.7-.2l.9.3a1.4 1.4 0 0 1 .9 2l-.4.8c-.2.4-.6.8-1.1 1.1L7.6 16.6a2 2 0 0 1-1.2.2z",
  ],
  chat: ["M20.5 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.6A8 8 0 1 1 20.5 11.5z", "M8.5 11.5h7"],
  wallet: [
    "M17 7.5V5a1.5 1.5 0 0 0-1.5-1.5H6A2 2 0 0 0 4 5.5v13A2 2 0 0 0 6 20.5h12.5A1.5 1.5 0 0 0 20 19V9a1.5 1.5 0 0 0-1.5-1.5H6A2 2 0 0 1 4 5.5",
    "M16 14h.01",
  ],
  invoice: ["M6 3.5h8l4.5 4.5v12.5H6z", "M14 3.5V8h4.5", "M9 12.5h6", "M9 16h4"],
  clipboard: ["M8.5 5h-2v15.5h11V5h-2", "M9 3.5h6v3H9z", "M9 13l2 2 4-4.5"],
  settings: [
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    "M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4a7.7 7.7 0 0 0-2.6 1.5l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.7 7.7 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.7 7.7 0 0 0 2.6-1.5l2.4.9 2-3.4z",
  ],
  wrench: [
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z",
  ],
  bell: ["M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z", "M10 20.5a2 2 0 0 0 4 0"],
  user: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z", "M4.5 20.5a7.5 7.5 0 0 1 15 0"],
  menu: ["M4.5 8h15", "M4.5 16h15"],
  list: ["M9 6.5h11", "M9 12h11", "M9 17.5h11", "M4.5 6.5h.01", "M4.5 12h.01", "M4.5 17.5h.01"],
  code: ["M8 7.5L3.5 12 8 16.5", "M16 7.5l4.5 4.5-4.5 4.5", "M13.5 5.5l-3 13"],
  bulb: [
    "M9 18h6",
    "M10 21h4",
    "M12 3.5a5.5 5.5 0 0 0-3.3 9.9c.5.4.8 1 .8 1.6V16h5v-1c0-.6.3-1.2.8-1.6A5.5 5.5 0 0 0 12 3.5z",
  ],
  pulse: ["M3 12.5h4l2-5.5 4 11 2.5-6.5H21"],
  cards: ["M9 9h10v11H9z", "M5 15V4h10"],
  heart: ["M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"],
} as const satisfies Record<string, readonly string[]>;

export type AnimatedIconName = keyof typeof ICONS;
export const ANIMATED_ICON_NAMES = Object.keys(ICONS) as AnimatedIconName[];
