import { formatMoney } from "@/lib/money";

export function Price({ cents, compareAt, className = "" }: { cents: number; compareAt?: number | null; className?: string }) {
  return (
    <span className={className}>
      <span className="font-semibold">{formatMoney(cents)}</span>
      {compareAt && compareAt > cents ? (
        <>
          {" "}
          <s className="text-sm text-muted"><span className="sr-only">Was </span>{formatMoney(compareAt)}</s>
        </>
      ) : null}
    </span>
  );
}

export function Stars({ rating, count }: { rating: number; count: number }) {
  if (!count) return <span className="text-xs text-muted">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm" role="img" aria-label={`Rated ${rating.toFixed(1)} out of 5 from ${count} reviews`}>
      <span aria-hidden className="text-warn">{"★".repeat(Math.round(rating))}{"☆".repeat(5 - Math.round(rating))}</span>
      <span aria-hidden className="text-muted">({count})</span>
    </span>
  );
}

export function StockBadge({ available }: { available: number }) {
  if (available <= 0) return <span className="rounded-full bg-line px-2 py-0.5 text-xs font-medium">Sold out</span>;
  if (available <= 5) return <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">Only {available} left</span>;
  return <span className="text-xs text-ok">In stock</span>;
}

export function Notice({ kind = "info", children }: { kind?: "info" | "error" | "success"; children: React.ReactNode }) {
  const tone = kind === "error" ? "border-danger text-danger" : kind === "success" ? "border-ok text-ok" : "border-line text-muted";
  return (
    <p role={kind === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm ${tone}`}>
      {children}
    </p>
  );
}

export const btn =
  "inline-flex items-center justify-center rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center rounded-full border border-line bg-card px-5 py-2.5 text-sm font-medium transition hover:border-accent disabled:opacity-50";
export const input =
  "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm placeholder:text-muted";
