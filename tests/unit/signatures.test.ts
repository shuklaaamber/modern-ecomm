import crypto from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

const hmac = (secret: string, data: string) => crypto.createHmac("sha256", secret).update(data).digest("hex");

beforeAll(() => {
  Object.assign(process.env, {
    DATABASE_URL: "postgres://x", BETTER_AUTH_SECRET: "x".repeat(32), PAYMENT_PROVIDER: "razorpay",
    RAZORPAY_KEY_ID: "rzp_test_abc", RAZORPAY_KEY_SECRET: "key_secret_value", RAZORPAY_WEBHOOK_SECRET: "whsec_value",
  });
});

describe("razorpay signatures", () => {
  it("accepts a correct checkout signature (HMAC of order_id|payment_id) and rejects others", async () => {
    const { razorpayProvider } = await import("@/lib/payments/razorpay");
    const good = hmac("key_secret_value", "order_1|pay_1");
    expect(razorpayProvider.verifyCheckoutSignature("order_1", "pay_1", good)).toBe(true);
    expect(razorpayProvider.verifyCheckoutSignature("order_1", "pay_2", good)).toBe(false); // payment swapped
    expect(razorpayProvider.verifyCheckoutSignature("order_2", "pay_1", good)).toBe(false); // order swapped
    expect(razorpayProvider.verifyCheckoutSignature("order_1", "pay_1", "short")).toBe(false); // length mismatch, no throw
  });

  it("verifies webhooks over the exact raw body", async () => {
    const { verifyWebhookSignature } = await import("@/lib/payments/razorpay");
    const raw = '{"event":"payment.captured"}';
    const sig = hmac("whsec_value", raw);
    expect(verifyWebhookSignature(raw, sig)).toBe(true);
    expect(verifyWebhookSignature(raw + " ", sig)).toBe(false); // any body change breaks it
    expect(verifyWebhookSignature(raw, null)).toBe(false);
    expect(verifyWebhookSignature(raw, hmac("other", raw))).toBe(false);
  });

  it("refuses live keys", async () => {
    vi.resetModules(); // env() caches its first result
    process.env.RAZORPAY_KEY_ID = "rzp_live_abc";
    const { env } = await import("@/lib/env");
    expect(() => env()).toThrow(/Live Razorpay keys are not allowed/);
  });
});
