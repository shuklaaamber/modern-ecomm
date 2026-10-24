import "server-only";
import crypto from "node:crypto";
import { db } from "@/lib/db";
import { orders } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { PaymentProvider } from "./index";

/** Local-only provider: no network, no signatures. Only active when PAYMENT_PROVIDER=mock. */
export const mockProvider: PaymentProvider = {
  name: "mock",
  async createOrder({ amountCents, currency }) {
    return { id: `mock_order_${crypto.randomBytes(8).toString("hex")}`, amount: amountCents, currency };
  },
  verifyCheckoutSignature() {
    return true;
  },
  async fetchPayment(paymentId) {
    const [o] = await db.select().from(orders).where(eq(orders.paymentRef, paymentId.replace(/^mock_pay_/, "mock_order_")));
    return { id: paymentId, orderId: o?.paymentRef ?? "", amount: o?.totalCents ?? 0, currency: "INR", status: "captured" };
  },
};
