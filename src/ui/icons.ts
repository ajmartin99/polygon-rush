/**
 * Inline SVG icon set (24x24 grid). Kept in code so the app works fully offline
 * and icons inherit `currentColor`.
 */
const svg = (body: string, vb = '0 0 24 24'): string =>
  `<svg viewBox="${vb}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  thumbUp: svg(`<path d="M7 10v10H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zm2 0 4-7a2.2 2.2 0 0 1 3 2.6L15 9h4.6a2 2 0 0 1 2 2.4l-1.5 7A2 2 0 0 1 18.1 20H9z" fill="currentColor"/>`),
  thumbDown: svg(`<path d="M7 14V4H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1zm2 0 4 7a2.2 2.2 0 0 0 3-2.6L15 15h4.6a2 2 0 0 0 2-2.4l-1.5-7A2 2 0 0 0 18.1 4H9z" fill="currentColor"/>`),
  /** A Golden Shape (the hidden collectible): a gold hexagon with the four runner forms' corners. */
  egg: svg(
    `<path d="M12 2.2l8.5 4.9v9.8L12 21.8l-8.5-4.9V7.1z" fill="#ffd23f" stroke="#7a4a00" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 2.2v9.8l8.5-4.9M12 12l-8.5-4.9" fill="none" stroke="#fff3b0" stroke-width="1.1" stroke-linejoin="round"/><path d="M12 12v9.8" stroke="#e09a00" stroke-width="1.1"/><path d="M16.6 4.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5z" fill="#fff"/>`,
  ),
  gem: svg(
    `<path d="M6 3h12l4 6-10 12L2 9z" fill="#3ad7ff"/><path d="M2 9h20L12 21z" fill="#1fa6e0"/><path d="M6 3l3 6h6l3-6z" fill="#8ff0ff"/><path d="M9 9l3 12 3-12z" fill="#5fe2ff"/><path d="M6 3h12l4 6-10 12L2 9z" fill="none" stroke="#0b3f66" stroke-width="1.4" stroke-linejoin="round"/>`,
  ),
  play: svg(`<path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.4-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" fill="currentColor"/>`),
  pause: svg(`<rect x="5.5" y="4" width="4.5" height="16" rx="1.5" fill="currentColor"/><rect x="14" y="4" width="4.5" height="16" rx="1.5" fill="currentColor"/>`),
  home: svg(`<path d="M3 11.2 12 3.5l9 7.7V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z" fill="currentColor"/>`),
  restart: svg(
    `<path d="M12 4a8 8 0 1 1-7.4 5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><path d="M3 3.5v6h6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  ),
  close: svg(`<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>`),
  back: svg(`<path d="M15 4 7 12l8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  next: svg(`<path d="M9 4l8 8-8 8" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  gear: svg(
    `<path d="M19.25 9.71 L21.96 9.81 L21.96 14.19 L19.25 14.29 L18.74 15.50 L20.59 17.50 L17.50 20.59 L15.50 18.74 L14.29 19.25 L14.19 21.96 L9.81 21.96 L9.71 19.25 L8.50 18.74 L6.50 20.59 L3.41 17.50 L5.26 15.50 L4.75 14.29 L2.04 14.19 L2.04 9.81 L4.75 9.71 L5.26 8.50 L3.41 6.50 L6.50 3.41 L8.50 5.26 L9.71 4.75 L9.81 2.04 L14.19 2.04 L14.29 4.75 L15.50 5.26 L17.50 3.41 L20.59 6.50 L18.74 8.50ZM15.40 12a3.4 3.4 0 1 0 -6.80 0a3.4 3.4 0 1 0 6.80 0z" fill="currentColor" fill-rule="evenodd" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>`,
  ),
  cart: svg(
    `<path d="M2.5 3.5h3l2.4 11.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.5-1.1L21 7.5H6.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9.5" cy="19.6" r="1.8" fill="currentColor"/><circle cx="17.5" cy="19.6" r="1.8" fill="currentColor"/>`,
  ),
  trophy: svg(
    `<path d="M7 3h10v6a5 5 0 0 1-10 0z" fill="#ffd23f"/><path d="M7 5H3.5v1.5A3.5 3.5 0 0 0 7 10M17 5h3.5v1.5A3.5 3.5 0 0 1 17 10" fill="none" stroke="#ffd23f" stroke-width="2"/><path d="M10.5 13.5h3V17h-3z" fill="#e09a00"/><rect x="7" y="17" width="10" height="3.5" rx="1" fill="#e09a00"/><path d="M9 5v4" stroke="#fff6c8" stroke-width="1.6" stroke-linecap="round"/>`,
  ),
  eye: svg(
    `<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/>`,
  ),
  gift: svg(
    `<rect x="3" y="9" width="18" height="5" rx="1" fill="#ff5fa2"/><rect x="4.5" y="14" width="15" height="7" rx="1" fill="#ff7ac6"/><rect x="10.5" y="9" width="3" height="12" fill="#ffd23f"/><path d="M12 9c-1-3-5-5-6-3s3 3 6 3zm0 0c1-3 5-5 6-3s-3 3-6 3z" fill="#ffd23f" stroke="#e09a00" stroke-width="1"/>`,
  ),
  target: svg(
    `<circle cx="12" cy="12" r="9" fill="#ff5f5f"/><circle cx="12" cy="12" r="6.2" fill="#fff"/><circle cx="12" cy="12" r="3.4" fill="#ff5f5f"/><path d="M12 12 20 4" stroke="#3b2300" stroke-width="2" stroke-linecap="round"/><path d="M17.5 3.5 20.5 3.5 20.5 6.5" fill="none" stroke="#3b2300" stroke-width="1.8" stroke-linecap="round"/>`,
  ),
  flag: svg(
    `<path d="M5 21V3.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M6 4h13l-3 4.5 3 4.5H6z" fill="currentColor"/><path d="M9 4h3v3H9zm3 3h3v3h-3zm-3 3h3v3H9z" fill="rgba(0,0,0,.28)"/>`,
  ),
  duel: svg(
    `<rect x="2.5" y="4" width="8.5" height="8.5" rx="2" fill="#ffd23f" stroke="#3b2300" stroke-width="1.2"/><path d="M13 20.5 17.25 12l4.25 8.5z" fill="#ff5fa2" stroke="#4a0b2c" stroke-width="1.2" stroke-linejoin="round"/><circle cx="5.5" cy="7.6" r="1" fill="#3b2300"/><circle cx="8.3" cy="7.6" r="1" fill="#3b2300"/><circle cx="16.2" cy="17.2" r=".8" fill="#4a0b2c"/><circle cx="18.3" cy="17.2" r=".8" fill="#4a0b2c"/><path d="M10 15.5h3M11.5 14v3" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`,
  ),
  globe: svg(
    `<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  ),
  users: svg(
    `<circle cx="8.5" cy="8" r="3.5" fill="currentColor"/><path d="M2 20c.4-4 3-6 6.5-6s6.1 2 6.5 6z" fill="currentColor"/><circle cx="17" cy="8.5" r="2.8" fill="currentColor" opacity=".7"/><path d="M15.8 13.6c3.6-.4 5.8 1.6 6.2 5.4h-5.4" fill="currentColor" opacity=".7"/>`,
  ),
  heart: svg(
    `<path d="M12 20.5S3 15 3 8.8A4.6 4.6 0 0 1 12 6.6a4.6 4.6 0 0 1 9 2.2c0 6.2-9 11.7-9 11.7z" fill="#ff4f6d" stroke="#7a0b22" stroke-width="1.3"/><path d="M7 8.2a2 2 0 0 1 2-1.6" stroke="#ffd1db" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
  ),
  shield: svg(
    `<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="#3ad7ff" stroke="#0b3f66" stroke-width="1.3"/><path d="M8 12l3 3 5-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  star: svg(
    `<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="#ffd23f" stroke="#a86a00" stroke-width="1.2" stroke-linejoin="round"/>`,
  ),
  video: svg(
    `<rect x="2.5" y="5" width="14" height="14" rx="3" fill="currentColor"/><path d="M16.5 10.2 21.5 7v10l-5-3.2z" fill="currentColor"/><path d="M7.8 9v6l4.6-3z" fill="rgba(0,0,0,.35)"/>`,
  ),
  noads: svg(
    `<circle cx="12" cy="12" r="9.5" fill="#ff4f5e" stroke="#fff" stroke-width="1.5"/><text x="12" y="15.6" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="9.5" fill="#fff">AD</text><path d="M5.5 5.5l13 13" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>`,
  ),
  lock: svg(
    `<rect x="4.5" y="10.5" width="15" height="11" rx="2.5" fill="currentColor"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>`,
  ),
  check: svg(`<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`),
  music: svg(
    `<path d="M9 18V5.5l11-2.5v12.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.8" fill="currentColor"/><circle cx="17.5" cy="15.5" r="2.8" fill="currentColor"/>`,
  ),
  skip: svg(`<path d="M4 5.5v13a1 1 0 0 0 1.5.86L15 13.7V18a1 1 0 0 0 2 0V6a1 1 0 0 0-2 0v4.3L5.5 4.64A1 1 0 0 0 4 5.5z" fill="currentColor"/><rect x="18" y="5" width="2.6" height="14" rx="1.3" fill="currentColor"/>`),
  sound: svg(
    `<path d="M3.5 9h4l5-4.5v15l-5-4.5h-4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  ),
  vibrate: svg(
    `<rect x="7" y="3" width="10" height="18" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 8v8M21 8v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  ),
  motion: svg(
    `<path d="M3 12h4l2-5 4 10 2-5h6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  child: svg(
    `<circle cx="12" cy="6" r="3.2" fill="currentColor"/><path d="M6 11.5 12 10l6 1.5M12 10v5.5m0 0-3 5.5m3-5.5 3 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  sparkle: svg(
    `<path d="M12 2.5c.8 4.6 2.9 6.7 7.5 7.5-4.6.8-6.7 2.9-7.5 7.5-.8-4.6-2.9-6.7-7.5-7.5 4.6-.8 6.7-2.9 7.5-7.5z" fill="currentColor"/><path d="M19 15.5c.4 2 1.3 2.9 3.3 3.3-2 .4-2.9 1.3-3.3 3.3-.4-2-1.3-2.9-3.3-3.3 2-.4 2.9-1.3 3.3-3.3z" fill="currentColor"/>`,
  ),
  info: svg(`<circle cx="12" cy="12" r="9.5" fill="currentColor"/><path d="M12 10.5v6.5" stroke="#21125a" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="7.2" r="1.6" fill="#21125a"/>`),
  privacy: svg(
    `<path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><rect x="8.5" y="11" width="7" height="5.5" rx="1" fill="currentColor"/><path d="M10 11V9.5a2 2 0 0 1 4 0V11" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  ),
  dice: svg(
    `<rect x="3" y="3" width="18" height="18" rx="4" fill="#ffffff" stroke="#21125a" stroke-width="1.4"/><circle cx="8" cy="8" r="1.7" fill="#21125a"/><circle cx="16" cy="8" r="1.7" fill="#21125a"/><circle cx="12" cy="12" r="1.7" fill="#21125a"/><circle cx="8" cy="16" r="1.7" fill="#21125a"/><circle cx="16" cy="16" r="1.7" fill="#21125a"/>`,
  ),
  copy: svg(
    `<rect x="8" y="8" width="12.5" height="12.5" rx="2.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M5 15.5H4.5a1.5 1.5 0 0 1-1.5-1.5V4.5A1.5 1.5 0 0 1 4.5 3H14a1.5 1.5 0 0 1 1.5 1.5V5" fill="none" stroke="currentColor" stroke-width="2.2"/>`,
  ),
  graphics: svg(
    `<rect x="2.5" y="4.5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 21h8M12 17.5V21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M6 14l3.5-4 3 3 2-2 3.5 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>`,
  ),
  wifi: svg(
    `<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><circle cx="12" cy="19.3" r="1.7" fill="currentColor"/>`,
  ),
  magnet: svg(
    `<path d="M5 3.5h4.5v8a2.5 2.5 0 0 0 5 0v-8H19v8a7 7 0 0 1-14 0z" fill="#ff5f5f" stroke="#7a0b22" stroke-width="1.2"/><path d="M5 3.5h4.5V7H5zm9.5 0H19V7h-4.5z" fill="#e8ecff"/>`,
  ),
  bolt: svg(`<path d="M13.5 2 4.5 13.5h6.5L9.5 22l10-12.5h-6.5z" fill="#ffd23f" stroke="#a86a00" stroke-width="1.2" stroke-linejoin="round"/>`),
  snow: svg(
    `<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5" stroke="#8fe9ff" stroke-width="2.2" stroke-linecap="round"/><path d="M9.5 3.8 12 6.2l2.5-2.4M9.5 20.2 12 17.8l2.5 2.4" fill="none" stroke="#8fe9ff" stroke-width="1.8" stroke-linecap="round"/>`,
  ),
  crown: svg(
    `<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" fill="#ffd23f" stroke="#a86a00" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="14.5" r="1.6" fill="#ff5fa2"/>`,
  ),
  restore: svg(
    `<path d="M4 12a8 8 0 1 0 2.4-5.7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5 2.5V7h4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 8v4.5l3 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  ),
  trash: svg(
    `<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 14h10l1-14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  shapes: svg(
    `<rect x="2.5" y="12" width="8" height="8" rx="1.5" fill="#ffd23f"/><path d="M17.5 2.5l5 8.5h-10z" fill="#ff5fa2"/><path d="M17.5 13l4.3 2.5v5L17.5 23l-4.3-2.5v-5z" fill="#3ee6b0"/><path d="M6.5 2.5l4 4.5-4 4.5-4-4.5z" fill="#3ad7ff"/>`,
  ),
  build: svg(
    `<rect x="2.5" y="13" width="8" height="8" rx="1.4" fill="currentColor"/><rect x="11.5" y="13" width="8" height="8" rx="1.4" fill="currentColor" opacity=".75"/><rect x="7" y="4" width="8" height="8" rx="1.4" fill="currentColor" opacity=".9"/><path d="M18.5 2.5l3 3-6 6-3.6.6.6-3.6z" fill="#ffd23f" stroke="#7a4b00" stroke-width="1"/>`,
  ),
  edit: svg(
    `<path d="M4 20l1-5L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19z" fill="currentColor"/><path d="M13.5 6.5l4 4" stroke="#21125a" stroke-width="1.6"/><path d="M4 20l5-1-4-4z" fill="#ffd23f"/>`,
  ),
  undo: svg(
    `<path d="M9 5L4 10l5 5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 10H14a6 6 0 0 1 0 12h-3" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`,
  ),
  redo: svg(
    `<path d="M15 5l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.5 10H10a6 6 0 0 0 0 12h3" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/>`,
  ),
  eraser: svg(
    `<path d="M14.5 3.5l6 6-9 9.5H6.5l-3.5-3.5z" fill="currentColor"/><path d="M8.5 9.5l6 6" stroke="#21125a" stroke-width="1.8"/><path d="M11 19h10" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>`,
  ),
  hand: svg(
    `<path d="M7 13V6.5a1.5 1.5 0 0 1 3 0V12V4.5a1.5 1.5 0 0 1 3 0V12V5.5a1.5 1.5 0 0 1 3 0V12.5V8.5a1.5 1.5 0 0 1 3 0v6.5a7 7 0 0 1-7 7h-1a7 7 0 0 1-5.8-3.1L3.6 14.6a1.6 1.6 0 0 1 2.6-1.8z" fill="currentColor"/>`,
  ),
  share: svg(
    `<circle cx="18" cy="5.5" r="3" fill="currentColor"/><circle cx="6" cy="12" r="3" fill="currentColor"/><circle cx="18" cy="18.5" r="3" fill="currentColor"/><path d="M8.6 10.6l6.8-3.7M8.6 13.4l6.8 3.7" stroke="currentColor" stroke-width="2.2"/>`,
  ),
  chat: svg(
    `<path d="M4 4.5h16a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-8l-5 4v-4H4a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z" fill="currentColor"/><circle cx="8" cy="10.8" r="1.4" fill="#21125a"/><circle cx="12" cy="10.8" r="1.4" fill="#21125a"/><circle cx="16" cy="10.8" r="1.4" fill="#21125a"/>`,
  ),
  mail: svg(
    `<rect x="2.5" y="5" width="19" height="14" rx="2.5" fill="currentColor"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5" fill="none" stroke="#21125a" stroke-width="1.8" stroke-linejoin="round"/>`,
  ),
  report: svg(
    `<path d="M5 21V3.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M5.5 4h12l-2.5 4.5 2.5 4.5h-12z" fill="currentColor"/>`,
  ),
  mute: svg(
    `<path d="M4 9h3.5L13 4.5v15L7.5 15H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
  ),
  verified: svg(
    `<path d="M12 2l2.6 2.1 3.3-.3.9 3.2 2.8 1.8-1.2 3.2 1.2 3.2-2.8 1.8-.9 3.2-3.3-.3L12 22l-2.6-2.1-3.3.3-.9-3.2-2.8-1.8 1.2-3.2-1.2-3.2 2.8-1.8.9-3.2 3.3.3z" fill="#3ee6b0"/><path d="M7.5 12.3l3 3 6-6.3" fill="none" stroke="#0b4a3a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  public: svg(
    `<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M2.5 12h19M12 2.5c3 3 3 16 0 19M12 2.5c-3 3-3 16 0 19" fill="none" stroke="currentColor" stroke-width="1.8"/>`,
  ),
} as const;

export type IconName = keyof typeof ICONS;

export function icon(name: IconName): string {
  return ICONS[name];
}
