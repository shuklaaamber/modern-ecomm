import "server-only";
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "@/lib/env";
import type { PaymentProvider } from "./index";

let client: Razorpay | undefined;
function rzp() {
  const e = env();
  client ??= new Razorpay({ key_id: e.RAZORPAY_KEY_ID!, key_secret: e.RAZORPAY_KEY_SECRET! });
  return client;
}

export function hmacHex(secret: string, data: string) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqualHex(a: string, b: string) {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Verifies X-Razorpay-Signature over the raw webhook body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const secret = env().RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  return safeEqualHex(hmacHex(secret, rawBody), signature);
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrder({ amountCents, currency, receipt, orderId }) {
    const o = await rzp().orders.create({ amount: amountCents, currency, receipt, notes: { orderId: String(orderId) } });
    return { id: o.id, amount: Number(o.amount), currency: o.currency };
  },

  verifyCheckoutSignature(orderId, paymentId, signature) {
    return safeEqualHex(hmacHex(env().RAZORPAY_KEY_SECRET!, `${orderId}|${paymentId}`), signature);
  },

  async fetchPayment(paymentId) {
    let p = await rzp().payments.fetch(paymentId);
    if (p.status === "authorized") {
      p = await rzp().payments.capture(paymentId, Number(p.amount), p.currency);
    }
    return { id: p.id, orderId: String(p.order_id), amount: Number(p.amount), currency: p.currency, status: p.status };
  },
};
