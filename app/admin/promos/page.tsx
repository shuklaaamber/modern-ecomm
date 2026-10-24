import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { promoCodes } from "@/db/schema";
import { NewPromoForm, PromoToggle } from "@/components/AdminControls";

export const metadata: Metadata = { title: "Admin: promos", robots: { index: false } };

export default async function AdminPromos() {
  const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.code));
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Promo codes</h1>
      <NewPromoForm />
      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr><th scope="col" className="p-3">Code</th><th scope="col">Type</th><th scope="col">Value</th><th scope="col">Min (₹)</th><th scope="col">Used</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const now = new Date();
              const active = !(p.endsAt && p.endsAt < now) && !(p.startsAt && p.startsAt > now);
              return (
              <tr key={p.code} className="border-t border-line">
                <th scope="row" className="p-3 text-left font-medium">{p.code}</th>
                <td>{p.type}</td>
                <td>{p.type === "percent" ? `${p.value}%` : p.type === "fixed" ? `₹${p.value / 100}` : "-"}</td>
                <td>{p.minSubtotalCents / 100}</td>
                <td>{p.redeemed}{p.maxRedemptions ? ` / ${p.maxRedemptions}` : ""}</td>
                <td className="py-2"><PromoToggle code={p.code} active={active} /></td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}
