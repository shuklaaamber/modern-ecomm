import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { promoCodes } from "@/db/schema";
import type { PromoRule } from "@/lib/pricing";

export class PromoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromoError";
  }
}

export type ResolvedPromo = { code: string; rule: PromoRule; maxRedemptions: number | null };

/** Read-only validation (used for cart display). The atomic claim happens inside checkout. */
export async function resolvePromo(rawCode: string, subtotalCents: number): Promise<ResolvedPromo> {
  const code = rawCode.trim().toUpperCase();
  const [p] = await db.select().from(promoCodes).where(eq(promoCodes.code, code));
  const now = new Date();
  if (!p) throw new PromoError("That code isn't valid.");
  if (p.startsAt && p.startsAt > now) throw new PromoError("That code isn't active yet.");
  if (p.endsAt && p.endsAt < now) throw new PromoError("That code has expired.");
  if (p.maxRedemptions != null && p.redeemed >= p.maxRedemptions) throw new PromoError("That code has been fully redeemed.");
  if (subtotalCents < p.minSubtotalCents) {
    throw new PromoError(`Spend at least ₹${Math.ceil(p.minSubtotalCents / 100)} to use ${p.code}.`);
  }
  return {
    code: p.code,
    maxRedemptions: p.maxRedemptions,
    rule: { type: p.type as PromoRule["type"], value: p.value, minSubtotalCents: p.minSubtotalCents },
  };
}
