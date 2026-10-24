"use server";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { products, reviews, wishlistItems } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionResult } from "@/app/actions/cart";

const reviewSchema = z.object({
  productId: z.number().int().positive(),
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(1000),
});

export async function submitReview(input: z.infer<typeof reviewSchema>): Promise<ActionResult> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return { ok: false, error: "Please sign in to leave a review." };
  }
  if (!(await rateLimit(`review:${user.id}`, 5, 60_000))) return { ok: false, error: "Slow down a little and try again." };
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a rating from 1 to 5 (review text up to 1000 characters)." };
  const { productId, rating, body } = parsed.data;

  const verified = await db.execute(sql`
    SELECT 1 FROM orders o JOIN order_lines l ON l.order_id = o.id JOIN variants v ON v.id = l.variant_id
    WHERE o.user_id = ${user.id} AND v.product_id = ${productId}
      AND o.status IN ('paid','fulfilled','shipped','delivered') LIMIT 1`);

  // Review text is stored raw and rendered as plain text by React (escaped); never as HTML.
  await db.transaction(async (tx) => {
    const [prev] = await tx.select().from(reviews).where(and(eq(reviews.productId, productId), eq(reviews.userId, user.id)));
    if (prev) {
      await tx.update(reviews).set({ rating, body, verifiedPurchase: verified.rows.length > 0 }).where(eq(reviews.id, prev.id));
    } else {
      await tx.insert(reviews).values({ productId, userId: user.id, rating, body, verifiedPurchase: verified.rows.length > 0 });
    }
    await tx.execute(sql`
      UPDATE products SET
        rating_count = (SELECT COUNT(*) FROM reviews WHERE product_id = ${productId}),
        rating_sum = (SELECT COALESCE(SUM(rating), 0) FROM reviews WHERE product_id = ${productId})
      WHERE id = ${productId}`);
  });
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId));
  if (p) revalidatePath(`/products/${p.slug}`);
  return { ok: true, message: "Thanks for your review!" };
}

export async function toggleWishlist(productId: number): Promise<ActionResult & { saved?: boolean }> {
  let user;
  try {
    user = await requireUser();
  } catch {
    return { ok: false, error: "Please sign in to save items." };
  }
  const where = and(eq(wishlistItems.userId, user.id), eq(wishlistItems.productId, productId));
  const [existing] = await db.select().from(wishlistItems).where(where);
  if (existing) {
    await db.delete(wishlistItems).where(where);
  } else {
    await db.insert(wishlistItems).values({ userId: user.id, productId }).onConflictDoNothing();
  }
  revalidatePath("/wishlist");
  return { ok: true, saved: !existing };
}
