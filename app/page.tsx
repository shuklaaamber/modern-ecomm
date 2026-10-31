import Link from "next/link";
import { db } from "@/lib/db";
import { categories } from "@/db/schema";
import { listProducts } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { btn } from "@/components/ui";

export const revalidate = 60;

export default async function Home() {
  const [cats, featured] = await Promise.all([db.select().from(categories), listProducts({ sort: "rating" })]);
  return (
    <div className="space-y-14">
      <section className="rounded-card bg-accent px-6 py-14 text-accent-fg sm:px-12">
        <p className="text-sm uppercase tracking-widest opacity-80">New season</p>
        <h1 className="mt-2 max-w-xl text-4xl font-bold leading-tight sm:text-5xl">Everyday clothing, made to last.</h1>
        <p className="mt-4 max-w-lg opacity-90">Honest fabrics, easy fits. Free shipping over ₹999 and 30-minute stock holds at checkout.</p>
        <Link href="/products" className="mt-6 inline-flex rounded-full bg-accent-fg px-6 py-3 font-semibold text-accent hover:opacity-90">
          Shop all
        </Link>
      </section>

      <section aria-labelledby="cats">
        <h2 id="cats" className="mb-4 text-xl font-semibold">Shop by category</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {cats.map((c) => (
            <li key={c.id}>
              <Link href={`/products?category=${c.slug}`} className="block rounded-card border border-line bg-card px-4 py-6 text-center font-medium hover:border-accent">
                {c.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="feat">
        <div className="mb-4 flex items-end justify-between">
          <h2 id="feat" className="text-xl font-semibold">Customer favourites</h2>
          <Link href="/products" className={btn}>View all</Link>
        </div>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {featured.items.slice(0, 4).map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} />)}
        </ul>
      </section>
    </div>
  );
}
