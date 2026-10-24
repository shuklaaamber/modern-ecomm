import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCartView } from "@/lib/cart";
import { getUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { CheckoutForm } from "@/components/CheckoutForm";
import { TotalsTable } from "@/components/Totals";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const [cart, user] = await Promise.all([getCartView(), getUser()]);
  if (cart.lines.length === 0) redirect("/cart");
  if (cart.hasProblems) redirect("/cart");

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <section aria-labelledby="h">
        <h1 id="h" className="mb-4 text-2xl font-bold">Checkout</h1>
        {!user && (
          <p className="mb-4 text-sm text-muted">
            Checking out as a guest. <Link className="underline" href="/sign-in?next=/checkout">Sign in</Link> to track orders.
          </p>
        )}
        <CheckoutForm defaultEmail={user?.email ?? ""} defaultName={user?.name ?? ""} totalLabel={formatMoney(cart.totals.totalCents)} />
      </section>
      <aside aria-label="Order summary" className="space-y-3 self-start rounded-card border border-line bg-card p-5">
        <h2 className="font-semibold">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex justify-between gap-3">
              <span>{l.qty} × {l.productName} <span className="text-muted">({l.label})</span></span>
              <span>{formatMoney(l.unitPriceCents * l.qty)}</span>
            </li>
          ))}
        </ul>
        <TotalsTable t={cart.totals} promo={cart.promoCode} />
        <p className="text-xs text-muted">Stock is reserved for 30 minutes after you press Pay.</p>
      </aside>
    </div>
  );
}
