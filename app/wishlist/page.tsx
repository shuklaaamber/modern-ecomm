import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { ProductCard } from "@/components/ProductCard";
import { btn } from "@/components/ui";
import type { ListItem } from "@/lib/catalog";

export const metadata: Metadata = { title: "Wishlist", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Wishlist() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/wishlist");
  const rows = await db.execute(sql`
    SELECT p.id, p.slug, p.name, p.image, c.name AS category, p.rating_sum, p.rating_count,
      MIN(v.price_cents) AS min_price, MAX(v.compare_at_cents) AS compare_at,
      COALESCE(SUM(GREATEST(v.on_hand - v.reserved, 0)), 0) AS available
    FROM wishlist_items w JOIN products p ON p.id = w.product_id
    JOIN categories c ON c.id = p.category_id JOIN variants v ON v.product_id = p.id
    WHERE w.user_id = ${user.id} AND p.status = 'active' GROUP BY p.id, c.name`);
  const items: ListItem[] = rows.rows.map((r) => ({
    id: Number(r.id), slug: String(r.slug), name: String(r.name), image: String(r.image), category: String(r.category),
    minPrice: Number(r.min_price), compareAt: r.compare_at == null ? null : Number(r.compare_at), available: Number(r.available),
    rating: Number(r.rating_count) ? Number(r.rating_sum) / Number(r.rating_count) : 0, ratingCount: Number(r.rating_count),
  }));
  return (
    <section aria-labelledby="h" className="space-y-4">
      <h1 id="h" className="text-2xl font-bold">Your wishlist</h1>
      {items.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-10 text-center">
          <p>Nothing saved yet. Tap “Save” on any product.</p>
          <Link href="/products" className={`${btn} mt-4`}>Browse products</Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">{items.map((p) => <ProductCard key={p.id} p={p} level={2} />)}</ul>
      )}
    </section>
  );
}
