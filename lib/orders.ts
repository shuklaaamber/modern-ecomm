export type OrderStatus =
  | "pending" | "paid" | "fulfilled" | "shipped" | "delivered"
  | "cancelled" | "failed" | "refunded" | "partially_refunded" | "needs_review";

const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled", "failed", "needs_review"],
  paid: ["fulfilled", "refunded", "partially_refunded", "needs_review"],
  fulfilled: ["shipped", "refunded", "partially_refunded"],
  shipped: ["delivered", "refunded", "partially_refunded"],
  delivered: ["refunded", "partially_refunded"],
  cancelled: ["paid", "needs_review"], // a late payment can still land on a cancelled order
  failed: [],
  refunded: [],
  partially_refunded: ["refunded"],
  needs_review: ["paid", "cancelled", "refunded"],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) throw new Error(`Illegal order transition ${from} -> ${to}`);
}

/** Statuses an admin may set by hand. */
export const ADMIN_SETTABLE: OrderStatus[] = ["fulfilled", "shipped", "delivered", "cancelled"];
