/** Tells the Navbar to refetch its per-visitor state (cart count, sign-in). Call after cart/auth changes. */
export const NAV_REFRESH = "nav:refresh";
export function refreshNav() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NAV_REFRESH));
}
