import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/payments";
import { markOrderPaid } from "@/lib/checkout";

const body = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = parsed.data;

  const provider = getProvider();
  if (provider.name !== "razorpay" || !provider.verifyCheckoutSignature(orderId, paymentId, sig)) {
    return NextResponse.json({ error: "Payment signature could not be verified." }, { status: 400 });
  }

  // The signature proves the payment id belongs to this order; amount/status come from Razorpay itself.
  const payment = await provider.fetchPayment(paymentId);
  if (payment.orderId !== orderId || payment.status !== "captured") {
    return NextResponse.json({ error: "Payment is not captured yet." }, { status: 409 });
  }
  const r = await markOrderPaid({
    paymentRef: orderId, paymentId, amountCents: payment.amount, currency: payment.currency,
  });
  return NextResponse.json({ outcome: r.outcome });
}
