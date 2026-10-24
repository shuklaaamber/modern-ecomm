import Link from "next/link";
import type { ListItem } from "@/lib/catalog";
import { Price, Stars, StockBadge } from "@/components/ui";

/** `level` keeps the heading outline sequential: 2 under a page <h1>, 3 under a section <h2>. */
export function ProductCard({ p, priority = false, level = 3 }: { p: ListItem; priority?: boolean; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <li className="group overflow-hidden rounded-card border border-line bg-card">
      <Link href={`/products/${p.slug}`} className="block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={p.image} alt={`${p.name}`} width={400} height={500}
          loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async"
          className="aspect-[4/5] w-full object-cover transition group-hover:scale-[1.02]"
        />
        <div className="space-y-1 p-3">
          <p className="text-xs text-muted">{p.category}</p>
          <Heading className="font-medium leading-snug">{p.name}</Heading>
          <div className="flex items-center justify-between gap-2">
            <Price cents={p.minPrice} compareAt={p.compareAt} />
            <StockBadge available={p.available} />
          </div>
          <Stars rating={p.rating} count={p.ratingCount} />
        </div>
      </Link>
    </li>
  );
}
