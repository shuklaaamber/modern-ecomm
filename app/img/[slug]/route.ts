import crypto from "node:crypto";

// Generated placeholder artwork (no external image hosting needed). Deterministic per slug.
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const h = crypto.createHash("md5").update(slug).digest();
  const hue = Math.round((h[0] / 255) * 360);
  const initials = slug.split("-").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" role="img" aria-label="${initials}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 35% 78%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360} 40% 62%)"/></linearGradient></defs>
<rect width="400" height="500" fill="url(#g)"/>
<path d="M150 120l-60 40 25 50 25-12v182h120V198l25 12 25-50-60-40c-8 22-30 34-50 34s-42-12-50-34z" fill="hsl(${hue} 30% 96% / .9)"/>
<text x="200" y="460" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="hsl(${hue} 40% 22%)">${initials}</text>
</svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=31536000, immutable" } });
}
