import "dotenv/config";
import crypto from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { db, pool } from "@/lib/db";
import { account, categories, products, promoCodes, user, variants } from "@/db/schema";
import { eq } from "drizzle-orm";

type Seed = { slug: string; name: string; cat: string; price: number; compareAt?: number; desc: string; options: "size" | "oneSize" | "waist"; colors: string[] };

const CATS = [
  { slug: "t-shirts", name: "T-Shirts" },
  { slug: "hoodies", name: "Hoodies & Sweats" },
  { slug: "bottoms", name: "Bottoms" },
  { slug: "accessories", name: "Accessories" },
];

// Prices in rupees here; stored as paise.
const ITEMS: Seed[] = [
  { slug: "essential-crew-tee", name: "Essential Crew Tee", cat: "t-shirts", price: 599, desc: "180 GSM combed cotton tee with a relaxed fit and reinforced collar.", options: "size", colors: ["White", "Black", "Sage"] },
  { slug: "oversized-drop-tee", name: "Oversized Drop-Shoulder Tee", cat: "t-shirts", price: 799, compareAt: 999, desc: "Heavyweight 240 GSM cotton with a boxy, drop-shoulder cut.", options: "size", colors: ["Off-white", "Charcoal"] },
  { slug: "striped-breton-tee", name: "Striped Breton Tee", cat: "t-shirts", price: 749, desc: "Classic navy and cream stripes in soft ring-spun cotton.", options: "size", colors: ["Navy"] },
  { slug: "pocket-henley", name: "Pocket Henley", cat: "t-shirts", price: 899, desc: "Three-button henley with a chest pocket and garment-washed finish.", options: "size", colors: ["Olive", "Sand"] },
  { slug: "classic-pullover-hoodie", name: "Classic Pullover Hoodie", cat: "hoodies", price: 1799, compareAt: 2199, desc: "Brushed-fleece pullover with a double-lined hood and kangaroo pocket.", options: "size", colors: ["Black", "Heather Grey", "Forest"] },
  { slug: "zip-up-hoodie", name: "Zip-Up Hoodie", cat: "hoodies", price: 1999, desc: "Full-zip hoodie with metal hardware and ribbed cuffs.", options: "size", colors: ["Navy", "Grey"] },
  { slug: "crewneck-sweatshirt", name: "Crewneck Sweatshirt", cat: "hoodies", price: 1499, desc: "Midweight French terry sweatshirt, soft inside, smooth outside.", options: "size", colors: ["Cream", "Rust"] },
  { slug: "quarter-zip-fleece", name: "Quarter-Zip Fleece", cat: "hoodies", price: 2299, desc: "Cosy micro-fleece layer with a stand collar.", options: "size", colors: ["Black"] },
  { slug: "slim-fit-chinos", name: "Slim-Fit Chinos", cat: "bottoms", price: 1599, desc: "Stretch-cotton twill chinos with a tapered leg.", options: "waist", colors: ["Khaki", "Navy"] },
  { slug: "tapered-denim-jeans", name: "Tapered Denim Jeans", cat: "bottoms", price: 1999, compareAt: 2499, desc: "Mid-rise stretch denim in a clean indigo wash.", options: "waist", colors: ["Indigo"] },
  { slug: "jogger-pants", name: "Everyday Joggers", cat: "bottoms", price: 1299, desc: "Soft cotton-blend joggers with zip pockets and a drawcord waist.", options: "size", colors: ["Black", "Grey"] },
  { slug: "linen-shorts", name: "Linen Blend Shorts", cat: "bottoms", price: 999, desc: "Breathable linen-cotton shorts for hot days.", options: "waist", colors: ["Stone", "Navy"] },
  { slug: "canvas-tote", name: "Canvas Tote Bag", cat: "accessories", price: 499, desc: "Sturdy 12 oz canvas tote with an inside pocket.", options: "oneSize", colors: ["Natural", "Black"] },
  { slug: "ribbed-beanie", name: "Ribbed Beanie", cat: "accessories", price: 399, desc: "Stretchy ribbed knit beanie.", options: "oneSize", colors: ["Black", "Mustard"] },
  { slug: "five-panel-cap", name: "Five-Panel Cap", cat: "accessories", price: 549, desc: "Unstructured cotton cap with an adjustable strap.", options: "oneSize", colors: ["Olive", "White"] },
  { slug: "leather-belt", name: "Casual Leather Belt", cat: "accessories", price: 899, desc: "Full-grain leather belt with a matte brushed buckle.", options: "waist", colors: ["Tan"] },
];

const SIZES = ["S", "M", "L", "XL"];
const WAISTS = ["30", "32", "34", "36"];

function stockFor(i: number, j: number) {
  // Deterministic spread, including a couple of low/zero-stock variants to exercise those UI states.
  const base = [12, 8, 15, 6, 20, 3, 10, 0][(i * 3 + j) % 8];
  return base;
}

async function main() {
  await db.insert(categories).values(CATS).onConflictDoNothing();
  const cats = await db.select().from(categories);
  const catId = (slug: string) => cats.find((c) => c.slug === slug)!.id;

  for (const [i, it] of ITEMS.entries()) {
    const [p] = await db
      .insert(products)
      .values({ slug: it.slug, name: it.name, description: it.desc, categoryId: catId(it.cat), image: `/img/${it.slug}` })
      .onConflictDoNothing()
      .returning();
    if (!p) continue; // already seeded
    const sizes = it.options === "size" ? SIZES : it.options === "waist" ? WAISTS : ["One size"];
    const rows = [];
    let j = 0;
    for (const color of it.colors) {
      for (const size of sizes) {
        rows.push({
          productId: p.id,
          sku: `${it.slug}-${color}-${size}`.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          label: `${color} / ${size}`,
          options: { Color: color, [it.options === "waist" ? "Waist" : "Size"]: size },
          priceCents: it.price * 100,
          compareAtCents: it.compareAt ? it.compareAt * 100 : null,
          onHand: stockFor(i, j++),
          reserved: 0,
        });
      }
    }
    await db.insert(variants).values(rows).onConflictDoNothing();
  }

  await db
    .insert(promoCodes)
    .values([
      { code: "WELCOME10", type: "percent", value: 10, minSubtotalCents: 0 },
      { code: "FREESHIP", type: "free_shipping", value: 0, minSubtotalCents: 0 },
      { code: "FLAT200", type: "fixed", value: 20000, minSubtotalCents: 99900 },
    ])
    .onConflictDoNothing();

  // Admin account: password from ADMIN_PASSWORD, otherwise random and printed once.
  const email = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const [existing] = await db.select().from(user).where(eq(user.email, email));
  if (!existing) {
    const password = process.env.ADMIN_PASSWORD ?? crypto.randomBytes(9).toString("base64url");
    const id = crypto.randomUUID();
    await db.insert(user).values({ id, name: "Store Admin", email, emailVerified: true, role: "admin" });
    await db.insert(account).values({ id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(password) });
    console.log(`\nAdmin created: ${email} / ${password}\n(Change this password; it is shown only once.)`);
  }

  console.log("Seed complete.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
