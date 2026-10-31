import { NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/inventory";
import { purgeStaleAnonymousCarts } from "@/lib/cart-cleanup";
import { log } from "@/lib/logger";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const released = await releaseExpiredReservations();
  // Housekeeping must never fail the reservation release (which the heartbeat monitors).
  const purgedCarts = await purgeStaleAnonymousCarts().catch((err) => {
    log.error("cart purge failed", { err });
    return 0;
  });
  return NextResponse.json({ released, purgedCarts });
}
