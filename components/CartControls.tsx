"use client";
import { useState, useTransition } from "react";
import { applyPromo, removeLine, removePromo, updateQty } from "@/app/actions/cart";
import { btnGhost, input, Notice } from "@/components/ui";

export function QtyControls({ variantId, qty, max, name }: { variantId: number; qty: number; max: number; name: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const opts = Math.max(1, Math.min(max, 20));
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <span className="sr-only">Quantity for {name}</span>
        <select
          value={Math.min(qty, opts)} disabled={pending}
          onChange={(e) => start(async () => { const r = await updateQty(variantId, Number(e.target.value)); setErr(r.ok ? null : r.error); })}
          className="rounded-lg border border-line bg-card px-2 py-1.5"
        >
          {Array.from({ length: opts }, (_, i) => i + 1).map((n) => <option key={n}>{n}</option>)}
        </select>
      </label>
      <button type="button" className="text-muted underline hover:text-fg" disabled={pending} aria-label={`Remove ${name}`}
        onClick={() => start(async () => { await removeLine(variantId); })}>
        Remove
      </button>
      {err && <span role="alert" className="text-danger">{err}</span>}
    </div>
  );
}

export function PromoBox({ applied, error }: { applied: string | null; error: string | null }) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(error);
  const [pending, start] = useTransition();

  if (applied) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-line bg-card px-3 py-2 text-sm">
        <span>Code <strong>{applied}</strong> applied{error ? "" : "."}</span>
        <button className="underline" disabled={pending} onClick={() => start(async () => { await removePromo(); setMsg(null); })}>Remove</button>
        {error && <p role="alert" className="basis-full pt-1 text-danger">{error}</p>}
      </div>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!code.trim()) return;
        start(async () => { const r = await applyPromo(code); setMsg(r.ok ? null : r.error); if (r.ok) setCode(""); });
      }}
    >
      <label htmlFor="promo" className="block text-sm font-medium">Promo code</label>
      <div className="flex gap-2">
        <input id="promo" value={code} onChange={(e) => setCode(e.target.value)} className={input} placeholder="e.g. WELCOME10" autoComplete="off" />
        <button className={btnGhost} disabled={pending}>{pending ? "…" : "Apply"}</button>
      </div>
      <div aria-live="polite">{msg && <Notice kind="error">{msg}</Notice>}</div>
    </form>
  );
}
