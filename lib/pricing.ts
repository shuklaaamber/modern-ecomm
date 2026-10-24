export type PricedLine = { unitPriceCents: number; qty: number };

export type PromoRule = {
  type: "percent" | "fixed" | "free_shipping";
  value: number; // percent (0-100) or minor units for fixed
  minSubtotalCents: number;
};

export type ShippingRules = { flatCents: number; freeOverCents: number };

export type Totals = {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
};

/**
 * Order: subtotal -> promo discount (capped at subtotal) -> shipping (free threshold judged on the
 * post-discount subtotal; free_shipping promo zeroes it) -> tax -> total.
 * `taxRatePercent` is applied on top (exclusive). Use 0 when prices are tax-inclusive (default).
 * Rounding: half-up on the minor unit.
 */
export function computeTotals(input: {
  lines: PricedLine[];
  promo?: PromoRule | null;
  shipping: ShippingRules;
  taxRatePercent?: number;
}): Totals {
  const subtotalCents = input.lines.reduce((s, l) => s + l.unitPriceCents * Math.max(0, l.qty), 0);
  if (subtotalCents === 0) {
    return { subtotalCents: 0, discountCents: 0, shippingCents: 0, taxCents: 0, totalCents: 0 };
  }

  let discountCents = 0;
  let freeShipping = false;
  const promo = input.promo;
  if (promo && subtotalCents >= promo.minSubtotalCents) {
    if (promo.type === "percent") {
      discountCents = Math.round((subtotalCents * Math.min(100, Math.max(0, promo.value))) / 100);
    } else if (promo.type === "fixed") {
      discountCents = Math.max(0, promo.value);
    } else {
      freeShipping = true;
    }
  }
  discountCents = Math.min(discountCents, subtotalCents);

  const afterDiscount = subtotalCents - discountCents;
  const shippingCents =
    freeShipping || afterDiscount >= input.shipping.freeOverCents ? 0 : input.shipping.flatCents;
  const taxCents = Math.round((afterDiscount * (input.taxRatePercent ?? 0)) / 100);
  const totalCents = afterDiscount + shippingCents + taxCents;
  return { subtotalCents, discountCents, shippingCents, taxCents, totalCents };
}

export const DEFAULT_SHIPPING: ShippingRules = { flatCents: 4900, freeOverCents: 99900 };
