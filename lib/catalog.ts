import { sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";

export const PAGE_SIZE = 8;

export type SortKey = "newest" | "price-asc" | "price-desc" | "rating";

export type ListItem = {
  id: number; slug: string; name: string; image: string; category: string;
  minPrice: number; compareAt: number | null; available: number; rating: number; ratingCount: number;
};

const ORDER: Record<SortKey, SQL> = {
  newest: sql`p.created_at DESC, p.id DESC`,
  "price-asc": sql`min_price ASC, p.id`,
  "price-desc": sql`min_price DESC, p.id`,
  rating: sql`(p.rating_sum::float / NULLIF(p.rating_count, 0)) DESC NULLS LAST, p.id`,
};

export async function listProducts(opts: { q?: string; category?: string; sort?: SortKey; page?: number }) {
  const page = Math.max(1, opts.page ?? 1);
  const where: SQL[] = [sql`p.status = 'active'`];
  if (opts.category) where.push(sql`c.slug = ${opts.category}`);
  const q = opts.q?.trim();
  if (q) {
    where.push(sql`(to_tsvector('simple', p.name || ' ' || p.description) @@ plainto_tsquery('simple', ${q})
      OR p.name ILIKE ${"%" + q.replace(/[%_\\]/g, "\\$&") + "%"})`);
  }
  const whereSql = sql.join(where, sql` AND `);
  const orderSql = ORDER[opts.sort ?? "newest"] ?? ORDER.newest;

  const rows = await db.execute(sql`
    SELECT p.id, p.slug, p.name, p.image, c.name AS category, p.rating_sum, p.rating_count,
           MIN(v.price_cents) AS min_price, MAX(v.compare_at_cents) AS compare_at,
           COALESCE(SUM(GREATEST(v.on_hand - v.reserved, 0)), 0) AS available
    FROM products p
    JOIN categories c ON c.id = p.category_id
    JOIN variants v ON v.product_id = p.id
    WHERE ${whereSql}
    GROUP BY p.id, c.name
    ORDER BY ${orderSql}
    LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`);

  const count = await db.execute(sql`
    SELECT COUNT(*) AS n FROM products p JOIN categories c ON c.id = p.category_id WHERE ${whereSql}`);

  const items: ListItem[] = rows.rows.map((r) => ({
    id: Number(r.id), slug: String(r.slug), name: String(r.name), image: String(r.image), category: String(r.category),
    minPrice: Number(r.min_price), compareAt: r.compare_at == null ? null : Number(r.compare_at),
    available: Number(r.available),
    rating: Number(r.rating_count) ? Number(r.rating_sum) / Number(r.rating_count) : 0,
    ratingCount: Number(r.rating_count),
  }));
  const total = Number(count.rows[0]?.n ?? 0);
  return { items, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}
