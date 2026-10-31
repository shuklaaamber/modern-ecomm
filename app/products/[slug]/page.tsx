import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { categories, products, reviews, user, variants, wishlistItems } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { listProducts } from "@/lib/catalog";
import { AddToCart, type VariantOption } from "@/components/AddToCart";
import { ReviewForm } from "@/components/ReviewForm";
import { ProductCard } from "@/components/ProductCard";
import { Price, Stars } from "@/components/ui";

const load = cache(async (slug: string) => {
  const [row] = await db
    .select({ p: products, c: categories })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.slug, slug), eq(products.status, "active")));
  return row ?? null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const row = await load((await params).slug);
  if (!row) return { title: "Product not found" };
  return {
    title: row.p.name,
    description: row.p.description.slice(0, 155),
    alternates: { canonical: `/products/${row.p.slug}` },
    openGraph: { title: row.p.name, description: row.p.description, images: [row.p.image] },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const row = await load(slug);
  if (!row) notFound();
  const { p, c } = row;

  const [vs, revs, me, related] = await Promise.all([
    db.select().from(variants).where(eq(variants.productId, p.id)).orderBy(variants.id),
    db
      .select({ r: reviews, name: user.name })
      .from(reviews)
      .innerJoin(user, eq(user.id, reviews.userId))
      .where(eq(reviews.productId, p.id))
      .orderBy(desc(reviews.createdAt))
      .limit(20),
    getUser(),
    listProducts({ category: c.slug }),
  ]);

  const options: VariantOption[] = vs.map((v) => ({
    id: v.id,
    label: v.label,
    color: v.options.Color ?? "Default",
    size: v.options.Size ?? v.options.Waist ?? "One size",
    priceCents: v.priceCents,
    compareAt: v.compareAtCents,
    available: Math.max(0, v.onHand - v.reserved),
  }));
  const minPrice = Math.min(...vs.map((v) => v.priceCents));
  const maxCompare = Math.max(0, ...vs.map((v) => v.compareAtCents ?? 0)) || null;
  const anyStock = options.some((o) => o.available > 0);
  const [saved] = me
    ? await db.select().from(wishlistItems).where(and(eq(wishlistItems.userId, me.id), eq(wishlistItems.productId, p.id)))
    : [];
  const rating = p.ratingCount ? p.ratingSum / p.ratingCount : 0;

  // JSON-LD: aggregateRating only when real reviews exist.
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: p.name,
        description: p.description,
        image: [new URL(p.image, process.env.APP_URL ?? "http://localhost:3000").toString()],
        sku: vs[0]?.sku,
        offers: {
          "@type": "AggregateOffer",
          priceCurrency: "INR",
          lowPrice: (minPrice / 100).toFixed(2),
          highPrice: (Math.max(...vs.map((v) => v.priceCents)) / 100).toFixed(2),
          offerCount: vs.length,
          availability: anyStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        },
        ...(p.ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rating.toFixed(1), reviewCount: p.ratingCount } } : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Shop", item: "/products" },
          { "@type": "ListItem", position: 2, name: c.name, item: `/products?category=${c.slug}` },
          { "@type": "ListItem", position: 3, name: p.name },
        ],
      },
    ],
  };

  return (
    <article className="space-y-12">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <ol className="flex flex-wrap gap-1">
          <li><Link href="/products" className="hover:underline">Shop</Link> /</li>
          <li><Link href={`/products?category=${c.slug}`} className="hover:underline">{c.name}</Link> /</li>
          <li aria-current="page" className="text-fg">{p.name}</li>
        </ol>
      </nav>

      <div className="grid gap-8 md:grid-cols-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.image} alt={p.name} width={800} height={1000} fetchPriority="high" className="w-full rounded-card border border-line object-cover" />
        <div className="space-y-4">
          <h1 className="text-3xl font-bold">{p.name}</h1>
          <div className="flex items-center gap-4">
            <Price cents={minPrice} compareAt={maxCompare} className="text-xl" />
            <Stars rating={rating} count={p.ratingCount} />
          </div>
          <p className="text-muted">{p.description}</p>
          {options.length ? (
            <AddToCart variants={options} productId={p.id} initiallySaved={!!saved} />
          ) : (
            <p className="text-muted">This product has no purchasable options right now.</p>
          )}
          <ul className="space-y-1 border-t border-line pt-4 text-sm text-muted">
            <li>Free shipping over ₹999, otherwise ₹49 flat.</li>
            <li>Stock is held for 30 minutes once you start checkout.</li>
          </ul>
        </div>
      </div>

      <section aria-labelledby="rev" className="space-y-4">
        <h2 id="rev" className="text-xl font-semibold">Reviews</h2>
        {revs.length === 0 && <p className="text-sm text-muted">No reviews yet. Be the first.</p>}
        <ul className="space-y-3">
          {revs.map(({ r, name }) => (
            <li key={r.id} className="rounded-card border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Stars rating={r.rating} count={1} />
                <span className="font-medium">{name}</span>
                {r.verifiedPurchase && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-xs text-ok">Verified purchase</span>}
              </div>
              {r.body && <p className="mt-2 whitespace-pre-wrap text-sm">{r.body}</p>}
            </li>
          ))}
        </ul>
        <ReviewForm productId={p.id} signedIn={!!me} />
      </section>

      {related.items.filter((i) => i.id !== p.id).length > 0 && (
        <section aria-labelledby="rel">
          <h2 id="rel" className="mb-4 text-xl font-semibold">You may also like</h2>
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {related.items.filter((i) => i.id !== p.id).slice(0, 4).map((i) => <ProductCard key={i.id} p={i} />)}
          </ul>
        </section>
      )}
    </article>
  );
}
