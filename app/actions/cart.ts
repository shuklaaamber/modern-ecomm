"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { cartLines, carts, products, variants } from "@/db/schema";
import { getOrCreateCartId, getCartView, mergeAnonymousCart } from "@/lib/cart";
import { PromoError, resolvePromo } from "@/lib/promo";
import { rateLimit } from "@/lib/rate-limit";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const MAX_QTY = 20;
const done = (message?: string): ActionResult => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

export async function addToCart(variantId: number, qty = 1): Promise<ActionResult> {
  if (!Number.isInteger(variantId) || !Number.isInteger(qty) || qty < 1) return { ok: false, error: "Invalid item." };
  const [row] = await db
    .select({ v: variants, p: products })
    .from(variants)
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(variants.id, variantId));
  if (!row || row.p.status !== "active") return { ok: false, error: "This item is no longer available." };
  const available = row.v.onHand - row.v.reserved;
  if (available <= 0) return { ok: false, error: "Sorry, that option is out of stock." };

  const cartId = await getOrCreateCartId();
  const [existing] = await db.select().from(cartLines).where(and(eq(cartLines.cartId, cartId), eq(cartLines.variantId, variantId)));
  const wanted = (existing?.qty ?? 0) + qty;
  const next = Math.min(wanted, available, MAX_QTY);
  await db
    .insert(cartLines)
    .values({ cartId, variantId, qty: next })
    .onConflictDoUpdate({ target: [cartLines.cartId, cartLines.variantId], set: { qty: next } });
  await db.update(carts).set({ updatedAt: new Date() }).where(eq(carts.id, cartId));
  return done(next < wanted ? `Added. Only ${next} available, so that's the most you can have.` : "Added to cart");
}

export async function updateQty(variantId: number, qty: number): Promise<ActionResult> {
  const cartId = await getOrCreateCartId();
  if (!Number.isInteger(qty)) return { ok: false, error: "Invalid quantity." };
  if (qty <= 0) {
    await db.delete(cartLines).where(and(eq(cartLines.cartId, cartId), eq(cartLines.variantId, variantId)));
    return done();
  }
  const [v] = await db.select().from(variants).where(eq(variants.id, variantId));
  const available = v ? Math.max(0, v.onHand - v.reserved) : 0;
  const next = Math.min(qty, MAX_QTY, available);
  if (next <= 0) return { ok: false, error: "Out of stock." };
  await db.update(cartLines).set({ qty: next }).where(and(eq(cartLines.cartId, cartId), eq(cartLines.variantId, variantId)));
  return done(next < qty ? `Only ${next} available.` : undefined);
}

export async function removeLine(variantId: number): Promise<ActionResult> {
  return updateQty(variantId, 0);
}

export async function applyPromo(code: string): Promise<ActionResult> {
  const ip = ((await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local");
  if (!(await rateLimit(`promo:${ip}`, 15, 60_000))) return { ok: false, error: "Too many attempts. Try again in a minute." };
  const cartId = await getOrCreateCartId();
  const view = await getCartView();
  try {
    const p = await resolvePromo(code, view.totals.subtotalCents);
    await db.update(carts).set({ promoCode: p.code }).where(eq(carts.id, cartId));
    return done(`${p.code} applied`);
  } catch (e) {
    if (e instanceof PromoError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function removePromo(): Promise<ActionResult> {
  const cartId = await getOrCreateCartId();
  await db.update(carts).set({ promoCode: null }).where(eq(carts.id, cartId));
  return done();
}

/** Called by the client right after sign-in / sign-up. */
export async function mergeCartAfterSignIn(): Promise<ActionResult> {
  await mergeAnonymousCart();
  return done();
}

export async function clearCart(): Promise<ActionResult> {
  const cartId = await getOrCreateCartId();
  await db.delete(cartLines).where(eq(cartLines.cartId, cartId));
  await db.update(carts).set({ promoCode: null }).where(eq(carts.id, cartId));
  return done();
}

export { sql };
