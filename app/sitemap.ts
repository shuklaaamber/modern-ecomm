import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const [ps, cs] = await Promise.all([
    db.select({ slug: products.slug, at: products.createdAt }).from(products).where(eq(products.status, "active")),
    db.select().from(categories),
  ]);
  return [
    { url: `${base}/`, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
    ...cs.map((c) => ({ url: `${base}/products?category=${c.slug}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...ps.map((p) => ({ url: `${base}/products/${p.slug}`, lastModified: p.at, changeFrequency: "weekly" as const, priority: 0.8 })),
  ];
}
