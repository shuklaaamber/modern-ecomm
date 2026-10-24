import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cartLines, carts, products, variants } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { computeTotals, DEFAULT_SHIPPING, type Totals } from "@/lib/pricing";
import { PromoError, resolvePromo } from "@/lib/promo";

const COOKIE = "cart";

function sign(id: string) {
  return crypto.createHmac("sha256", process.env.BETTER_AUTH_SECRET!).update(id).digest("base64url");
}

async function readCookieCartId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, sig] = raw.split(".");
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? id : null;
}

/** Read-only: the current cart id (user cart if signed in, else the signed cookie cart). */
export async function currentCartId(): Promise<string | null> {
  const u = await getUser();
  if (u) {
    const [c] = await db.select().from(carts).where(eq(carts.userId, u.id));
    return c?.id ?? (await readCookieCartId());
  }
  return readCookieCartId();
}

/** Mutations only (server actions / route handlers can set cookies). */
export async function getOrCreateCartId(): Promise<string> {
  const u = await getUser();
  if (u) {
    const [c] = await db.select().from(carts).where(eq(carts.userId, u.id));
    if (c) return c.id;
    const id = crypto.randomUUID();
    await db.insert(carts).values({ id, userId: u.id });
    return id;
  }
  const existing = await readCookieCartId();
  if (existing) {
    const [c] = await db.select().from(carts).where(eq(carts.id, existing));
    if (c) return c.id;
  }
  const id = crypto.randomUUID();
  await db.insert(carts).values({ id });
  (await cookies()).set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  return id;
}

/** Merges an anonymous cookie cart into the signed-in user's cart (sums qty; clamped on read). */
export async function mergeAnonymousCart() {
  const u = await getUser();
  const anonId = await readCookieCartId();
  if (!u || !anonId) return;
  const [anon] = await db.select().from(carts).where(eq(carts.id, anonId));
  if (!anon || anon.userId) return;
  const target = await getOrCreateCartId();
  if (target === anonId) return;
  await db.execute(sql`
    INSERT INTO cart_lines (cart_id, variant_id, qty)
    SELECT ${target}, variant_id, qty FROM cart_lines WHERE cart_id = ${anonId}
    ON CONFLICT (cart_id, variant_id) DO UPDATE SET qty = LEAST(cart_lines.qty + EXCLUDED.qty, 20)`);
  if (anon.promoCode) await db.update(carts).set({ promoCode: anon.promoCode }).where(and(eq(carts.id, target), sql`promo_code IS NULL`));
  await db.delete(carts).where(eq(carts.id, anonId));
  (await cookies()).delete(COOKIE);
}

export type CartLineView = {
  variantId: number;
  qty: number;
  label: string;
  productName: string;
  slug: string;
  image: string;
  unitPriceCents: number;
  available: number;
  problem: string | null;
};

export type CartView = {
  lines: CartLineView[];
  totals: Totals;
  promoCode: string | null;
  promoError: string | null;
  hasProblems: boolean;
  itemCount: number;
};

const EMPTY: Totals = { subtotalCents: 0, discountCents: 0, shippingCents: 0, taxCents: 0, totalCents: 0 };

/** Server-priced view of the cart. Never trusts anything the client sent. */
export async function getCartView(): Promise<CartView> {
  const id = await currentCartId();
  if (!id) return { lines: [], totals: EMPTY, promoCode: null, promoError: null, hasProblems: false, itemCount: 0 };

  const [cart] = await db.select().from(carts).where(eq(carts.id, id));
  const rows = await db
    .select({ cl: cartLines, v: variants, p: products })
    .from(cartLines)
    .innerJoin(variants, eq(variants.id, cartLines.variantId))
    .innerJoin(products, eq(products.id, variants.productId))
    .where(eq(cartLines.cartId, id))
    .orderBy(cartLines.variantId);

  const lines: CartLineView[] = rows.map(({ cl, v, p }) => {
    const available = Math.max(0, v.onHand - v.reserved);
    const problem =
      p.status !== "active" ? "No longer available"
      : available === 0 ? "Out of stock"
      : cl.qty > available ? `Only ${available} left` : null;
    return {
      variantId: v.id, qty: cl.qty, label: v.label, productName: p.name, slug: p.slug, image: p.image,
      unitPriceCents: v.priceCents, available, problem,
    };
  });

  const subtotal = lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
  let promoRule = null;
  let promoError: string | null = null;
  if (cart?.promoCode) {
    try {
      promoRule = (await resolvePromo(cart.promoCode, subtotal)).rule;
    } catch (e) {
      if (e instanceof PromoError) promoError = e.message;
      else throw e;
    }
  }
  const totals = computeTotals({ lines, promo: promoRule, shipping: DEFAULT_SHIPPING });
  return {
    lines, totals, promoCode: cart?.promoCode ?? null, promoError,
    hasProblems: lines.some((l) => l.problem), itemCount: lines.reduce((s, l) => s + l.qty, 0),
  };
}

export async function cartItemCount(): Promise<number> {
  const id = await currentCartId();
  if (!id) return 0;
  const r = await db.execute(sql`SELECT COALESCE(SUM(qty), 0) AS n FROM cart_lines WHERE cart_id = ${id}`);
  return Number(r.rows[0]?.n ?? 0);
}

export { inArray };
