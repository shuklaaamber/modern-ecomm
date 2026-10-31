/**
 * Client IP for rate limiting. Never trust a client-supplied header:
 * - On Vercel the platform overwrites x-vercel-forwarded-for / x-real-ip, so those are authoritative.
 * - Elsewhere (Caddy, etc.) the proxy appends the real peer to X-Forwarded-For, so the LAST hop is the one
 *   it added; earlier hops can be forged by the client.
 */
export function clientIp(req: Request): string {
  const h = req.headers;
  if (process.env.VERCEL) {
    const v = h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim();
    if (v) return v;
  }
  const hops = h.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean);
  return hops?.[hops.length - 1] || h.get("x-real-ip")?.trim() || "local";
}
