import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orderLines, orders } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { TotalsTable } from "@/components/Totals";
import { btn, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Order details", robots: { index: false } };
export const dynamic = "force-dynamic";

const COPY: Record<string, { kind: "info" | "error" | "success"; text: string }> = {
  pending: { kind: "info", text: "Waiting for payment. If you just paid, this updates within a few seconds; refresh to check." },
  paid: { kind: "success", text: "Payment received. Thank you! We’re getting your order ready." },
  needs_review: { kind: "info", text: "We received your payment but need to check the order manually. We’ll be in touch by email." },
  cancelled: { kind: "error", text: "This order was cancelled and the items were released." },
  failed: { kind: "error", text: "Payment could not be started for this order." },
};

export default async function OrderPage({
  params, searchParams,
}: { params: Promise<{ number: string }>; searchParams: Promise<{ e?: string; paid?: string }> }) {
  const [{ number }, sp, user] = await Promise.all([params, searchParams, getUser()]);
  const [o] = await db.select().from(orders).where(eq(orders.number, number));
  // Owner, or a guest who knows the order number AND the checkout email. Same 404 either way.
  const allowed = o && ((user && o.userId === user.id) || user?.role === "admin" || (sp.e && sp.e.toLowerCase() === o.email.toLowerCase()));
  if (!o || !allowed) notFound();

  const lines = await db.select().from(orderLines).where(eq(orderLines.orderId, o.id));
  const copy = COPY[o.status];
  const addr = o.shippingAddress;

  return (
    <article className="mx-auto max-w-2xl space-y-6">
      <header>
        <p className="text-sm text-muted">Order</p>
        <h1 className="text-2xl font-bold">{o.number}</h1>
        <p className="mt-1 text-sm capitalize text-muted">Status: {o.status.replace("_", " ")}</p>
      </header>
      {copy && <Notice kind={copy.kind}>{copy.text}</Notice>}

      <section aria-labelledby="items" className="rounded-card border border-line bg-card p-5">
        <h2 id="items" className="mb-3 font-semibold">Items</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3">
              <span>{l.qty} × {l.name}</span><span>{formatMoney(l.unitPriceCents * l.qty, o.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-line pt-3">
          <TotalsTable t={{ subtotalCents: o.subtotalCents, discountCents: o.discountCents, shippingCents: o.shippingCents, taxCents: o.taxCents, totalCents: o.totalCents }} promo={o.promoCode} />
        </div>
      </section>

      <section aria-labelledby="ship" className="rounded-card border border-line bg-card p-5 text-sm">
        <h2 id="ship" className="mb-2 font-semibold">Shipping to</h2>
        <address className="not-italic text-muted">
          {addr.name}<br />{addr.line1}<br />{addr.city}, {addr.state} {addr.pincode}<br />{addr.phone}
        </address>
      </section>
      <Link href="/products" className={btn}>Continue shopping</Link>
    </article>
  );
}
