import Link from "next/link";
import { notFound } from "next/navigation";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user || user.role !== "admin") notFound(); // don't reveal that /admin exists
  return (
    <div className="space-y-6">
      <nav aria-label="Admin" className="flex gap-4 border-b border-line pb-3 text-sm font-medium">
        <Link href="/admin/products" className="hover:underline">Products &amp; stock</Link>
        <Link href="/admin/orders" className="hover:underline">Orders</Link>
        <Link href="/admin/promos" className="hover:underline">Promo codes</Link>
      </nav>
      {children}
    </div>
  );
}
