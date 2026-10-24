"use client";
import { useState, useTransition } from "react";
import { addToCart } from "@/app/actions/cart";
import { toggleWishlist } from "@/app/actions/engage";
import { formatMoney } from "@/lib/money";
import { btn, btnGhost, Notice, StockBadge } from "@/components/ui";

export type VariantOption = {
  id: number; label: string; color: string; size: string; priceCents: number; compareAt: number | null; available: number;
};

export function AddToCart({ variants, productId, initiallySaved }: { variants: VariantOption[]; productId: number; initiallySaved: boolean }) {
  const colors = [...new Set(variants.map((v) => v.color))];
  const first = variants.find((v) => v.available > 0) ?? variants[0];
  const [color, setColor] = useState(first.color);
  const [variantId, setVariantId] = useState<number | null>(first.available > 0 ? first.id : null);
  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [saved, setSaved] = useState(initiallySaved);
  const [pending, start] = useTransition();

  const sizes = variants.filter((v) => v.color === color);
  const selected = variants.find((v) => v.id === variantId) ?? null;
  const max = selected ? Math.min(selected.available, 20) : 1;

  return (
    <div className="space-y-5">
      {colors.length > 1 && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Colour: <span className="text-muted">{color}</span></legend>
          <div className="flex flex-wrap gap-2">
            {colors.map((c) => {
              const any = variants.some((v) => v.color === c && v.available > 0);
              return (
                <button
                  key={c} type="button" aria-pressed={c === color}
                  onClick={() => {
                    setColor(c);
                    const next = variants.find((v) => v.color === c && v.available > 0);
                    setVariantId(next?.id ?? null);
                    setQty(1);
                  }}
                  className={`rounded-full border px-4 py-1.5 text-sm ${c === color ? "border-accent bg-accent text-accent-fg" : "border-line bg-card"} ${any ? "" : "line-through opacity-60"}`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{sizes[0]?.size === "One size" ? "Size" : "Choose a size"}</legend>
        <div className="flex flex-wrap gap-2">
          {sizes.map((v) => {
            const out = v.available <= 0;
            return (
              <button
                key={v.id} type="button" disabled={out} aria-pressed={v.id === variantId}
                aria-label={out ? `${v.size}, sold out` : v.size}
                onClick={() => { setVariantId(v.id); setQty(1); setMsg(null); }}
                className={`min-w-12 rounded-lg border px-3 py-2 text-sm ${v.id === variantId ? "border-accent bg-accent text-accent-fg" : "border-line bg-card"} ${out ? "cursor-not-allowed line-through opacity-50" : ""}`}
              >
                {v.size}
              </button>
            );
          })}
        </div>
      </fieldset>

      {selected && (
        <p className="flex items-center gap-3 text-sm">
          <span className="font-semibold">{formatMoney(selected.priceCents)}</span>
          <StockBadge available={selected.available} />
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Qty
          <select
            value={qty} onChange={(e) => setQty(Number(e.target.value))} disabled={!selected}
            className="rounded-lg border border-line bg-card px-2 py-2"
          >
            {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
          </select>
        </label>
        <button
          type="button" className={btn} disabled={!selected || pending}
          onClick={() =>
            start(async () => {
              const r = await addToCart(selected!.id, qty);
              setMsg(r.ok ? { kind: "success", text: r.message ?? "Added to cart" } : { kind: "error", text: r.error });
            })
          }
        >
          {pending ? "Adding…" : selected ? "Add to cart" : "Select an in-stock size"}
        </button>
        <button
          type="button" className={btnGhost} aria-pressed={saved}
          onClick={() =>
            start(async () => {
              const r = await toggleWishlist(productId);
              if (r.ok) setSaved(!!r.saved);
              else setMsg({ kind: "error", text: r.error });
            })
          }
        >
          {saved ? "♥ Saved" : "♡ Save"}
        </button>
      </div>
      <div aria-live="polite" className="min-h-10">{msg && <Notice kind={msg.kind}>{msg.text}</Notice>}</div>
    </div>
  );
}
