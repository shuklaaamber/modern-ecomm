/** Client IP for rate limiting. Uses the first X-Forwarded-For hop (set by the trusted proxy/platform). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || req.headers.get("x-real-ip") || "local";
}
