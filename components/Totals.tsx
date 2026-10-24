import type { Totals } from "@/lib/pricing";
import { formatMoney } from "@/lib/money";

export function TotalsTable({ t, promo }: { t: Totals; promo?: string | null }) {
  const row = "flex justify-between py-1";
  return (
    <dl className="text-sm">
      <div className={row}><dt>Subtotal</dt><dd>{formatMoney(t.subtotalCents)}</dd></div>
      {t.discountCents > 0 && (
        <div className={`${row} text-ok`}><dt>Discount{promo ? ` (${promo})` : ""}</dt><dd>−{formatMoney(t.discountCents)}</dd></div>
      )}
      <div className={row}><dt>Shipping</dt><dd>{t.shippingCents === 0 ? "Free" : formatMoney(t.shippingCents)}</dd></div>
      {t.taxCents > 0 && <div className={row}><dt>Tax</dt><dd>{formatMoney(t.taxCents)}</dd></div>}
      <div className={`${row} mt-2 border-t border-line pt-3 text-base font-semibold`}><dt>Total</dt><dd>{formatMoney(t.totalCents)}</dd></div>
    </dl>
  );
}
