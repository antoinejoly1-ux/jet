// Animated icons: the drawings. 24×24, 1.75 stroke, round caps, currentColor.
// Each moving part carries an `ai-*` class; animated-icons.css moves it on hover.
// The first thirteen are the kit's; the rest are Univair's, drawn to the same rules.

export const ICONS = {
  pulse: `<path class="ai-beat" pathLength="1" d="M2.5 12.5h4.2l2.1-5.5 4.2 11 2.3-6.2h6.2"/><circle class="ai-dot" cx="21.5" cy="11.8" r="0.6" fill="currentColor"/>`,
  chat: `<path class="ai-bubble" d="M12 4.2c4.7 0 8.5 3.2 8.5 7.2s-3.8 7.2-8.5 7.2c-1.1 0-2.2-.2-3.1-.5L4.5 20l1.3-3.5C4.5 15.2 3.5 13.4 3.5 11.4c0-4 3.8-7.2 8.5-7.2z"/>`,
  cards: `<path class="ai-back" d="M8 4.5h10.5a1.5 1.5 0 0 1 1.5 1.5v10.5"/><rect class="ai-front" x="4" y="8" width="12.5" height="12" rx="2"/><path class="ai-front" d="M7 12.5h6.5M7 15.5h4"/>`,
  grid: `<rect class="ai-t1" x="3.5" y="3.5" width="7.5" height="7.5" rx="2"/><rect class="ai-t2" x="13" y="3.5" width="7.5" height="7.5" rx="2"/><rect class="ai-t3" x="3.5" y="13" width="7.5" height="7.5" rx="2"/><rect class="ai-t4" x="13" y="13" width="7.5" height="7.5" rx="3.75"/>`,
  bulb: `<path d="M9.2 17.5h5.6M10 20.5h4"/><path class="ai-bulb" d="M12 3.8a5.6 5.6 0 0 0-3.4 10.1c.5.4.8 1 .8 1.6v.2h5.2v-.2c0-.6.3-1.2.8-1.6A5.6 5.6 0 0 0 12 3.8z"/><path class="ai-ray" d="M12 1v.9M4.6 4.2l.7.6M19.4 4.2l-.7.6M2 10.2h.9M21.1 10.2h.9"/>`,
  people: `<g class="ai-head-a"><circle cx="9.2" cy="8" r="3.4"/></g><path d="M3.2 19.8v-.9a4.5 4.5 0 0 1 4.5-4.5h3a4.5 4.5 0 0 1 4.5 4.5v.9"/><g class="ai-head-b"><path d="M15.6 4.8a3.4 3.4 0 0 1 0 6.4"/></g><path d="M18 14.6a4.4 4.4 0 0 1 2.8 4.1v1.1"/>`,
  search: `<g class="ai-glass"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 5 5"/></g>`,
  plus: `<path class="ai-cross" d="M12 5v14M5 12h14"/>`,
  menu: `<path class="ai-top" d="M4.5 9h15"/><path class="ai-bottom" d="M4.5 15h15"/>`,
  settings: `<g class="ai-gear"><circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.7 7.7 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4a7.7 7.7 0 0 0-2.6 1.5l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.7 7.7 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.7 7.7 0 0 0 2.6-1.5l2.4.9 2-3.4z"/></g>`,
  home: `<path class="ai-roof" d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V19a1 1 0 0 0 1 1H10v-5.5h4V20h3.5a1 1 0 0 0 1-1V9.5"/>`,
  bell: `<g class="ai-ring"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/></g><path class="ai-clapper" d="M10 20.5a2 2 0 0 0 4 0"/>`,
  heart: `<path class="ai-beatheart" d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>`,

  // Univair
  plane: `<path class="ai-fly" d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>`,
  planeTakeoff: `<path d="M2.5 21h19"/><path class="ai-climb" d="M6.4 16.8 4 16.4l-1.6-3.6 1-.5a2 2 0 0 1 1.8 0l.2.1a2 2 0 0 0 1.8 0L8.3 12 5.5 6.6l.8-.4a2 2 0 0 1 2.1.2l3.9 2.9a2 2 0 0 0 2.1.2l4.1-2a2.4 2.4 0 0 1 1.7-.2l.9.3a1.4 1.4 0 0 1 .9 2l-.4.8c-.2.4-.6.8-1.1 1.1L7.6 16.6a2 2 0 0 1-1.2.2z"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17"/><g class="ai-rings"><path d="M8 3v4M16 3v4"/></g><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>`,
  wallet: `<path d="M18.5 7.5V5a1.5 1.5 0 0 0-1.5-1.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h12.5A1.5 1.5 0 0 0 20 19v-2.5"/><path d="M3.5 6A2.5 2.5 0 0 0 6 8.5h12.5A1.5 1.5 0 0 1 20 10v1.5"/><path class="ai-clasp" d="M20.5 11.5H17a2.5 2.5 0 0 0 0 5h3.5z"/>`,
  invoice: `<g class="ai-sheet"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></g><path class="ai-write" pathLength="1" d="M8.5 13h7"/><path class="ai-write" pathLength="1" d="M8.5 16.5h4.5"/>`,
  receipt: `<path d="M5 3v18l2-1.2 2 1.2 2-1.2 2 1.2 2-1.2 2 1.2 2-1.2V3l-2 1.2L15 3l-2 1.2L11 3 9 4.2 7 3z"/><path class="ai-write" pathLength="1" d="M8.5 9h7"/><path class="ai-write" pathLength="1" d="M8.5 12.5h7"/><path class="ai-write" pathLength="1" d="M8.5 16h4"/>`,
  clipboard: `<path d="M9 4.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="3.5" rx="1"/><path class="ai-check" pathLength="1" d="m9 13.5 2.2 2.2 4-4.2"/>`,
  ledger: `<path d="M12 6.5C10.3 5.2 7.8 4.5 3.5 4.5v13c4.3 0 6.8.7 8.5 2"/><path d="M12 6.5v13"/><g class="ai-leaf"><path d="M12 6.5c1.7-1.3 4.2-2 8.5-2v13c-4.3 0-6.8.7-8.5 2"/><path d="M14.8 9.5h3M14.8 12.5h3"/></g>`,
  wrench: `<path class="ai-turn" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>`,
  upload: `<path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/><g class="ai-lift"><path d="M12 15V4.5"/><path d="M7.5 9 12 4.5 16.5 9"/></g>`,
  inbox: `<path class="ai-letter" d="M9 7.5h6M10 10h4"/><g class="ai-tray"><path d="M21.5 12.5h-5.5l-2 3h-4l-2-3H2.5"/><path d="M5.4 5.1 2.5 12.5V18a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2v-5.5l-2.9-7.4A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.8 1.1z"/></g>`,
  phone: `<path class="ai-handset" d="M21 16.4v2.7a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.8-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3 4.9 1.8 1.8 0 0 1 4.8 3h2.7a1.8 1.8 0 0 1 1.8 1.5c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8.3 10a14.4 14.4 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.5 1.9z"/>`,
  logout: `<path d="M9.5 20.5H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h3.5"/><g class="ai-out"><path d="M15.5 16.5 20 12l-4.5-4.5"/><path d="M20 12H9.5"/></g>`,
  gauge: `<path d="M4.3 17.5a8.5 8.5 0 1 1 15.4 0"/><path class="ai-needle" d="M12 14.5 15 10.5"/><circle cx="12" cy="14.5" r="1.1"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path class="ai-hand" d="M12 12V7"/><path d="M12 12l3 2"/>`,
  mail: `<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path class="ai-flap" d="m3.5 7.5 8.5 6 8.5-6"/>`,
  key: `<g class="ai-key"><circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.3-8.3M16.5 6.5l2.5 2.5M14 9l2 2"/></g>`,
  user: `<g class="ai-head"><circle cx="12" cy="8" r="4"/></g><path d="M4.5 20.5v-1a5.5 5.5 0 0 1 5.5-5.5h4a5.5 5.5 0 0 1 5.5 5.5v1"/>`,
  code: `<path class="ai-left" d="M8 7.5 3.5 12 8 16.5"/><path class="ai-right" d="M16 7.5l4.5 4.5-4.5 4.5"/><path d="m13.5 5.5-3 13"/>`,
  shield: `<path d="M12 21s7.5-3.5 7.5-9.5V5.5L12 3 4.5 5.5v6C4.5 17.5 12 21 12 21z"/><path class="ai-check" pathLength="1" d="m9 12 2.2 2.2 4-4.2"/>`,
  list: `<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path class="ai-write" pathLength="1" d="M4 6.5h.01M4 12h.01M4 17.5h.01"/>`,
} as const;

export type AnimatedIconName = keyof typeof ICONS;
export const ANIMATED_ICON_NAMES = Object.keys(ICONS) as AnimatedIconName[];
