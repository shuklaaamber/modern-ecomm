import type { Metadata } from "next";
import Link from "next/link";
import { getCartView } from "@/lib/cart";
import { formatMoney } from "@/lib/money";
import { PromoBox, QtyControls } from "@/components/CartControls";
import { TotalsTable } from "@/components/Totals";
import { btn, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await getCartView();

  if (cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Your cart is empty</h1>
        <p className="text-muted">Find something you like and it will show up here.</p>
        <Link href="/products" className={btn}>Browse products</Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <section aria-labelledby="h">
        <h1 id="h" className="mb-4 text-2xl font-bold">Your cart ({cart.itemCount})</h1>
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {cart.lines.map((l) => (
            <li key={l.variantId} className="flex gap-4 p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={l.image} alt="" width={96} height={120} loading="lazy" className="h-28 w-24 rounded-lg object-cover" />
              <div className="flex-1 space-y-2">
                <div className="flex justify-between gap-3">
                  <div>
                    <Link href={`/products/${l.slug}`} className="font-medium hover:underline">{l.productName}</Link>
                    <p className="text-sm text-muted">{l.label}</p>
                  </div>
                  <p className="font-semibold">{formatMoney(l.unitPriceCents * l.qty)}</p>
                </div>
                <p className="text-sm text-muted">{formatMoney(l.unitPriceCents)} each</p>
                {l.problem && <Notice kind="error">{l.problem}. Update the quantity or remove it to continue.</Notice>}
                <QtyControls variantId={l.variantId} qty={l.qty} max={l.available} name={`${l.productName} ${l.label}`} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <aside aria-label="Order summary" className="space-y-4 self-start rounded-card border border-line bg-card p-5">
        <PromoBox applied={cart.promoCode} error={cart.promoError} />
        <TotalsTable t={cart.totals} promo={cart.promoCode} />
        {cart.hasProblems ? (
          <Notice kind="error">Fix the items marked above to check out.</Notice>
        ) : (
          <Link href="/checkout" className={`${btn} w-full`}>Checkout</Link>
        )}
        <p className="text-xs text-muted">Prices are recalculated securely at checkout.</p>
      </aside>
    </div>
  );
}
