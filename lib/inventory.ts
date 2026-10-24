import { and, eq, sql } from "drizzle-orm";
import { db, type Tx } from "@/lib/db";
import { orderEvents, orders, promoCodes, reservations } from "@/db/schema";

export const RESERVATION_MINUTES = 30;

export class OutOfStockError extends Error {
  constructor(public variantId: number, public available: number, public label: string) {
    super(
      available > 0
        ? `Only ${available} left of ${label}. Please reduce the quantity.`
        : `${label} is out of stock.`,
    );
    this.name = "OutOfStockError";
  }
}

/**
 * Reserves stock with a guarded UPDATE: the WHERE clause is the guard, so two concurrent checkouts
 * can never both win the last unit. Variants are locked in id order to avoid deadlocks.
 */
export async function reserveStock(tx: Tx, lines: { variantId: number; qty: number; label: string }[]) {
  for (const l of [...lines].sort((a, b) => a.variantId - b.variantId)) {
    const res = await tx.execute(sql`
      UPDATE variants SET reserved = reserved + ${l.qty}
      WHERE id = ${l.variantId} AND on_hand - reserved >= ${l.qty}
      RETURNING id`);
    if (res.rows.length === 0) {
      const cur = await tx.execute(sql`SELECT on_hand - reserved AS available FROM variants WHERE id = ${l.variantId}`);
      throw new OutOfStockError(l.variantId, Math.max(0, Number(cur.rows[0]?.available ?? 0)), l.label);
    }
  }
}

/**
 * Cancels a still-pending order: releases its active reservations and its promo claim.
 * Returns false when the order is not pending (or is locked by another worker).
 */
export async function cancelPendingOrder(tx: Tx, orderId: number, to: "cancelled" | "failed" = "cancelled", actorId?: string) {
  const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update", { skipLocked: true });
  if (!o || o.status !== "pending") return false;

  const active = await tx
    .select()
    .from(reservations)
    .where(and(eq(reservations.orderId, orderId), eq(reservations.status, "active")))
    .for("update");
  for (const r of active.sort((a, b) => a.variantId - b.variantId)) {
    await tx.execute(sql`UPDATE variants SET reserved = reserved - ${r.qty} WHERE id = ${r.variantId}`);
    await tx.update(reservations).set({ status: "released" }).where(eq(reservations.id, r.id));
  }
  if (o.promoCode) {
    await tx.execute(sql`UPDATE promo_codes SET redeemed = GREATEST(redeemed - 1, 0) WHERE code = ${o.promoCode}`);
  }
  await tx.update(orders).set({ status: to }).where(eq(orders.id, orderId));
  await tx.insert(orderEvents).values({ orderId, actorId: actorId ?? null, fromStatus: "pending", toStatus: to });
  return true;
}

/** Releases reservations whose time ran out. Safe to call concurrently and repeatedly. */
export async function releaseExpiredReservations(): Promise<number> {
  const due = await db.execute(
    sql`SELECT DISTINCT order_id FROM reservations WHERE status = 'active' AND expires_at < now()`,
  );
  let released = 0;
  for (const row of due.rows) {
    const ok = await db.transaction((tx) => cancelPendingOrder(tx, Number(row.order_id), "cancelled"));
    if (ok) released++;
  }
  return released;
}

export { promoCodes };
