import Link from "next/link";
import { btn } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold">We couldn’t find that page</h1>
      <p className="text-muted">The link may be old, or the product may have been removed.</p>
      <Link href="/products" className={btn}>Browse products</Link>
    </div>
  );
}
