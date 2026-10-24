import "dotenv/config";
import { and, eq, like } from "drizzle-orm";
import { db, pool } from "@/lib/db";
import { orders } from "@/db/schema";
import { cancelPendingOrder } from "@/lib/inventory";

// Cancels still-pending orders created by the e2e suite (email e2e+...@example.com), releasing their stock.
async function main() {
  const rows = await db.select().from(orders).where(and(like(orders.email, "e2e+%@example.com"), eq(orders.status, "pending")));
  let n = 0;
  for (const o of rows) if (await db.transaction((tx) => cancelPendingOrder(tx, o.id, "cancelled"))) n++;
  console.log(`Released ${n} pending e2e order(s).`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
