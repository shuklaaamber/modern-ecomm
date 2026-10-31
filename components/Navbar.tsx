"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SignOutButton } from "@/components/SignOutButton";
import { NAV_REFRESH } from "@/lib/nav-events";

type NavState = { count: number; user: { role: string } | null };

// Rendered on the client so the layout (and pages) carry no per-visitor data and can be cached.
export function Navbar() {
  const [state, setState] = useState<NavState | null>(null);
  const pathname = usePathname();
  const load = useCallback(() => {
    fetch("/api/nav", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<NavState>) : null))
      .then((d) => d && setState(d))
      .catch(() => {});
  }, []);
  useEffect(load, [load, pathname]);
  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && load();
    window.addEventListener(NAV_REFRESH, load);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener(NAV_REFRESH, load);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
  const count = state?.count ?? 0;
  const user = state?.user ?? null;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <nav aria-label="Main" className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Thread &amp; Co.
        </Link>
        <Link href="/products" className="text-sm hover:underline">Shop</Link>
        <form action="/products" role="search" className="order-last w-full sm:order-none sm:ml-auto sm:w-72">
          <label htmlFor="nav-search" className="sr-only">Search products</label>
          <input
            id="nav-search" name="q" type="search" placeholder="Search tees, hoodies…"
            className="w-full rounded-full border border-line bg-card px-4 py-2 text-sm"
          />
        </form>
        <div className="ml-auto flex items-center gap-4 text-sm sm:ml-0">
          {state === null ? (
            <span className="inline-block h-5 w-16" aria-hidden />
          ) : user ? (
            <>
              <Link href="/orders" className="hover:underline">Orders</Link>
              <Link href="/wishlist" className="hover:underline">Wishlist</Link>
              {user.role === "admin" && <Link href="/admin" className="hover:underline">Admin</Link>}
              <SignOutButton />
            </>
          ) : (
            <Link href="/sign-in" className="hover:underline">Sign in</Link>
          )}
          <Link href="/cart" className="relative rounded-full border border-line bg-card px-4 py-2 font-medium hover:border-accent">
            Cart
            <span aria-live="polite" className="ml-2 inline-flex min-w-6 justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-accent-fg">
              {count}
              <span className="sr-only"> items in cart</span>
            </span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
