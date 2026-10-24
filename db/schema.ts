import { sql } from "drizzle-orm";
import {
  boolean, check, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique, uniqueIndex,
} from "drizzle-orm/pg-core";

// ---- Better Auth tables (+ role) ----
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("customer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---- Catalog ----
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    categoryId: integer("category_id").notNull().references(() => categories.id),
    status: text("status").notNull().default("active"), // active | archived
    image: text("image").notNull().default(""),
    ratingCount: integer("rating_count").notNull().default(0),
    ratingSum: integer("rating_sum").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("products_category_idx").on(t.categoryId),
    index("products_search_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.name} || ' ' || ${t.description})`,
    ),
  ],
);

export const variants = pgTable(
  "variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    sku: text("sku").notNull().unique(),
    label: text("label").notNull(), // e.g. "M / Black"
    options: jsonb("options").$type<Record<string, string>>().notNull().default({}),
    priceCents: integer("price_cents").notNull(), // paise for INR
    compareAtCents: integer("compare_at_cents"),
    onHand: integer("on_hand").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
  },
  (t) => [
    index("variants_product_idx").on(t.productId),
    check("variants_price_nonneg", sql`${t.priceCents} >= 0`),
    check("variants_on_hand_nonneg", sql`${t.onHand} >= 0`),
    check("variants_reserved_nonneg", sql`${t.reserved} >= 0`),
    check("variants_reserved_le_on_hand", sql`${t.reserved} <= ${t.onHand}`),
  ],
);

// ---- Cart ----
export const carts = pgTable("carts", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  promoCode: text("promo_code"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cartLines = pgTable(
  "cart_lines",
  {
    cartId: text("cart_id").notNull().references(() => carts.id, { onDelete: "cascade" }),
    variantId: integer("variant_id").notNull().references(() => variants.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull(),
  },
  (t) => [primaryKey({ columns: [t.cartId, t.variantId] }), check("cart_qty_pos", sql`${t.qty} > 0`)],
);

// ---- Promos ----
export const promoCodes = pgTable("promo_codes", {
  code: text("code").primaryKey(),
  type: text("type").notNull(), // percent | fixed | free_shipping
  value: integer("value").notNull().default(0),
  minSubtotalCents: integer("min_subtotal_cents").notNull().default(0),
  startsAt: timestamp("starts_at"),
  endsAt: timestamp("ends_at"),
  maxRedemptions: integer("max_redemptions"),
  redeemed: integer("redeemed").notNull().default(0),
});

// ---- Orders ----
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    number: text("number").notNull().unique(),
    userId: text("user_id").references(() => user.id),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending"),
    currency: text("currency").notNull().default("INR"),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    promoCode: text("promo_code"),
    paymentRef: text("payment_ref"), // razorpay order id
    paymentId: text("payment_id"), // razorpay payment id
    idempotencyKey: text("idempotency_key").notNull().unique(),
    shippingAddress: jsonb("shipping_address").$type<Record<string, string>>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("orders_payment_ref_idx").on(t.paymentRef), index("orders_user_idx").on(t.userId)],
);

export const orderLines = pgTable("order_lines", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  variantId: integer("variant_id").notNull().references(() => variants.id),
  name: text("name").notNull(),
  sku: text("sku").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  qty: integer("qty").notNull(),
});

export const reservations = pgTable(
  "reservations",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
    variantId: integer("variant_id").notNull().references(() => variants.id),
    qty: integer("qty").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").notNull().default("active"), // active | committed | released
  },
  (t) => [index("reservations_status_exp_idx").on(t.status, t.expiresAt)],
);

export const orderEvents = pgTable("order_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  actorId: text("actor_id"),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentEvents = pgTable("payment_events", {
  id: text("id").primaryKey(), // X-Razorpay-Event-Id
  processedAt: timestamp("processed_at").notNull().defaultNow(),
});

// ---- Reviews / wishlist ----
export const reviews = pgTable(
  "reviews",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    body: text("body").notNull().default(""),
    verifiedPurchase: boolean("verified_purchase").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("reviews_user_product").on(t.productId, t.userId), check("reviews_rating_range", sql`${t.rating} between 1 and 5`)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);
