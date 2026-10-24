import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import crypto from "node:crypto";
import { db, pool } from "@/lib/db";
import { orders, products, promoCodes, variants } from "@/db/schema";
import { markOrderPaid, startCheckout } from "@/lib/checkout";
import { OutOfStockError, releaseExpiredReservations } from "@/lib/inventory";
import { PromoError } from "@/lib/promo";

// These tests run against the real database configured in DATABASE_URL, using their own
// uniquely tagged rows, and delete everything they created afterwards.
const TAG = `itest-${crypto.randomBytes(4).toString("hex")}`;
const EMAIL = `${TAG}@example.com`;
const ADDRESS = { name: "Test", phone: "9876543210", line1: "1 Test St", city: "Pune", state: "MH", pincode: "411001" };

async function makeVariant(stock: number, price = 50000) {
  const [p] = await db
    .insert(products)
    .values({ slug: `${TAG}-${crypto.randomBytes(3).toString("hex")}`, name: "Test product", categoryId: 1 })
    .returning();
  const [v] = await db
    .insert(variants)
    .values({ productId: p.id, sku: `${p.slug}-sku`, label: "T / One", priceCents: price, onHand: stock })
    .returning();
  return v;
}
const key = () => crypto.randomUUID();
const checkout = (variantId: number, qty = 1, extra: { promoCode?: string; idempotencyKey?: string } = {}) =>
  startCheckout({
    userId: null, email: EMAIL, address: ADDRESS, lines: [{ variantId, qty }],
    idempotencyKey: extra.idempotencyKey ?? key(), promoCode: extra.promoCode,
  });
const stock = async (id: number) => (await db.select().from(variants).where(eq(variants.id, id)))[0];
const expire = (orderNumber: string) =>
  pool.query(
    "UPDATE reservations SET expires_at = now() - interval '1 minute' WHERE order_id = (SELECT id FROM orders WHERE number = $1)",
    [orderNumber],
  );

beforeAll(async () => {
  await db.select().from(products).limit(1); // fail fast if the DB is unreachable
});

afterAll(async () => {
  await db.delete(orders).where(eq(orders.email, EMAIL));
  await db.delete(products).where(like(products.slug, `${TAG}%`));
  await db.delete(promoCodes).where(like(promoCodes.code, `${TAG.toUpperCase()}%`));
  await pool.query("DELETE FROM payment_events WHERE id LIKE $1", [`%${TAG}`]);
  await pool.end();
});

describe("inventory", () => {
  it("oversell: stock 1, 5 concurrent checkouts -> exactly one wins, never negative", async () => {
    const v = await makeVariant(1);
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => checkout(v.id)));
    const ok = results.filter((r) => r.status === "fulfilled");
    const bad = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    expect(bad).toHaveLength(4);
    for (const b of bad) expect(b.reason).toBeInstanceOf(OutOfStockError);
    const s = await stock(v.id);
    expect(s.reserved).toBe(1);
    expect(s.onHand - s.reserved).toBe(0);
  });

  it("reservation expiry releases stock and cancels the order", async () => {
    const v = await makeVariant(2);
    const r = await checkout(v.id, 2);
    expect((await stock(v.id)).reserved).toBe(2);
    await expire(r.orderNumber);
    await releaseExpiredReservations();
    expect((await stock(v.id)).reserved).toBe(0);
    const [o] = await db.select().from(orders).where(eq(orders.number, r.orderNumber));
    expect(o.status).toBe("cancelled");
  });
});

describe("checkout", () => {
  it("is idempotent for the same key (one order, one reservation)", async () => {
    const v = await makeVariant(5);
    const k = key();
    const [a, b] = await Promise.all([
      checkout(v.id, 1, { idempotencyKey: k }),
      checkout(v.id, 1, { idempotencyKey: k }),
    ]);
    expect(a.orderNumber).toBe(b.orderNumber);
    expect((await stock(v.id)).reserved).toBe(1);
  });

  it("computes the total on the server from DB prices (500.00 + 49.00 shipping)", async () => {
    const v = await makeVariant(5, 50000);
    const r = await checkout(v.id, 1);
    expect(r.amountCents).toBe(50000 + 4900);
  });

  it("promo redemption cap holds under concurrency", async () => {
    const code = `${TAG.toUpperCase()}-ONE`;
    await db.insert(promoCodes).values({ code, type: "percent", value: 10, maxRedemptions: 1 });
    const v = await makeVariant(10);
    const res = await Promise.allSettled([
      checkout(v.id, 1, { promoCode: code }),
      checkout(v.id, 1, { promoCode: code }),
    ]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rej = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rej.reason).toBeInstanceOf(PromoError);
    const [p] = await db.select().from(promoCodes).where(eq(promoCodes.code, code));
    expect(p.redeemed).toBe(1);
  });
});

describe("payment confirmation", () => {
  it("verify + webhook + replayed event for the same payment decrement stock once", async () => {
    const v = await makeVariant(3);
    const r = await checkout(v.id, 2);
    const pay = { paymentRef: r.providerOrderId, paymentId: "pay_1", amountCents: r.amountCents, currency: "INR" };

    const a = await markOrderPaid(pay); // browser verify path (no event id)
    const b = await markOrderPaid({ ...pay, eventId: `evt_1_${TAG}` }); // webhook, same payment
    const c = await markOrderPaid({ ...pay, eventId: `evt_1_${TAG}` }); // webhook replay
    expect(a.outcome).toBe("paid");
    expect(b.outcome).toBe("already_paid");
    expect(c.outcome).toBe("duplicate_event");

    const s = await stock(v.id);
    expect(s.onHand).toBe(1);
    expect(s.reserved).toBe(0);
  });

  it("amount mismatch -> needs_review, not paid, stock untouched", async () => {
    const v = await makeVariant(3);
    const r = await checkout(v.id, 1);
    const out = await markOrderPaid({ paymentRef: r.providerOrderId, paymentId: "pay_x", amountCents: 100, currency: "INR" });
    expect(out.outcome).toBe("needs_review");
    const [o] = await db.select().from(orders).where(eq(orders.number, r.orderNumber));
    expect(o.status).toBe("needs_review");
    expect((await stock(v.id)).onHand).toBe(3);
  });

  it("late payment after expiry re-takes the stock when it is still available", async () => {
    const v = await makeVariant(1);
    const r = await checkout(v.id, 1);
    await expire(r.orderNumber);
    await releaseExpiredReservations();
    const out = await markOrderPaid({ paymentRef: r.providerOrderId, paymentId: "pay_late", amountCents: r.amountCents, currency: "INR" });
    expect(out.outcome).toBe("paid");
    expect((await stock(v.id)).onHand).toBe(0);
  });

  it("late payment when the stock was sold elsewhere -> needs_review, never negative", async () => {
    const v = await makeVariant(1);
    const r = await checkout(v.id, 1);
    await expire(r.orderNumber);
    await releaseExpiredReservations();
    await checkout(v.id, 1); // someone else takes the last unit
    const out = await markOrderPaid({ paymentRef: r.providerOrderId, paymentId: "pay_late2", amountCents: r.amountCents, currency: "INR" });
    expect(out.outcome).toBe("needs_review");
    const s = await stock(v.id);
    expect(s.onHand).toBe(1);
    expect(s.onHand - s.reserved).toBeGreaterThanOrEqual(0);
  });
});
