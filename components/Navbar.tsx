import Link from "next/link";
import { cartItemCount } from "@/lib/cart";
import { getUser } from "@/lib/auth";
import { SignOutButton } from "@/components/SignOutButton";

export async function Navbar() {
  const [count, user] = await Promise.all([cartItemCount(), getUser()]);
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
          {user ? (
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
