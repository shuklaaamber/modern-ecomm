import { afterAll, describe, expect, it } from "vitest";
import { eq, like } from "drizzle-orm";
import crypto from "node:crypto";
import { db, pool } from "@/lib/db";
import { orders, products, promoCodes, variants } from "@/db/schema";
import { startCheckout } from "@/lib/checkout";
import { addVariant, setProductDetails, setPromoActive, setVariantPrice } from "@/lib/admin-catalog";
import { resolvePromo } from "@/lib/promo";

// Runs against the DB in DATABASE_URL with uniquely tagged rows that are deleted afterwards.
// (The server actions wrap these functions with requireAdmin; auth itself is covered by lib/auth.)
const TAG = `itest-adm-${crypto.randomBytes(4).toString("hex")}`;
const EMAIL = `${TAG}@example.com`;
const ADDRESS = { name: "Test", phone: "9876543210", line1: "1 Test St", city: "Pune", state: "MH", pincode: "411001" };

async function makeProduct(price = 50000, stock = 5) {
  const [p] = await db.insert(products).values({ slug: `${TAG}-${crypto.randomBytes(3).toString("hex")}`, name: "Admin test", categoryId: 1 }).returning();
  const [v] = await db.insert(variants).values({ productId: p.id, sku: `${p.slug}-sku`, label: "M / Black", priceCents: price, onHand: stock }).returning();
  return { p, v };
}

afterAll(async () => {
  await db.delete(orders).where(eq(orders.email, EMAIL));
  await db.delete(products).where(like(products.slug, `${TAG}%`));
  await db.delete(promoCodes).where(like(promoCodes.code, `${TAG.toUpperCase()}%`));
  await pool.end();
});

describe("admin catalog", () => {
  it("price change applies to new checkouts but not to an existing order", async () => {
    const { v } = await makeProduct(50000, 5);
    const before = await startCheckout({ userId: null, email: EMAIL, address: ADDRESS, lines: [{ variantId: v.id, qty: 1 }], idempotencyKey: crypto.randomUUID() });
    expect(before.amountCents).toBe(50000 + 4900);

    await setVariantPrice(v.id, 30000, 40000);
    const after = await startCheckout({ userId: null, email: EMAIL, address: ADDRESS, lines: [{ variantId: v.id, qty: 1 }], idempotencyKey: crypto.randomUUID() });
    expect(after.amountCents).toBe(30000 + 4900);

    const [old] = await db.select().from(orders).where(eq(orders.number, before.orderNumber));
    expect(old.totalCents).toBe(50000 + 4900); // snapshot unchanged
  });

  it("rejects bad prices (below ₹1, compare-at not above price)", async () => {
    const { v } = await makeProduct();
    await expect(setVariantPrice(v.id, 50, null)).rejects.toThrow(/between/);
    await expect(setVariantPrice(v.id, 10000, 10000)).rejects.toThrow(/higher/);
    await expect(setVariantPrice(999_999_999, 10000, null)).rejects.toThrow(/not found/);
    expect((await db.select().from(variants).where(eq(variants.id, v.id)))[0].priceCents).toBe(50000);
  });

  it("edits product details", async () => {
    const { p } = await makeProduct();
    await setProductDetails(p.id, { name: "Renamed", description: "New text", categoryId: 1 });
    const [row] = await db.select().from(products).where(eq(products.id, p.id));
    expect([row.name, row.description, row.slug]).toEqual(["Renamed", "New text", p.slug]);
  });

  it("adds a variant with stock, and refuses a duplicate size/colour", async () => {
    const { p } = await makeProduct();
    const v = await addVariant(p.id, { size: "XL", color: "Sage Green", priceCents: 69900, compareAtCents: 79900, stock: 7 });
    expect([v.label, v.onHand, v.priceCents, v.options]).toEqual(["XL / Sage Green", 7, 69900, { Color: "Sage Green", Size: "XL" }]);
    await expect(addVariant(p.id, { size: "XL", color: "Sage Green", priceCents: 69900, compareAtCents: null, stock: 1 })).rejects.toThrow(/already exists/);
  });

  it("deactivating a promo blocks it; reactivating restores it", async () => {
    const code = `${TAG.toUpperCase()}-OFF`;
    await db.insert(promoCodes).values({ code, type: "percent", value: 10 });
    await setPromoActive(code, false);
    await expect(resolvePromo(code, 100000)).rejects.toThrow(/expired/);
    await setPromoActive(code, true);
    await expect(resolvePromo(code, 100000)).resolves.toBeDefined();
  });
});
