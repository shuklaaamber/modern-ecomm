import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cartLines, carts, orderEvents, orderLines, orders, paymentEvents, products, reservations, variants,
} from "@/db/schema";
import { computeTotals, DEFAULT_SHIPPING } from "@/lib/pricing";
import { PromoError, resolvePromo } from "@/lib/promo";
import { cancelPendingOrder, releaseExpiredReservations, reserveStock, RESERVATION_MINUTES } from "@/lib/inventory";
import { getProvider } from "@/lib/payments";
import { sendReceipt } from "@/lib/email";

export type CheckoutInput = {
  userId: string | null;
  email: string;
  address: Record<string, string>;
  lines: { variantId: number; qty: number }[];
  promoCode?: string | null;
  idempotencyKey: string;
};

export type CheckoutResult = {
  orderNumber: string;
  providerOrderId: string;
  amountCents: number;
  currency: string;
  provider: "razorpay" | "mock";
};

// Drizzle wraps driver errors, so the Postgres code can be on `.cause`.
const isUniqueViolation = (e: unknown) =>
  (e as { code?: string })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";

/** The winner of an idempotency-key race may still be creating the provider order; wait briefly. */
async function awaitExistingOrder(key: string) {
  for (let i = 0; i < 40; i++) {
    const [o] = await db.select().from(orders).where(eq(orders.idempotencyKey, key));
    if (o?.paymentRef) return o;
    if (o && o.status !== "pending") return o;
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function toResult(o: typeof orders.$inferSelect): CheckoutResult {
  return {
    orderNumber: o.number,
    providerOrderId: o.paymentRef!,
    amountCents: o.totalCents,
    currency: o.currency,
    provider: getProvider().name,
  };
}

export async function startCheckout(input: CheckoutInput): Promise<CheckoutResult> {
  const prior = await db.select().from(orders).where(eq(orders.idempotencyKey, input.idempotencyKey));
  if (prior[0]?.paymentRef) return toResult(prior[0]);

  await releaseExpiredReservations();

  // Merge duplicate lines and sanity-check quantities. Prices NEVER come from the client.
  const qtyById = new Map<number, number>();
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 20) throw new Error("Invalid quantity.");
    qtyById.set(l.variantId, (qtyById.get(l.variantId) ?? 0) + l.qty);
  }
  if (qtyById.size === 0) throw new Error("Your cart is empty.");

  let created: typeof orders.$inferSelect;
  try {
    created = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ v: variants, p: products })
        .from(variants)
        .innerJoin(products, eq(products.id, variants.productId))
        .where(inArray(variants.id, [...qtyById.keys()]));
      if (rows.length !== qtyById.size || rows.some((r) => r.p.status !== "active")) {
        throw new Error("Some items in your cart are no longer available.");
      }

      const priced = rows.map(({ v, p }) => ({
        variantId: v.id,
        sku: v.sku,
        label: `${p.name} (${v.label})`,
        unitPriceCents: v.priceCents,
        qty: qtyById.get(v.id)!,
      }));
      const subtotal = priced.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);

      let promoRule = null;
      let promoCode: string | null = null;
      if (input.promoCode) {
        const promo = await resolvePromo(input.promoCode, subtotal);
        // Atomic claim: the cap holds even under concurrent checkouts.
        const claim = await tx.execute(sql`
          UPDATE promo_codes SET redeemed = redeemed + 1
          WHERE code = ${promo.code} AND (max_redemptions IS NULL OR redeemed < max_redemptions)
          RETURNING code`);
        if (claim.rows.length === 0) throw new PromoError("That code has been fully redeemed.");
        promoRule = promo.rule;
        promoCode = promo.code;
      }

      const totals = computeTotals({ lines: priced, promo: promoRule, shipping: DEFAULT_SHIPPING });

      await reserveStock(tx, priced.map((l) => ({ variantId: l.variantId, qty: l.qty, label: l.label })));

      const number = `ORD-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString("hex").toUpperCase()}`;
      const [order] = await tx
        .insert(orders)
        .values({
          number,
          userId: input.userId,
          email: input.email,
          status: "pending",
          currency: "INR",
          ...totals,
          promoCode,
          idempotencyKey: input.idempotencyKey,
          shippingAddress: input.address,
        })
        .returning();

      await tx.insert(orderLines).values(
        priced.map((l) => ({
          orderId: order.id, variantId: l.variantId, name: l.label, sku: l.sku, unitPriceCents: l.unitPriceCents, qty: l.qty,
        })),
      );
      const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000);
      await tx.insert(reservations).values(
        priced.map((l) => ({ orderId: order.id, variantId: l.variantId, qty: l.qty, expiresAt })),
      );
      await tx.insert(orderEvents).values({ orderId: order.id, toStatus: "pending" });
      return order;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      // Same idempotency key raced with us: return the winner's order.
      const again = await awaitExistingOrder(input.idempotencyKey);
      if (again?.paymentRef) return toResult(again);
      throw new Error("That checkout is still being processed. Please try again in a moment.");
    }
    throw e;
  }

  try {
    const po = await getProvider().createOrder({
      amountCents: created.totalCents, currency: created.currency, receipt: created.number, orderId: created.id,
    });
    const [updated] = await db.update(orders).set({ paymentRef: po.id }).where(eq(orders.id, created.id)).returning();
    return toResult(updated);
  } catch (e) {
    await db.transaction((tx) => cancelPendingOrder(tx, created.id, "failed"));
    throw new Error("We couldn't start the payment. Your items were released; please try again.");
  }
}

export type PaidResult = { outcome: "paid" | "already_paid" | "needs_review" | "duplicate_event" | "unknown_order" };

/**
 * The ONE place an order becomes paid. Called by both the browser-verify endpoint and the webhook.
 * Idempotent: row-locks the order, and dedupes webhook events inside the same transaction.
 */
export async function markOrderPaid(input: {
  paymentRef: string; paymentId: string; amountCents: number; currency: string; eventId?: string;
}): Promise<PaidResult> {
  let receipt: Parameters<typeof sendReceipt>[0] | null = null;

  const result = await db.transaction(async (tx): Promise<PaidResult> => {
    if (input.eventId) {
      const ins = await tx.insert(paymentEvents).values({ id: input.eventId }).onConflictDoNothing().returning();
      if (ins.length === 0) return { outcome: "duplicate_event" };
    }

    const [o] = await tx.select().from(orders).where(eq(orders.paymentRef, input.paymentRef)).for("update");
    if (!o) return { outcome: "unknown_order" };
    if (["paid", "fulfilled", "shipped", "delivered", "refunded", "partially_refunded"].includes(o.status)) {
      return { outcome: "already_paid" };
    }
    if (o.status !== "pending" && o.status !== "cancelled") return { outcome: "needs_review" };

    const setReview = async (): Promise<PaidResult> => {
      await tx.update(orders).set({ status: "needs_review", paymentId: input.paymentId }).where(eq(orders.id, o.id));
      await tx.insert(orderEvents).values({ orderId: o.id, fromStatus: o.status, toStatus: "needs_review" });
      return { outcome: "needs_review" };
    };

    if (input.amountCents !== o.totalCents || input.currency !== o.currency) return setReview();

    const lines = await tx.select().from(orderLines).where(eq(orderLines.orderId, o.id));

    if (o.status === "pending") {
      const active = await tx
        .select()
        .from(reservations)
        .where(and(eq(reservations.orderId, o.id), eq(reservations.status, "active")));
      for (const r of active.sort((a, b) => a.variantId - b.variantId)) {
        await tx.execute(sql`UPDATE variants SET on_hand = on_hand - ${r.qty}, reserved = reserved - ${r.qty} WHERE id = ${r.variantId}`);
        await tx.update(reservations).set({ status: "committed" }).where(eq(reservations.id, r.id));
      }
    } else {
      // Late payment on an order whose reservation expired: re-take the stock if it's still there.
      try {
        await tx.transaction(async (sp) => {
          for (const l of [...lines].sort((a, b) => a.variantId - b.variantId)) {
            const r = await sp.execute(sql`
              UPDATE variants SET on_hand = on_hand - ${l.qty}
              WHERE id = ${l.variantId} AND on_hand - reserved >= ${l.qty} RETURNING id`);
            if (r.rows.length === 0) throw new Error("stock-gone");
          }
        });
      } catch {
        return setReview();
      }
      if (o.promoCode) {
        await tx.execute(sql`UPDATE promo_codes SET redeemed = redeemed + 1 WHERE code = ${o.promoCode}`);
      }
    }

    await tx.update(orders).set({ status: "paid", paymentId: input.paymentId }).where(eq(orders.id, o.id));
    await tx.insert(orderEvents).values({ orderId: o.id, fromStatus: o.status, toStatus: "paid" });
    if (o.userId) {
      const [c] = await tx.select().from(carts).where(eq(carts.userId, o.userId));
      if (c) await tx.delete(cartLines).where(eq(cartLines.cartId, c.id));
    }
    receipt = {
      number: o.number, email: o.email, totalCents: o.totalCents, currency: o.currency,
      lines: lines.map((l) => ({ name: l.name, qty: l.qty, unitPriceCents: l.unitPriceCents })),
    };
    return { outcome: "paid" };
  });

  if (receipt) await sendReceipt(receipt);
  return result;
}
