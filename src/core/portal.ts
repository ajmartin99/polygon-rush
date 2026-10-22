/**
 * The web editor: this same game, opened in a desktop browser at the game
 * server's /build page (or any page with ?portal while developing). It only
 * builds and tests levels, synced with the player's phone.
 */
function detect(): boolean {
  if (typeof location === 'undefined' || typeof window === 'undefined') return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  if (cap?.isNativePlatform?.()) return false;
  return location.pathname.startsWith('/build') || new URLSearchParams(location.search).has('portal');
}

export const IS_PORTAL = detect();
