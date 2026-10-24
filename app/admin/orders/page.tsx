import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/db/schema";
import { formatMoney } from "@/lib/money";
import { ADMIN_SETTABLE, canTransition, type OrderStatus } from "@/lib/orders";
import { OrderStatusSelect } from "@/components/AdminControls";

export const metadata: Metadata = { title: "Admin: orders", robots: { index: false } };

export default async function AdminOrders() {
  const rows = await db.select().from(orders).orderBy(desc(orders.createdAt)).limit(100);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Orders</h1>
      <div className="overflow-x-auto rounded-card border border-line bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-muted">
            <tr><th scope="col" className="p-3">Order</th><th scope="col">Customer</th><th scope="col">Total</th><th scope="col">Status</th></tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <th scope="row" className="p-3 text-left font-medium">{o.number}</th>
                <td>{o.email}</td>
                <td>{formatMoney(o.totalCents, o.currency)}</td>
                <td className="py-2">
                  <OrderStatusSelect
                    orderId={o.id} current={o.status}
                    options={ADMIN_SETTABLE.filter((s) => s === "cancelled" ? o.status === "pending" || canTransition(o.status as OrderStatus, s) : canTransition(o.status as OrderStatus, s))}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-muted">No orders yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
