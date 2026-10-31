import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { categories } from "@/db/schema";
import { listProducts, type SortKey } from "@/lib/catalog";
import { ProductCard } from "@/components/ProductCard";
import { btn, input } from "@/components/ui";

type SP = Promise<{ q?: string; category?: string; sort?: string; page?: string }>;

const SORTS: { key: SortKey; label: string }[] = [
  { key: "newest", label: "Newest" },
  { key: "price-asc", label: "Price: low to high" },
  { key: "price-desc", label: "Price: high to low" },
  { key: "rating", label: "Top rated" },
];

export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  // Filtered/sorted/paginated/search variants are not separate pages for search engines.
  const filtered = sp.q || sp.sort || (sp.page && sp.page !== "1");
  return {
    title: sp.q ? `Search: ${sp.q}` : "Shop all clothing",
    description: "Browse tees, hoodies, bottoms and accessories.",
    alternates: { canonical: "/products" + (sp.category && !filtered ? `?category=${encodeURIComponent(sp.category)}` : "") },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function Products({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const sort = (SORTS.find((s) => s.key === sp.sort)?.key ?? "newest") as SortKey;
  const [cats, { items, total, page, pages }] = await Promise.all([
    db.select().from(categories),
    listProducts({ q: sp.q, category: sp.category, sort, page: Number(sp.page) || 1 }),
  ]);

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q: sp.q, category: sp.category, sort: sp.sort, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/products${s ? `?${s}` : ""}`;
  };

  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <aside aria-label="Filters" className="space-y-6">
        <form action="/products" className="space-y-3">
          <label htmlFor="q" className="block text-sm font-medium">Search</label>
          <input id="q" name="q" type="search" defaultValue={sp.q} className={input} />
          {sp.category && <input type="hidden" name="category" value={sp.category} />}
          <button className={btn}>Search</button>
        </form>
        <nav aria-label="Categories">
          <h2 className="mb-2 text-sm font-medium">Category</h2>
          <ul className="space-y-1 text-sm">
            <li><Link aria-current={!sp.category ? "page" : undefined} className={!sp.category ? "font-semibold underline" : "hover:underline"} href={href({ category: undefined, page: undefined })}>All</Link></li>
            {cats.map((c) => (
              <li key={c.id}>
                <Link aria-current={sp.category === c.slug ? "page" : undefined} className={sp.category === c.slug ? "font-semibold underline" : "hover:underline"} href={href({ category: c.slug, page: undefined })}>{c.name}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <section aria-labelledby="h">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 id="h" className="text-2xl font-bold">{sp.q ? `Results for “${sp.q}”` : "All products"}</h1>
            <p className="text-sm text-muted" aria-live="polite">{total} {total === 1 ? "product" : "products"}</p>
          </div>
          <nav aria-label="Sort" className="flex flex-wrap gap-2 text-sm">
            {SORTS.map((s) => (
              <Link key={s.key} href={href({ sort: s.key === "newest" ? undefined : s.key, page: undefined })}
                aria-current={sort === s.key ? "true" : undefined}
                className={`rounded-full border px-3 py-1 ${sort === s.key ? "border-accent bg-accent text-accent-fg" : "border-line bg-card"}`}>
                {s.label}
              </Link>
            ))}
          </nav>
        </div>

        {items.length === 0 ? (
          <div className="rounded-card border border-dashed border-line p-10 text-center">
            <p className="font-medium">Nothing matched{sp.q ? ` “${sp.q}”` : ""}.</p>
            <p className="mt-1 text-sm text-muted">Check the spelling, try a broader word like “tee”, or browse a category.</p>
            <Link href="/products" className={`${btn} mt-4`}>Clear filters</Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 3} level={2} />)}
          </ul>
        )}

        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-8 flex items-center justify-center gap-2 text-sm">
            {page > 1 && <Link className="rounded-full border border-line px-4 py-2" href={href({ page: String(page - 1) })}>Previous</Link>}
            <span className="px-2 text-muted">Page {page} of {pages}</span>
            {page < pages && <Link className="rounded-full border border-line px-4 py-2" href={href({ page: String(page + 1) })}>Next</Link>}
          </nav>
        )}
      </section>
    </div>
  );
}
