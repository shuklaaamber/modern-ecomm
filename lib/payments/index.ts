import "server-only";
import { env } from "@/lib/env";
import { razorpayProvider } from "./razorpay";
import { mockProvider } from "./mock";

export type ProviderOrder = { id: string; amount: number; currency: string };
export type ProviderPayment = { id: string; orderId: string; amount: number; currency: string; status: string };

export interface PaymentProvider {
  name: "razorpay" | "mock";
  createOrder(input: { amountCents: number; currency: string; receipt: string; orderId: number }): Promise<ProviderOrder>;
  /** Checks the browser-handler signature. */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean;
  /** Fetches payment details (and captures an authorized payment). */
  fetchPayment(paymentId: string): Promise<ProviderPayment>;
}

export function getProvider(): PaymentProvider {
  return env().PAYMENT_PROVIDER === "mock" ? mockProvider : razorpayProvider;
}
