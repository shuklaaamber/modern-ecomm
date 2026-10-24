import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders } from "@/db/schema";
import { markOrderPaid } from "@/lib/checkout";
import { env } from "@/lib/env";

/** Simulated payment. Hard-disabled unless PAYMENT_PROVIDER=mock. */
export async function POST(req: Request) {
  if (env().PAYMENT_PROVIDER !== "mock") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { providerOrderId } = (await req.json().catch(() => ({}))) as { providerOrderId?: string };
  if (!providerOrderId) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const [o] = await db.select().from(orders).where(eq(orders.paymentRef, providerOrderId));
  if (!o) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const r = await markOrderPaid({
    paymentRef: providerOrderId, paymentId: `mock_pay_${providerOrderId}`, amountCents: o.totalCents, currency: o.currency,
  });
  return NextResponse.json({ outcome: r.outcome });
}
