import { describe, expect, it } from "vitest";
import { computeTotals, DEFAULT_SHIPPING } from "@/lib/pricing";

const shipping = DEFAULT_SHIPPING; // Rs 49 flat, free over Rs 999
const line = (unitPriceCents: number, qty = 1) => ({ unitPriceCents, qty });

describe("computeTotals", () => {
  it("adds flat shipping below the threshold", () => {
    expect(computeTotals({ lines: [line(50000)], shipping })).toMatchObject({
      subtotalCents: 50000, shippingCents: 4900, totalCents: 54900,
    });
  });

  it("is free exactly at the threshold", () => {
    expect(computeTotals({ lines: [line(99900)], shipping }).shippingCents).toBe(0);
    expect(computeTotals({ lines: [line(99899)], shipping }).shippingCents).toBe(4900);
  });

  it("judges the threshold on the post-discount subtotal", () => {
    const t = computeTotals({
      lines: [line(100000)],
      promo: { type: "percent", value: 10, minSubtotalCents: 0 },
      shipping,
    });
    expect(t.discountCents).toBe(10000);
    expect(t.shippingCents).toBe(4900); // 90000 after discount is below the 99900 threshold

    const above = computeTotals({
      lines: [line(120000)],
      promo: { type: "percent", value: 10, minSubtotalCents: 0 },
      shipping,
    });
    expect(above.shippingCents).toBe(0); // 108000 after discount clears the threshold
  });

  it("caps discounts at the subtotal (100% / oversized fixed)", () => {
    const pct = computeTotals({ lines: [line(20000)], promo: { type: "percent", value: 100, minSubtotalCents: 0 }, shipping });
    expect(pct.discountCents).toBe(20000);
    const fixed = computeTotals({ lines: [line(20000)], promo: { type: "fixed", value: 999999, minSubtotalCents: 0 }, shipping });
    expect(fixed.discountCents).toBe(20000);
    expect(fixed.totalCents).toBe(shipping.flatCents);
  });

  it("ignores a promo below its minimum subtotal", () => {
    const t = computeTotals({ lines: [line(10000)], promo: { type: "percent", value: 50, minSubtotalCents: 50000 }, shipping });
    expect(t.discountCents).toBe(0);
  });

  it("free_shipping promo zeroes shipping without discounting", () => {
    const t = computeTotals({ lines: [line(10000)], promo: { type: "free_shipping", value: 0, minSubtotalCents: 0 }, shipping });
    expect(t).toMatchObject({ discountCents: 0, shippingCents: 0, totalCents: 10000 });
  });

  it("returns zeros for an empty cart and ignores non-positive qty", () => {
    expect(computeTotals({ lines: [], shipping }).totalCents).toBe(0);
    expect(computeTotals({ lines: [line(10000, 0)], shipping }).totalCents).toBe(0);
  });

  it("rounds tax half-up", () => {
    const t = computeTotals({ lines: [line(1005)], shipping: { flatCents: 0, freeOverCents: 0 }, taxRatePercent: 18 });
    expect(t.taxCents).toBe(181); // 180.9 -> 181
  });
});
