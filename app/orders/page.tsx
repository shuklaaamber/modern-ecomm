import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { btn } from "@/components/ui";

export const metadata: Metadata = { title: "Your orders", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/orders");
  const rows = await db.select().from(orders).where(eq(orders.userId, user.id)).orderBy(desc(orders.createdAt));

  return (
    <section aria-labelledby="h" className="space-y-4">
      <h1 id="h" className="text-2xl font-bold">Your orders</h1>
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-10 text-center">
          <p>You haven’t placed any orders yet.</p>
          <Link href="/products" className={`${btn} mt-4`}>Start shopping</Link>
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {rows.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <Link href={`/orders/${o.number}`} className="font-medium hover:underline">{o.number}</Link>
                <p className="text-sm text-muted">{o.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })}</p>
              </div>
              <span className="rounded-full border border-line px-3 py-1 text-xs capitalize">{o.status.replace("_", " ")}</span>
              <span className="font-semibold">{formatMoney(o.totalCents, o.currency)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
