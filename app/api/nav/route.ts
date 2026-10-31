import { NextResponse } from "next/server";
import { cartItemCount } from "@/lib/cart";
import { getUser } from "@/lib/auth";

// Per-visitor navbar state (cart count, signed-in role). Lives outside the page render so pages can be cached.
export async function GET(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const headers = { "Cache-Control": "private, no-store" };
  // Anonymous visitor with no cart or session cookie: answer without touching the database.
  if (!/(^|;\s*)(cart=|(__Secure-)?better-auth\.session_token=)/.test(cookie)) {
    return NextResponse.json({ count: 0, user: null }, { headers });
  }
  const [count, user] = await Promise.all([cartItemCount(), getUser()]);
  return NextResponse.json({ count, user: user ? { role: user.role } : null }, { headers });
}
