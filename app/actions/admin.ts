"use server";
import { eq, sql } from "drizzle-orm";
import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { orderEvents, orders, products, promoCodes, variants } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ADMIN_SETTABLE, assertTransition, type OrderStatus } from "@/lib/orders";
import { cancelPendingOrder } from "@/lib/inventory";
import type { ActionResult } from "@/app/actions/cart";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : "Something went wrong." });

export async function adjustStock(variantId: number, delta: number): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 10_000) throw new Error("Enter a whole number change.");
    // Guarded: stock can't drop below what's already reserved by open checkouts.
    const r = await db.execute(sql`
      UPDATE variants SET on_hand = on_hand + ${delta}
      WHERE id = ${variantId} AND on_hand + ${delta} >= reserved RETURNING id`);
    if (r.rows.length === 0) throw new Error("That would drop stock below what's reserved in open checkouts.");
    revalidatePath("/admin/products");
    revalidatePath("/products", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setProductStatus(productId: number, status: "active" | "archived"): Promise<ActionResult> {
  try {
    await requireAdmin();
    await db.update(products).set({ status }).where(eq(products.id, productId));
    revalidatePath("/admin/products");
    revalidatePath("/products", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const productSchema = z.object({
  name: z.string().trim().min(2).max(120),
  categoryId: z.number().int().positive(),
  price: z.number().positive().max(1_000_000),
  stock: z.number().int().min(0).max(100_000),
  description: z.string().trim().max(2000).default(""),
});

export async function createProduct(input: z.input<typeof productSchema>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const d = productSchema.parse(input);
    const slug = d.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);
    await db.transaction(async (tx) => {
      const [p] = await tx.insert(products).values({ slug, name: d.name, description: d.description, categoryId: d.categoryId, image: `/img/${slug}` }).returning();
      await tx.insert(variants).values({
        productId: p.id, sku: `${slug}-default`, label: "Default / One size", options: { Color: "Default", Size: "One size" },
        priceCents: Math.round(d.price * 100), onHand: d.stock,
      });
    });
    revalidatePath("/admin/products");
    revalidateTag("products", "max");
    return { ok: true, message: "Product created" };
  } catch (e) {
    return fail(e instanceof z.ZodError ? new Error(e.issues[0]?.message) : e);
  }
}

export async function updateOrderStatus(orderId: number, to: OrderStatus): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    if (!ADMIN_SETTABLE.includes(to)) throw new Error("That status can't be set manually.");
    await db.transaction(async (tx) => {
      const [o] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!o) throw new Error("Order not found.");
      if (to === "cancelled" && o.status === "pending") {
        await cancelPendingOrder(tx, orderId, "cancelled", admin.id);
        return;
      }
      assertTransition(o.status as OrderStatus, to);
      await tx.update(orders).set({ status: to }).where(eq(orders.id, orderId));
      await tx.insert(orderEvents).values({ orderId, actorId: admin.id, fromStatus: o.status, toStatus: to });
    });
    revalidatePath("/admin/orders");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const promoSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, "Code: 3-24 letters, numbers, - or _"),
  type: z.enum(["percent", "fixed", "free_shipping"]),
  value: z.number().min(0).max(1_000_000),
  minSubtotal: z.number().min(0),
  maxRedemptions: z.number().int().positive().nullable(),
});

export async function createPromo(input: z.input<typeof promoSchema>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const d = promoSchema.parse(input);
    if (d.type === "percent" && d.value > 100) throw new Error("Percent can't exceed 100.");
    await db.insert(promoCodes).values({
      code: d.code, type: d.type, value: d.type === "fixed" ? Math.round(d.value * 100) : Math.round(d.value),
      minSubtotalCents: Math.round(d.minSubtotal * 100), maxRedemptions: d.maxRedemptions,
    });
    revalidatePath("/admin/promos");
    return { ok: true, message: "Promo created" };
  } catch (e) {
    if ((e as { cause?: { code?: string } })?.cause?.code === "23505") return { ok: false, error: "That code already exists." };
    return fail(e instanceof z.ZodError ? new Error(e.issues[0]?.message) : e);
  }
}
