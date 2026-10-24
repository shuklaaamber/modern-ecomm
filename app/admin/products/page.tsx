import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, products, variants } from "@/db/schema";
import { ArchiveButton, NewProductForm, StockAdjuster } from "@/components/AdminControls";

export const metadata: Metadata = { title: "Admin: products", robots: { index: false } };

export default async function AdminProducts() {
  const [cats, rows] = await Promise.all([
    db.select().from(categories),
    db.select({ p: products, v: variants }).from(products).innerJoin(variants, eq(variants.productId, products.id)).orderBy(asc(products.id), asc(variants.id)),
  ]);
  const grouped = new Map<number, { p: typeof products.$inferSelect; vs: (typeof variants.$inferSelect)[] }>();
  for (const { p, v } of rows) {
    if (!grouped.has(p.id)) grouped.set(p.id, { p, vs: [] });
    grouped.get(p.id)!.vs.push(v);
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Products &amp; stock</h1>
      <NewProductForm categories={cats} />
      <div className="space-y-6">
        {[...grouped.values()].map(({ p, vs }) => (
          <section key={p.id} aria-label={p.name} className="rounded-card border border-line bg-card">
            <header className="flex items-center justify-between gap-3 border-b border-line p-4">
              <div>
                <h2 className="font-semibold">{p.name}</h2>
                <p className="text-xs text-muted">{p.status}</p>
              </div>
              <ArchiveButton productId={p.id} status={p.status} />
            </header>
            <table className="w-full text-sm">
              <thead className="text-left text-muted">
                <tr><th scope="col" className="p-3">Variant</th><th scope="col">On hand</th><th scope="col">Reserved</th><th scope="col">Adjust</th></tr>
              </thead>
              <tbody>
                {vs.map((v) => (
                  <tr key={v.id} className="border-t border-line">
                    <th scope="row" className="p-3 text-left font-normal">{v.label}</th>
                    <td>{v.onHand}</td><td>{v.reserved}</td>
                    <td className="py-2"><StockAdjuster variantId={v.id} label={`${p.name} ${v.label}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
