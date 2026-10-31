import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Deletes anonymous carts untouched for 45 days (the cart cookie lives 30, so these are unreachable).
 * Signed-in users' carts are kept. cart_lines go with them via ON DELETE CASCADE. Bounded per run.
 */
export async function purgeStaleAnonymousCarts(limit = 1000): Promise<number> {
  const r = await db.execute(sql`
    DELETE FROM carts WHERE id IN (
      SELECT id FROM carts
      WHERE user_id IS NULL AND updated_at < now() - interval '45 days'
      LIMIT ${limit})`);
  return r.rowCount ?? 0;
}
