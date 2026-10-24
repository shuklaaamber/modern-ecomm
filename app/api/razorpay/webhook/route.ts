import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/payments/razorpay";
import { markOrderPaid } from "@/lib/checkout";

type Entity = { id: string; order_id: string; amount: number; currency: string; status: string };

export async function POST(req: Request) {
  const raw = await req.text(); // signature is over the exact raw body
  if (!verifyWebhookSignature(raw, req.headers.get("x-razorpay-signature"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  const eventId = req.headers.get("x-razorpay-event-id");
  if (!eventId) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  let evt: { event: string; payload?: { payment?: { entity?: Entity } } };
  try {
    evt = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  if (evt.event === "payment.captured" || evt.event === "order.paid") {
    const p = evt.payload?.payment?.entity;
    if (p?.order_id && p.status === "captured") {
      await markOrderPaid({ paymentRef: p.order_id, paymentId: p.id, amountCents: p.amount, currency: p.currency, eventId });
    }
  }
  // payment.failed: the order stays pending so the customer can retry until the reservation expires.
  return NextResponse.json({ ok: true });
}
