import { NextResponse } from "next/server";
import { z } from "zod";
import { startCheckout } from "@/lib/checkout";
import { currentCartId } from "@/lib/cart";
import { getUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { cartLines, carts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { OutOfStockError } from "@/lib/inventory";
import { PromoError } from "@/lib/promo";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/client-ip";
import { log } from "@/lib/logger";

const body = z.object({
  email: z.string().email(),
  idempotencyKey: z.string().min(8).max(100),
  address: z.object({
    name: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
    line1: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(80),
    state: z.string().trim().min(2).max(80),
    pincode: z.string().regex(/^[1-9]\d{5}$/, "Enter a valid 6-digit PIN code"),
  }),
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!(await rateLimit(`checkout:${ip}`, 10, 60_000))) {
    return NextResponse.json({ error: "Too many attempts. Please wait a minute." }, { status: 429 });
  }
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid details." }, { status: 400 });
  }

  // Lines and promo come from the SERVER cart. Any price/total in the request is ignored by design.
  const cartId = await currentCartId();
  if (!cartId) return NextResponse.json({ error: "Your cart is empty." }, { status: 400 });
  const [cart] = await db.select().from(carts).where(eq(carts.id, cartId));
  const lines = await db.select().from(cartLines).where(eq(cartLines.cartId, cartId));
  const user = await getUser();

  try {
    const r = await startCheckout({
      userId: user?.id ?? null,
      email: parsed.data.email,
      address: parsed.data.address,
      lines: lines.map((l) => ({ variantId: l.variantId, qty: l.qty })),
      promoCode: cart?.promoCode,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    return NextResponse.json({ ...r, keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? null });
  } catch (e) {
    if (e instanceof OutOfStockError) return NextResponse.json({ error: e.message, code: "out_of_stock" }, { status: 409 });
    if (e instanceof PromoError) return NextResponse.json({ error: e.message, code: "promo" }, { status: 422 });
    log.error("checkout failed", { err: e });
    // Plain Errors from startCheckout are user-facing; driver errors (wrapped, with a cause) can contain SQL.
    const safe = e instanceof Error && !e.cause ? e.message : "Checkout failed. Please try again.";
    return NextResponse.json({ error: safe }, { status: e instanceof Error && !e.cause ? 400 : 500 });
  }
}
