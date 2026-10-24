import { NextResponse } from "next/server";
import { releaseExpiredReservations } from "@/lib/inventory";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ released: await releaseExpiredReservations() });
}
